import { supabase } from "@/lib/supabase";
import { readEdgeFunctionErrorMessage } from "@/lib/edgeFunctionError";
import type { SocialPlatform } from "./socialAccountsService";

export type PostStatus = "pending" | "processing" | "posted" | "failed" | "canceled";

export type ScheduledPost = {
  id: string;
  platform: SocialPlatform;
  account_id: string | null;
  video_url: string;
  caption: string | null;
  scheduled_at: string;
  status: PostStatus;
  platform_post_id: string | null;
  error_message: string | null;
  created_at: string;
};

export class PostsError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "PostsError";
  }
}

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024; // 200MB — final clips meant for publishing.
// Source videos analyzed for Melhores Momentos can be a full podcast/episode,
// so they get a much higher ceiling (matches the post-videos bucket's own limit).
export const MAX_SOURCE_VIDEO_BYTES = 2 * 1024 * 1024 * 1024; // 2GB

export const PostsService = {
  async uploadVideo(file: File, maxBytes: number = MAX_UPLOAD_BYTES): Promise<string> {
    if (file.size > maxBytes) {
      const maxMb = Math.round(maxBytes / (1024 * 1024));
      throw new PostsError(`O vídeo excede o limite de ${maxMb}MB.`, "FILE_TOO_LARGE");
    }
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new PostsError("Sessão inválida.", "UNAUTHENTICATED");
    }

    const ext = file.name.split(".").pop() || "mp4";
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

    const { error } = await supabase.storage.from("post-videos").upload(path, file, {
      contentType: file.type || "video/mp4",
    });
    if (error) throw new PostsError(error.message, "UPLOAD_FAILED");

    return path;
  },

  async publishNow(accountId: string, storagePath: string, caption: string): Promise<string> {
    const { data, error } = await supabase.functions.invoke("tiktok-publish-upload", {
      body: { accountId, storagePath, caption },
    });
    if (error) {
      const message = await readEdgeFunctionErrorMessage(error, "Erro ao publicar no TikTok.");
      throw new PostsError(message, "FUNCTION_ERROR");
    }
    if (!data?.success) {
      throw new PostsError(data?.message || "Erro ao publicar no TikTok.", data?.code || "UNKNOWN_ERROR");
    }
    return data.publishId as string;
  },

  async schedulePost(accountId: string, storagePath: string, caption: string, scheduledAt: Date): Promise<void> {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new PostsError("Sessão inválida.", "UNAUTHENTICATED");

    const { error } = await supabase.from("scheduled_posts").insert({
      user_id: user.id,
      platform: "tiktok",
      account_id: accountId,
      video_url: storagePath,
      caption,
      scheduled_at: scheduledAt.toISOString(),
      status: "pending",
    });
    if (error) throw new PostsError(error.message, "INSERT_FAILED");
  },

  async listPosts(): Promise<ScheduledPost[]> {
    const { data, error } = await supabase
      .from("scheduled_posts")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new PostsError(error.message, "QUERY_FAILED");
    return (data || []) as ScheduledPost[];
  },

  async cancelPost(id: string): Promise<void> {
    const { error } = await supabase.from("scheduled_posts").delete().eq("id", id);
    if (error) throw new PostsError(error.message, "DELETE_FAILED");
  },
};
