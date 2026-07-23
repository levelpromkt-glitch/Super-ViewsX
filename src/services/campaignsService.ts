/**
 * Service de campanhas.
 *
 * Hoje: lê/escreve no localStorage (mock).
 * Futuro: substituir a implementação por chamadas ao Supabase/API sem
 * mudar a interface pública abaixo — os componentes consomem só este service.
 *
 * Para conectar com backend depois:
 *   - getCampaigns        -> SELECT * FROM campaigns
 *   - getCampaignById     -> SELECT ... WHERE id = ?
 *   - createCampaign      -> INSERT INTO campaigns
 *   - updateCampaign      -> UPDATE campaigns SET ... WHERE id = ?
 *   - deleteCampaign      -> DELETE FROM campaigns WHERE id = ?
 *
 * A capa (coverImage) hoje é data URL/base64. No backend vira URL de Storage.
 */
import type { Campaign } from "@/lib/types";
import {
  deleteCampaign as _delete,
  fetchCampaigns,
  getCampaigns as _getAll,
  newCampaignId,
  resetCampaigns as _reset,
  saveCampaign,
  subscribeCampaigns,
} from "@/lib/campaigns";

export function getCampaigns(): Campaign[] {
  return _getAll();
}

export function getCampaignById(id: string): Campaign | undefined {
  return _getAll().find((c) => c.id === id);
}

export function createCampaign(data: Omit<Campaign, "id"> & { id?: string }): Campaign {
  const campaign: Campaign = { ...data, id: data.id || newCampaignId() };
  saveCampaign(campaign);
  return campaign;
}

export function updateCampaign(id: string, data: Partial<Campaign>): Campaign | null {
  const existing = getCampaignById(id);
  if (!existing) return null;
  const updated = { ...existing, ...data, id };
  saveCampaign(updated);
  return updated;
}

export function deleteCampaign(id: string): void {
  _delete(id);
}

export function resetCampaigns(): void {
  _reset();
}

export { fetchCampaigns, subscribeCampaigns, newCampaignId };
