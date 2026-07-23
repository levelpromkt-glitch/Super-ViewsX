import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { X, Download, Eye } from "lucide-react";
import {
  getTemplates,
  subscribeTemplates,
  type Template,
} from "@/services/templatesService";

export const Route = createFileRoute("/dashboard/templates")({
  component: TemplatesPage,
});

function TemplatesPage() {
  const [list, setList] = useState<Template[]>([]);
  const [selected, setSelected] = useState<Template | null>(null);

  useEffect(() => {
    setList(getTemplates());
    const unsub = subscribeTemplates(() => setList(getTemplates()));
    return () => {
      unsub();
    };
  }, []);

  return (
    <div className="tpl-wrapper">
      <div className="tpl-header">
        <h1 className="tpl-title">
          Escolha o <span className="highlight">formato ideal</span> para seu clipe
        </h1>
        <p className="tpl-subtitle">
          Templates otimizados para transformar seus vídeos em clipes virais
        </p>
      </div>

      {list.length === 0 ? (
        <div className="empty-state">Nenhum template disponível no momento.</div>
      ) : (
        <div className="tpl-grid">
          {list.map((t) => (
            <article key={t.id} className="tpl-card">
              <div className="tpl-card-img">
                <img src={t.image} alt={t.name} loading="lazy" />
              </div>
              <div className="tpl-card-body">
                <h3 className="tpl-card-name">{t.name}</h3>
                <button
                  className="btn-primary tpl-card-btn"
                  onClick={() => setSelected(t)}
                >
                  <Eye size={15} /> Ver template
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {selected && (
        <div
          className="admin-modal-overlay"
          onClick={() => setSelected(null)}
          role="dialog"
        >
          <div
            className="admin-modal tpl-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-modal-header">
              <h3>{selected.name}</h3>
              <button
                className="admin-icon-btn"
                onClick={() => setSelected(null)}
                aria-label="Fechar"
              >
                <X size={16} />
              </button>
            </div>
            <div className="tpl-modal-body">
              <img src={selected.image} alt={selected.name} />
            </div>
            <div className="tpl-modal-footer">
              <button
                className="btn-outline"
                onClick={() => setSelected(null)}
              >
                Fechar
              </button>
              <a
                className="btn-primary"
                href={selected.downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Download size={15} /> Baixar template
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
