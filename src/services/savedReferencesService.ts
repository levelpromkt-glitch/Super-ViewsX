import { supabase } from "@/lib/supabase";

export type SavedReference = {
  id: string;
  platform: string;
  external_id: string;
  title: string | null;
  url: string;
  thumbnail: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  hashtag: string | null;
  created_at: string;
};

export class SavedReferencesError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "SavedReferencesError";
  }
}

// Bookmarks for videos found via Pesquisar Hashtag — these are OTHER
// creators' published videos kept as inspiration reference, distinct from
// saved_clips (which are cuttable moments from the user's own source video
// meant to go through the Editor). Kept in their own table so the Biblioteca
// page can show "seus clipes" and "referências salvas" as separate lists.
export const SavedReferencesService = {
  async save(ref: {
    platform: string;
    externalId: string;
    title?: string | null;
    url: string;
    thumbnail?: string | null;
    views?: number | null;
    likes?: number | null;
    comments?: number | null;
    hashtag?: string | null;
  }): Promise<string> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new SavedReferencesError("Sessão inválida.", "UNAUTHENTICATED");

    const { data, error } = await supabase
      .from("saved_references")
      .insert({
        user_id: user.id,
        platform: ref.platform,
        external_id: ref.externalId,
        title: ref.title || null,
        url: ref.url,
        thumbnail: ref.thumbnail || null,
        views: ref.views ?? null,
        likes: ref.likes ?? null,
        comments: ref.comments ?? null,
        hashtag: ref.hashtag || null,
      })
      .select("id")
      .single();
    if (error) throw new SavedReferencesError(error.message, "INSERT_FAILED");
    return data.id as string;
  },

  async list(): Promise<SavedReference[]> {
    const { data, error } = await supabase
      .from("saved_references")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new SavedReferencesError(error.message, "QUERY_FAILED");
    return (data || []) as SavedReference[];
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from("saved_references").delete().eq("id", id);
    if (error) throw new SavedReferencesError(error.message, "DELETE_FAILED");
  },

  async removeByExternalId(platform: string, externalId: string): Promise<void> {
    const { error } = await supabase
      .from("saved_references")
      .delete()
      .eq("platform", platform)
      .eq("external_id", externalId);
    if (error) throw new SavedReferencesError(error.message, "DELETE_FAILED");
  },
};
