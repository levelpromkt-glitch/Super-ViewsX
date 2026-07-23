import { useEffect, useRef, useState } from "react";
import { X, Upload, Image as ImageIcon, Trash } from "lucide-react";
import type { Campaign } from "@/lib/types";
import { newCampaignId } from "@/services/campaignsService";

const ALL_PLATFORMS = ["TikTok", "YouTube", "Instagram"] as const;
const FORMATS = ["RPM", "RANKING"] as const;
const STATUSES = ["Ativa", "Pausada", "Encerrada"] as const;

// Limite do mock para evitar localStorage gigante.
// No futuro, com Storage real, este limite some.
const MAX_COVER_BYTES = 1.5 * 1024 * 1024; // 1.5MB

function empty(): Campaign {
  return {
    id: newCampaignId(),
    name: "",
    sub: "",
    format: "RPM",
    platforms: ["TikTok"],
    budget: "R$ 0",
    promoter: "",
    status: "Ativa",
    description: "",
    signupLink: "",
    coverImage: undefined,
  };
}

export function CampaignFormModal({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: Campaign | null;
  onClose: () => void;
  onSave: (c: Campaign) => void;
}) {
  const [form, setForm] = useState<Campaign>(empty());
  const [coverError, setCoverError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setForm(initial ? { ...initial } : empty());
      setCoverError(null);
    }
  }, [open, initial]);

  if (!open) return null;

  const togglePlatform = (p: string) => {
    setForm((f) => ({
      ...f,
      platforms: f.platforms.includes(p)
        ? f.platforms.filter((x) => x !== p)
        : [...f.platforms, p],
    }));
  };

  // Mock: salva a imagem como data URL no próprio objeto da campanha.
  // No futuro: subir para Supabase Storage e salvar apenas a URL pública em coverImage.
  const handleCoverChange = (file: File | null) => {
    setCoverError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setCoverError("Selecione um arquivo de imagem.");
      return;
    }
    if (file.size > MAX_COVER_BYTES) {
      setCoverError("Imagem muito grande (limite 1.5MB no modo mock).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm((f) => ({ ...f, coverImage: String(reader.result) }));
    };
    reader.readAsDataURL(file);
  };

  const clearCover = () => {
    setForm((f) => ({ ...f, coverImage: undefined }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave({ ...form, name: form.name.trim(), promoter: form.promoter.trim() });
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal-header">
          <h3>{initial ? "Editar campanha" : "Nova campanha"}</h3>
          <button className="admin-icon-btn" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <form className="admin-form" onSubmit={submit}>
          <div className="admin-cover-field">
            <span className="admin-cover-label">Capa da campanha</span>
            <div className={`admin-cover-preview${form.coverImage ? " has-image" : ""}`}>
              {form.coverImage ? (
                <img src={form.coverImage} alt="Capa da campanha" />
              ) : (
                <div className="admin-cover-empty">
                  <ImageIcon size={28} />
                  <span>Nenhuma capa selecionada</span>
                </div>
              )}
            </div>
            <div className="admin-cover-actions">
              <button
                type="button"
                className="btn-outline"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={14} /> {form.coverImage ? "Trocar capa" : "Anexar imagem"}
              </button>
              {form.coverImage && (
                <button type="button" className="btn-outline admin-cover-remove" onClick={clearCover}>
                  <Trash size={14} /> Remover
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => handleCoverChange(e.target.files?.[0] ?? null)}
              />
            </div>
            {coverError && <div className="admin-cover-error">{coverError}</div>}
            <div className="admin-cover-hint">
              Mock: a imagem fica salva localmente (base64). Quando integrar com banco/storage, este campo vira a URL pública.
            </div>
          </div>
          <div className="admin-form-grid">
            <label className="admin-field">
              <span>Nome da campanha</span>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Athleta"
                required
              />
            </label>
            <label className="admin-field">
              <span>Subtítulo</span>
              <input
                value={form.sub}
                onChange={(e) => setForm({ ...form, sub: e.target.value })}
                placeholder="Ex: RPM Premium"
              />
            </label>
            <label className="admin-field">
              <span>Tipo</span>
              <select
                value={form.format}
                onChange={(e) => setForm({ ...form, format: e.target.value })}
              >
                {FORMATS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </label>
            <label className="admin-field">
              <span>Status</span>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="admin-field">
              <span>Orçamento</span>
              <input
                value={form.budget}
                onChange={(e) => setForm({ ...form, budget: e.target.value })}
                placeholder="R$ 25.000"
              />
            </label>
            <label className="admin-field">
              <span>Promotor</span>
              <input
                value={form.promoter}
                onChange={(e) => setForm({ ...form, promoter: e.target.value })}
                placeholder="Ex: Keoto"
              />
            </label>
            <div className="admin-field admin-field-full">
              <span>Plataformas</span>
              <div className="admin-chips">
                {ALL_PLATFORMS.map((p) => {
                  const active = form.platforms.includes(p);
                  return (
                    <button
                      type="button"
                      key={p}
                      className={`admin-chip${active ? " active" : ""}`}
                      onClick={() => togglePlatform(p)}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="admin-field admin-field-full">
              <span>Link de inscrição</span>
              <input
                value={form.signupLink}
                onChange={(e) => setForm({ ...form, signupLink: e.target.value })}
                placeholder="https://..."
              />
            </label>
            <label className="admin-field admin-field-full">
              <span>Descrição</span>
              <textarea
                rows={4}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Detalhes da campanha mostrados no modal do usuário."
              />
            </label>
          </div>
          <div className="admin-modal-footer">
            <button type="button" className="btn-outline" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary">
              {initial ? "Salvar alterações" : "Criar campanha"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
