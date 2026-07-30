import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Pencil, Trash2, Plus, RotateCcw, ShieldAlert, Upload, Save, X } from "lucide-react";
import type { Campaign } from "@/lib/types";
import {
  createCampaign,
  deleteCampaign,
  fetchCampaigns,
  resetCampaigns,
  updateCampaign,
  subscribeCampaigns,
} from "@/services/campaignsService";
import {
  createTemplate,
  deleteTemplate,
  fetchTemplates,
  subscribeTemplates,
  updateTemplate,
  type Template,
} from "@/services/templatesService";
import { CampaignFormModal } from "@/components/admin/CampaignFormModal";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/dashboard/admin")({
  component: AdminPage,
});

function RestrictedAccess() {
  return (
    <div className="admin-restricted">
      <div className="admin-restricted-icon">
        <ShieldAlert size={40} />
      </div>
      <h2>Acesso restrito</h2>
      <p>Esta área é exclusiva para administradores.</p>
    </div>
  );
}

type Tab = "campaigns" | "templates";

function AdminPage() {
  const { isAdmin, ready } = useAuth();
  const [tab, setTab] = useState<Tab>("campaigns");

  if (!ready) return null;
  if (!isAdmin) return <RestrictedAccess />;

  return (
    <div className="admin-wrapper">
      <div className="admin-tabs">
        <button
          className={`admin-tab ${tab === "campaigns" ? "active" : ""}`}
          onClick={() => setTab("campaigns")}
        >
          Campanhas
        </button>
        <button
          className={`admin-tab ${tab === "templates" ? "active" : ""}`}
          onClick={() => setTab("templates")}
        >
          Templates
        </button>
      </div>

      {tab === "campaigns" ? <CampaignsAdmin /> : <TemplatesAdmin />}
    </div>
  );
}

