import { supabase } from "@/lib/supabase";

export type Template = {
  id: string;
  name: string;
  image: string; // URL pública da imagem
  downloadUrlPc: string;
  downloadUrlMobile: string;
};

// Event bus para avisar os componentes sobre mudanças
const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((l) => l());
}

export function subscribeTemplates(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export async function fetchTemplates(): Promise<Template[]> {
  const { data, error } = await supabase
    .from("templates")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching templates:", error);
    return [];
  }
  return data || [];
}

// Para manter compatibilidade com componentes que ainda não usam fetchTemplates (retorna vazio)
export function getTemplates(): Template[] {
  return [];
}

/**
 * Faz upload de imagem base64 pro Supabase Storage.
 */
async function uploadTemplateImage(base64: string, templateId: string): Promise<string | null> {
  if (!base64.startsWith("data:image")) return base64; 

  try {
    const response = await fetch(base64);
    const blob = await response.blob();
    const ext = blob.type.split("/")[1] || "png";
    const filename = `${templateId}-${Date.now()}.${ext}`;

    const { data, error } = await supabase.storage
      .from("templates")
      .upload(filename, blob, { upsert: true });

    if (error) {
      console.error("Erro no upload da imagem do template:", error);
      return null;
    }

    const { data: publicUrlData } = supabase.storage
      .from("templates")
      .getPublicUrl(data.path);

    return publicUrlData.publicUrl;
  } catch (err) {
    console.error("Failed to upload template image:", err);
    return null;
  }
}

export async function createTemplate(data: Omit<Template, "id"> & { id?: string }): Promise<Template | null> {
  const id = data.id || crypto.randomUUID();
  let image = data.image;

  if (image && image.startsWith("data:image")) {
    const uploadedUrl = await uploadTemplateImage(image, id);
    if (uploadedUrl) image = uploadedUrl;
  }

  const { data: inserted, error } = await supabase
    .from("templates")
    .insert([{ ...data, id, image }])
    .select()
    .single();

  if (error) {
    console.error("Erro ao criar template:", error);
    return null;
  }
  notify();
  return inserted;
}

export async function updateTemplate(id: string, data: Partial<Template>): Promise<Template | null> {
  let image = data.image;

  if (image && image.startsWith("data:image")) {
    const uploadedUrl = await uploadTemplateImage(image, id);
    if (uploadedUrl) image = uploadedUrl;
  }

  const { data: updated, error } = await supabase
    .from("templates")
    .update({ ...data, image })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Erro ao atualizar template:", error);
    return null;
  }
  notify();
  return updated;
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from("templates").delete().eq("id", id);
  if (error) {
    console.error("Erro ao deletar template:", error);
  } else {
    notify();
  }
}
