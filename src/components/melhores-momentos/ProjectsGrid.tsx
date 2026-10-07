import { Film, Loader2, Scissors, Trash2, TriangleAlert } from "lucide-react";
import type { MomentProject } from "@/services/momentProjectsService";
import { STAGE_LABELS, formatShortDate, formatVideoLength } from "./momentUtils";

// "Seus projetos": one card per analysed video; clicking opens the project page.
export function ProjectsGrid({
  projects,
  onOpen,
  onDelete,
}: {
  projects: MomentProject[];
  onOpen: (id: string) => void;
  onDelete: (project: MomentProject) => void;
}) {
  return (
    <section className="mm-projects">
      <div className="mm-projects-head">
        <h2>Seus projetos</h2>
        <span>{projects.length} {projects.length === 1 ? "vídeo" : "vídeos"}</span>
      </div>
      <div className="mm-projects-grid">
        {projects.map((p) => {
          const busy = p.stage !== "ready" && p.stage !== "failed";
          return (
            <article key={p.id} className="mm-pcard" onClick={() => onOpen(p.id)} role="link" tabIndex={0}
              onKeyDown={(e) => (e.key === "Enter" ? onOpen(p.id) : undefined)}>
              <div className="mm-pcard-thumb">
                {p.thumbnail ? <img src={p.thumbnail} alt="" referrerPolicy="no-referrer" /> : <Film size={26} />}
                {p.video_duration_sec ? <span className="mm-file-dur">{formatVideoLength(p.video_duration_sec)}</span> : null}
                <span className="mm-pcard-stage" data-stage={p.stage}>
                  {busy ? <Loader2 size={11} className="tr-spin" /> : p.stage === "failed" ? <TriangleAlert size={11} /> : null}
                  {STAGE_LABELS[p.stage]}
                </span>
              </div>
              <div className="mm-pcard-body">
                <h3 title={p.title}>{p.title}</h3>
                <div className="mm-pcard-meta">
                  <span><Scissors size={12} /> {p.moments_count} {p.moments_count === 1 ? "corte" : "cortes"}</span>
                  <span>{formatShortDate(p.created_at)}</span>
                  <button
                    type="button"
                    className="mm-pcard-del"
                    aria-label="Excluir projeto"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(p);
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