function CampaignsAdmin() {
  const [list, setList] = useState<Campaign[]>([]);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const data = await fetchCampaigns();
      if (!cancelled) setList(data);
    };
    load();
    const unsub = subscribeCampaigns(load);
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const openNew = () => {
    setEditing(null);
    setOpen(true);
  };
  const openEdit = (c: Campaign) => {
    setEditing(c);
    setOpen(true);
  };
  const handleSave = async (c: Campaign) => {
    if (list.some((x) => x.id === c.id)) await updateCampaign(c.id, c);
    else await createCampaign(c);
    setOpen(false);
  };
  const handleDelete = async (c: Campaign) => {
    if (confirm(`Excluir a campanha "${c.name}"?`)) await deleteCampaign(c.id);
  };
  const handleReset = () => {
    if (confirm("Restaurar as campanhas iniciais? Suas edições serão perdidas."))
      resetCampaigns();
  };

  return (
    <>
      <div className="admin-header">
        <div>
          <h2 className="admin-title">Gerenciar campanhas</h2>
        </div>
        <div className="admin-actions">
          <button className="btn-outline" onClick={handleReset} title="Restaurar campanhas padrão">
            <RotateCcw size={15} /> Restaurar
          </button>
          <button className="btn-primary" onClick={openNew}>
            <Plus size={16} /> Nova campanha
          </button>
        </div>
      </div>

      <div className="admin-table-card">
        {list.length === 0 ? (
          <div className="empty-state">Nenhuma campanha cadastrada.</div>
        ) : (
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Campanha</th>
                  <th>Tipo</th>
                  <th>Plataformas</th>
                  <th>Orçamento</th>
                  <th>Promotor</th>
                  <th>Status</th>
                  <th className="admin-col-actions">Ações</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="admin-cell-name">{c.name}</div>
                      <div className="admin-cell-sub">{c.sub}</div>
                    </td>
                    <td><span className="admin-tag">{c.format}</span></td>
                    <td>
                      <div className="admin-platforms">
                        {c.platforms.map((p) => (
                          <span key={p} className="admin-pill">{p}</span>
                        ))}
                      </div>
                    </td>
                    <td>{c.budget}</td>
                    <td>{c.promoter}</td>
                    <td>
                      <span className={`admin-status admin-status-${c.status.toLowerCase()}`}>
                        {c.status}
                      </span>
                    </td>
                    <td>
                      <div className="admin-row-actions">
                        <button className="admin-icon-btn" onClick={() => openEdit(c)} title="Editar" aria-label="Editar">
                          <Pencil size={15} />
                        </button>
                        <button className="admin-icon-btn admin-icon-danger" onClick={() => handleDelete(c)} title="Excluir" aria-label="Excluir">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CampaignFormModal
        open={open}
        initial={editing}
        onClose={() => setOpen(false)}
        onSave={handleSave}
      />
    </>
  );
}

function TemplatesAdmin() {
  const [list, setList] = useState<Template[]>([]);
  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [downloadUrlPc, setDownloadUrlPc] = useState("");
  const [downloadUrlMobile, setDownloadUrlMobile] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const data = await fetchTemplates();
      if (!cancelled) setList(data);
    };
    load();
    const unsub = subscribeTemplates(load);
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const reset = () => {
    setName("");
    setImage("");
    setDownloadUrlPc("");
    setDownloadUrlMobile("");
    setEditingId(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onPickFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImage(String(reader.result || ""));
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !image || (!downloadUrlPc.trim() && !downloadUrlMobile.trim())) {
      alert("Preencha nome, imagem e pelo menos um link de download.");
      return;
    }
    setIsSaving(true);
    try {
      if (editingId) {
        await updateTemplate(editingId, { name: name.trim(), image, downloadUrlPc: downloadUrlPc.trim(), downloadUrlMobile: downloadUrlMobile.trim() });
      } else {
        await createTemplate({ name: name.trim(), image, downloadUrlPc: downloadUrlPc.trim(), downloadUrlMobile: downloadUrlMobile.trim() });
      }
      reset();
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (t: Template) => {
    setEditingId(t.id);
    setName(t.name);
    setImage(t.image);
    setDownloadUrlPc(t.downloadUrlPc || "");
    setDownloadUrlMobile(t.downloadUrlMobile || "");
  };

  const handleDelete = async (t: Template) => {
    if (confirm(`Excluir o template "${t.name}"?`)) {
      await deleteTemplate(t.id);
      if (editingId === t.id) reset();
    }
  };

  return (
    <>
      <div className="admin-header">
        <div>
          <h2 className="admin-title">Gerenciar Templates</h2>
        </div>
      </div>

      <form className="admin-table-card tpl-admin-form" onSubmit={handleSave}>
        <div className="admin-form-grid">
          <label className="admin-field admin-field-full">
            <span>Nome do template</span>
            <input
              type="text"
              placeholder="Ex: Corte Viral Neon"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <div className="admin-cover-field admin-field-full">
            <span className="admin-cover-label">Imagem do template</span>
            <div className={`admin-cover-preview ${image ? "has-image" : ""}`}>
              {image ? (
                <img src={image} alt="Preview" />
              ) : (
                <div className="admin-cover-empty">
                  <Upload size={20} />
                  <span>Selecione uma imagem</span>
                </div>
              )}
            </div>
            <div className="admin-cover-actions">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => onPickFile(e.target.files?.[0])}
              />
              <button
                type="button"
                className="btn-outline"
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={14} /> {image ? "Trocar imagem" : "Anexar imagem"}
              </button>
              {image && (
                <button
                  type="button"
                  className="btn-outline admin-cover-remove"
                  onClick={() => setImage("")}
                >
                  <X size={14} /> Remover
                </button>
              )}
            </div>
          </div>

          <label className="admin-field admin-field-full">
            <span>Link de download (PC)</span>
            <input
              type="url"
              placeholder="Cole aqui o link para download (PC)"
              value={downloadUrlPc}
              onChange={(e) => setDownloadUrlPc(e.target.value)}
            />
          </label>

          <label className="admin-field admin-field-full">
            <span>Link de download (CapCut Celular)</span>
            <input
              type="url"
              placeholder="Cole aqui o link para download (Mobile)"
              value={downloadUrlMobile}
              onChange={(e) => setDownloadUrlMobile(e.target.value)}
            />
          </label>
        </div>

        <div className="admin-modal-footer">
          {editingId && (
            <button type="button" className="btn-outline" onClick={reset} disabled={isSaving}>
              Cancelar
            </button>
          )}
          <button type="submit" className="btn-primary" disabled={isSaving}>
            <Save size={15} /> {isSaving ? "Salvando..." : editingId ? "Atualizar template" : "Salvar template"}
          </button>
        </div>
      </form>

      <div className="admin-table-card">
        {list.length === 0 ? (
          <div className="empty-state">Nenhum template cadastrado.</div>
        ) : (
          <ul className="tpl-admin-list">
            {list.map((t) => (
              <li key={t.id} className="tpl-admin-item">
                <div className="tpl-admin-thumb">
                  <img src={t.image} alt={t.name} />
                </div>
                <div className="tpl-admin-info">
                  <div className="admin-cell-name">{t.name}</div>
                  {t.downloadUrlPc && (
                    <div className="tpl-admin-link-row">
                      <span className="tpl-admin-link-label">PC:</span>
                      <a
                        className="tpl-admin-link"
                        href={t.downloadUrlPc}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {t.downloadUrlPc}
                      </a>
                    </div>
                  )}
                  {t.downloadUrlMobile && (
                    <div className="tpl-admin-link-row">
                      <span className="tpl-admin-link-label">Mobile:</span>
                      <a
                        className="tpl-admin-link"
                        href={t.downloadUrlMobile}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {t.downloadUrlMobile}
                      </a>
                    </div>
                  )}
                </div>
                <div className="admin-row-actions">
                  <button
                    className="admin-icon-btn"
                    onClick={() => handleEdit(t)}
                    title="Editar"
                    aria-label="Editar"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="admin-icon-btn admin-icon-danger"
                    onClick={() => handleDelete(t)}
                    title="Excluir"
                    aria-label="Excluir"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
