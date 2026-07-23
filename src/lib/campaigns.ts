import type { Campaign } from "./types";

const STORAGE_KEY = "svx.campaigns.v1";

const SEED: Campaign[] = [
  { id: "1", name: "Athleta", sub: "RPM", format: "RPM", platforms: ["TikTok", "YouTube", "Instagram"], budget: "R$ 25.000", promoter: "Keoto", status: "Ativa", description: "Campanha de cortes para a marca Athleta. Conteúdo esportivo e lifestyle, com alta demanda por cortes dinâmicos e energéticos.", signupLink: "https://athleta.com.br/campanha" },
  { id: "2", name: "CPMV", sub: "RANKING", format: "RANKING", platforms: ["YouTube", "Instagram"], budget: "R$ 42.000", promoter: "HyperX", status: "Ativa", description: "Ranking de cortes para o canal CPMV. Produza cortes de gameplay e momentos épicos para concorrer a prêmios semanais.", signupLink: "https://cpmv.com.br/ranking" },
  { id: "3", name: "Zé Neto & Cristiano", sub: "Fama de Louco", format: "RPM", platforms: ["TikTok", "YouTube"], budget: "R$ 15.000", promoter: "Clipay", status: "Ativa", description: "Cortes de bastidores e melhores momentos do show da dupla Zé Neto & Cristiano. Foco em humor e interação com fãs.", signupLink: "https://clipei.com/zeneto" },
  { id: "4", name: "IronTalks", sub: "IronTalks", format: "RPM", platforms: ["YouTube", "Instagram", "TikTok"], budget: "R$ 32.500", promoter: "Viewzbrazil", status: "Ativa", description: "Podcast de empreendedorismo e tecnologia. Cortes de entrevistas e momentos de impacto para engajar a audiência.", signupLink: "https://irontalks.com/cortes" },
  { id: "5", name: "3IPHONES 15PROMAX", sub: "RPM", format: "RPM", platforms: ["TikTok", "Instagram"], budget: "R$ 28.000", promoter: "HyperX", status: "Ativa", description: "Lançamento do novo iPhone 15 Pro Max. Cortes de reviews, unboxing e comparações para gerar buzz.", signupLink: "https://3iphones.com/15promax" },
  { id: "6", name: "Rodrigo Manga", sub: "Ranking Final", format: "RANKING", platforms: ["YouTube", "TikTok"], budget: "R$ 19.000", promoter: "Keoto", status: "Ativa", description: "Ranking final de cortes de animação e mangá. Participe com seus melhores cortes de cenas épicas.", signupLink: "https://rodrigomanga.com/ranking" },
  { id: "7", name: "Clayton & Romario", sub: "Calma Ai, Campeao", format: "RPM", platforms: ["TikTok", "YouTube", "Instagram"], budget: "R$ 22.500", promoter: "Clipay", status: "Ativa", description: "Cortes de futebol com foco em lances descontraídos e entrevistas de jogadores. Conteúdo leve e divertido.", signupLink: "https://clipei.com/claytonromario" },
];

const listeners = new Set<() => void>();

function read(): Campaign[] {
  if (typeof window === "undefined") return SEED;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED));
      return SEED;
    }
    return JSON.parse(raw) as Campaign[];
  } catch {
    return SEED;
  }
}

function write(list: Campaign[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  listeners.forEach((l) => l());
}

export function subscribeCampaigns(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export async function fetchCampaigns(): Promise<Campaign[]> {
  return read();
}

export function getCampaigns(): Campaign[] {
  return read();
}

export function saveCampaign(c: Campaign): void {
  const list = read();
  const idx = list.findIndex((x) => x.id === c.id);
  if (idx >= 0) list[idx] = c;
  else list.push(c);
  write(list);
}

export function deleteCampaign(id: string): void {
  write(read().filter((c) => c.id !== id));
}

export function resetCampaigns(): void {
  write(SEED);
}

export function newCampaignId(): string {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
