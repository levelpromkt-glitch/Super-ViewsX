import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { MomentProjectsService, type MomentProject } from "@/services/momentProjectsService";
import { MomentProjectRunner, clearRunnerState, useRunnerVersion } from "@/services/momentProjectRunner";
import type { DurationPreset } from "@/services/viralMomentsService";
import { NewProjectHero } from "@/components/melhores-momentos/NewProjectHero";
import { ProjectsGrid } from "@/components/melhores-momentos/ProjectsGrid";
import { ProjectView } from "@/components/melhores-momentos/ProjectView";

// One page, two views: the home (send a video + list of projects) and, with
// ?projeto=<id>, the page of a single video ("project"). Keeping it a single
// route means a reload or the browser's back button lands where the user was.
export const Route = createFileRoute("/dashboard/melhores-momentos")({
  validateSearch: (search: Record<string, unknown>): { projeto?: string } => ({
    projeto: typeof search.projeto === "string" && search.projeto ? search.projeto : undefined,
  }),
  component: MelhoresMomentosPage,
});

function MelhoresMomentosPage() {
  const { projeto } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const openProject = useCallback(
    (id: string) => navigate({ search: { projeto: id } }),
    [navigate]
  );
  const goHome = useCallback(() => navigate({ search: {} }), [navigate]);

  if (projeto) return <ProjectView key={projeto} projectId={projeto} onBack={goHome} />;
  return <ProjectsHome onOpen={openProject} />;
}

function ProjectsHome({ onOpen }: { onOpen: (id: string) => void }) {
  const [projects, setProjects] = useState<MomentProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useRunnerVersion();

  const load = useCallback(async () => {
    try {
      setProjects(await MomentProjectsService.list());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar os projetos.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep the cards of projects still being processed up to date.
  const processing = projects?.some((p) => p.stage !== "ready" && p.stage !== "failed") ?? false;
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [processing, load]);

  const handleStartUpload = async (file: File, duration: DurationPreset, pastedTranscript: string) => {
    const id = await MomentProjectRunner.startUpload({ file, duration, pastedTranscript });
    onOpen(id);
  };
  const handleStartYoutube = async (url: string, duration: DurationPreset) => {
    const id = await MomentProjectRunner.startYoutube({ url, duration });
    onOpen(id);
  };

  const handleDelete = async (project: MomentProject) => {
    if (!window.confirm(`Excluir o projeto "${project.title}"? Os cortes encontrados serão apagados.`)) return;
    try {
      await MomentProjectsService.remove(project.id);
      clearRunnerState(project.id);
      setProjects((prev) => (prev ? prev.filter((p) => p.id !== project.id) : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível excluir o projeto.");
    }
  };

  return (
    <div className="hs-page">
      <NewProjectHero onStartUpload={handleStartUpload} onStartYoutube={handleStartYoutube} />
      {error && <div className="tr-error" style={{ maxWidth: "none" }}>{error}</div>}
      {projects && projects.length > 0 && <ProjectsGrid projects={projects} onOpen={onOpen} onDelete={handleDelete} />}
    </div>
  );
}
