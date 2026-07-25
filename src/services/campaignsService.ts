import { supabase } from "@/lib/supabase";
import type { Campaign } from "@/lib/types";

// Event bus para avisar os componentes sobre mudanças
const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((l) => l());
}

export function subscribeCampaigns(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export async function fetchCampaigns(): Promise<Campaign[]> {
  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching campaigns:", error);
    return [];
  }
  return data || [];
}

// Retro-compatibilidade (vai retornar vazio, componentes devem usar fetchCampaigns)
export function getCampaigns(): Campaign[] {
  return [];
}

export async function getCampaignById(id: string): Promise<Campaign | undefined> {
  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return undefined;
  return data;
}

/**
 * Faz upload de imagem base64 pro Supabase Storage.
 */
async function uploadCoverImage(base64: string, campaignId: string): Promise<string | null> {
  if (!base64.startsWith("data:image")) return base64; 

  try {
    const response = await fetch(base64);
    const blob = await response.blob();
    const ext = blob.type.split("/")[1] || "png";
    const filename = `${campaignId}-${Date.now()}.${ext}`;

    const { data, error } = await supabase.storage
      .from("campaigns")
      .upload(filename, blob, { upsert: true });

    if (error) {
      console.error("Erro no upload da imagem:", error);
      return null;
    }

    const { data: publicUrlData } = supabase.storage
      .from("campaigns")
      .getPublicUrl(data.path);

    return publicUrlData.publicUrl;
  } catch (err) {
    console.error("Failed to upload image:", err);
    return null;
  }
}

export async function createCampaign(data: Omit<Campaign, "id"> & { id?: string }): Promise<Campaign | null> {
  const id = data.id || crypto.randomUUID();
  let coverImage = data.coverImage;

  if (coverImage && coverImage.startsWith("data:image")) {
    const uploadedUrl = await uploadCoverImage(coverImage, id);
    if (uploadedUrl) coverImage = uploadedUrl;
  }

  const { data: inserted, error } = await supabase
    .from("campaigns")
    .insert([{ ...data, id, coverImage }])
    .select()
    .single();

  if (error) {
    console.error("Erro ao criar campanha:", error);
    return null;
  }
  notify();
  return inserted;
}

export async function updateCampaign(id: string, data: Partial<Campaign>): Promise<Campaign | null> {
  let coverImage = data.coverImage;

  if (coverImage && coverImage.startsWith("data:image")) {
    const uploadedUrl = await uploadCoverImage(coverImage, id);
    if (uploadedUrl) coverImage = uploadedUrl;
  }

  const { data: updated, error } = await supabase
    .from("campaigns")
    .update({ ...data, coverImage })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Erro ao atualizar campanha:", error);
    return null;
  }
  notify();
  return updated;
}

export async function deleteCampaign(id: string): Promise<void> {
  const { error } = await supabase.from("campaigns").delete().eq("id", id);
  if (error) {
    console.error("Erro ao deletar campanha:", error);
  } else {
    notify();
  }
}

export function resetCampaigns(): void {
  console.warn("resetCampaigns is not supported in Supabase mode.");
}

export function newCampaignId(): string {
  return crypto.randomUUID();
}
