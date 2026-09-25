import { supabase } from "@/lib/supabase";

export type SavedClipSource = { videoId: string } | { r2Key: string };

export type SavedClip = {
  id: string;
  source: SavedClipSource;
  start_sec: number;
  end_sec: number;
  title: string;
  profile: string | null;
  score: number | null;
  thumbnail: string | null;
  created_at: string;
};

export class SavedClipsError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "SavedClipsError";
  }
}

export const SavedClipsService = {
  async save(clip: {
    source: SavedClipSource;
    start: number;
    end: number;
    title: string;
    profile?: string;
    score?: number;
    thumbnail?: string | null;
  }): Promise<string> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new SavedClipsError("Sessão inválida.", "UNAUTHENTICATED");

    const { data, error } = await supabase
      .from("saved_clips")
      .insert({
        user_id: user.id,
        source: clip.source,
        start_sec: clip.start,
        end_sec: clip.end,
        title: clip.title,
        profile: clip.profile || null,
        score: clip.score ?? null,
        thumbnail: clip.thumbnail || null,
      })
      .select("id")
      .single();
    if (error) throw new SavedClipsError(error.message, "INSERT_FAILED");
    return data.id as string;
  },

  async get(id: string): Promise<SavedClip> {
    const { data, error } = await supabase.from("saved_clips").select("*").eq("id", id).single();
    if (error || !data) throw new SavedClipsError(error?.message || "Momento não encontrado.", "NOT_FOUND");
    return data as SavedClip;
  },

  async list(): Promise<SavedClip[]> {
    const { data, error } = await supabase
      .from("saved_clips")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new SavedClipsError(error.message, "QUERY_FAILED");
    return (data || []) as SavedClip[];
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from("saved_clips").delete().eq("id", id);
    if (error) throw new SavedClipsError(error.message, "DELETE_FAILED");
  },
};
