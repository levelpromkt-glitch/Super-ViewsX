// Frontend-only templates service backed by localStorage.
export type Template = {
  id: string;
  name: string;
  image: string; // data URL or external URL
  downloadUrl: string;
};

const STORAGE_KEY = "superviewsx.templates.v1";
const listeners = new Set<() => void>();

const SEED: Template[] = [
  {
    id: "t-seed-1",
    name: "Corte Viral Neon",
    image:
      "https://images.unsplash.com/photo-1614680376573-df3480f0c6ff?w=800&q=80",
    downloadUrl: "https://example.com/template-neon.zip",
  },
  {
    id: "t-seed-2",
    name: "Clipe Minimal Dark",
    image:
      "https://images.unsplash.com/photo-1620207418302-439b387441b0?w=800&q=80",
    downloadUrl: "https://example.com/template-minimal.zip",
  },
  {
    id: "t-seed-3",
    name: "Reels Energético",
    image:
      "https://images.unsplash.com/photo-1611162616475-46b635cb6868?w=800&q=80",
    downloadUrl: "https://example.com/template-energy.zip",
  },
];

function read(): Template[] {
  if (typeof window === "undefined") return SEED;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED));
      return SEED;
    }
    return JSON.parse(raw) as Template[];
  } catch {
    return SEED;
  }
}

function write(list: Template[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  listeners.forEach((fn) => fn());
}

export function getTemplates(): Template[] {
  return read();
}

export function createTemplate(t: Omit<Template, "id">): Template {
  const list = read();
  const next: Template = { ...t, id: `t-${Date.now()}` };
  write([next, ...list]);
  return next;
}

export function updateTemplate(id: string, patch: Partial<Template>) {
  const list = read().map((t) => (t.id === id ? { ...t, ...patch } : t));
  write(list);
}

export function deleteTemplate(id: string) {
  write(read().filter((t) => t.id !== id));
}

export function subscribeTemplates(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
