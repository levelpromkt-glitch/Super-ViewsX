import { supabase } from "@/lib/supabase";
import type { TranscriptLine } from "./transcript/types";
import type { AudioSignal, DurationPreset, ViralMoment } from "./viralMomentsService";

export type ProjectStage = "uploading" | "transcribing" | "finding" | "ready" | "failed";

export type MomentProject = {
  id: string;
  source_type: "upload" | "youtube";
  source_key: string;
  title: string;
  thumbnail: string | null;
  video_duration_sec: number | null;
  stage: ProjectStage;
  error: string | null;
  job_id: string | null;
  requested_duration: DurationPreset | null;
  moments_count: number;
  created_at: string;
  updated_at: string;
};

// A moment as stored in a run: the AI result plus the cover frame cut from the uploaded file.
export type StoredMoment = ViralMoment & { thumb?: string };

export type MomentRun = {
  id: string;
  project_id: string;
  duration: DurationPreset;
  moments: StoredMoment[];
  video_topic: string | null;
  created_at: string;
};

export type ProjectTranscript = {
  lines: TranscriptLine[];
  audioSignals?: AudioSignal[];
  words?: [string, number, number][];
};

export class MomentProjectsError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "MomentProjectsError";
  }
}

// Everything except the (large) transcript.
const PROJECT_COLUMNS =
  "id, source_type, source_key, title, thumbnail, video_duration_sec, stage, error, job_id, requested_duration, moments_count, created_at, updated_at";

export const MomentProjectsService = {
  async create(input: {
    source_type: "upload" | "youtube";
    source_key?: string;
    title: string;
    thumbnail?: string | null;
    video_duration_sec?: number | null;
    stage: ProjectStage;
    requested_duration: DurationPreset;
  }): Promise<MomentProject> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new MomentProjectsError("Sessão inválida.", "UNAUTHENTICATED");

    const { data, error } = await supabase
      .from("moment_projects")
      .insert({
        user_id: user.id,
        source_type: input.source_type,
        source_key: input.source_key ?? "",
        title: input.title,
        thumbnail: input.thumbnail ?? null,
        video_duration_sec: input.video_duration_sec ?? null,
        stage: input.stage,
        requested_duration: input.requested_duration,
      })
      .select(PROJECT_COLUMNS)
      .single();
    if (error || !data) throw new MomentProjectsError(error?.message || "Não foi possível criar o projeto.", "INSERT_FAILED");
    return data as MomentProject;
  },

  async update(id: string, patch: Partial<Omit<MomentProject, "id" | "created_at" | "updated_at">>): Promise<void> {
    const { error } = await supabase.from("moment_projects").update(patch).eq("id", id);
    if (error) throw new MomentProjectsError(error.message, "UPDATE_FAILED");
  },

  async list(): Promise<MomentProject[]> {
    const { data, error } = await supabase
      .from("moment_projects")
      .select(PROJECT_COLUMNS)
      .order("created_at", { ascending: false });
    if (error) throw new MomentProjectsError(error.message, "QUERY_FAILED");
    return (data || []) as MomentProject[];
  },

  async get(id: string): Promise<MomentProject> {
    const { data, error } = await supabase.from("moment_projects").select(PROJECT_COLUMNS).eq("id", id).maybeSingle();
    if (error) throw new MomentProjectsError(error.message, "QUERY_FAILED");
    if (!data) throw new MomentProjectsError("Projeto não encontrado.", "NOT_FOUND");
    return data as MomentProject;
  },

  async getTranscript(id: string): Promise<ProjectTranscript | null> {
    const { data, error } = await supabase.from("moment_projects").select("transcript").eq("id", id).maybeSingle();
    if (error) throw new MomentProjectsError(error.message, "QUERY_FAILED");
    return (data?.transcript as ProjectTranscript | null) ?? null;
  },

  async saveTranscript(id: string, transcript: ProjectTranscript, videoDurationSec: number | null): Promise<void> {
    const patch: Record<string, unknown> = { transcript };
    if (videoDurationSec && videoDurationSec > 0) patch.video_duration_sec = Math.round(videoDurationSec);
    const { error } = await supabase.from("moment_projects").update(patch).eq("id", id);
    if (error) throw new MomentProjectsError(error.message, "UPDATE_FAILED");
  },

  // Same YouTube video analysed before: its transcript can be reused.
  async findYoutube(videoId: string): Promise<MomentProject | null> {
    const { data, error } = await supabase
      .from("moment_projects")
      .select(PROJECT_COLUMNS)
      .eq("source_type", "youtube")
      .eq("source_key", videoId)
      .not("transcript", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error || !data || data.length === 0) return null;
    return data[0] as MomentProject;
  },

  async listRuns(projectId: string): Promise<MomentRun[]> {
    const { data, error } = await supabase
      .from("moment_runs")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) throw new MomentProjectsError(error.message, "QUERY_FAILED");
    return (data || []) as MomentRun[];
  },

  async addRun(projectId: string, duration: DurationPreset, moments: StoredMoment[], videoTopic?: string): Promise<MomentRun> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new MomentProjectsError("Sessão inválida.", "UNAUTHENTICATED");
    const { data, error } = await supabase
      .from("moment_runs")
      .insert({ project_id: projectId, user_id: user.id, duration, moments, video_topic: videoTopic ?? null })
      .select("*")
      .single();
    if (error || !data) throw new MomentProjectsError(error?.message || "Não foi possível salvar os cortes.", "INSERT_FAILED");
    return data as MomentRun;
  },

  async updateRunMoments(runId: string, moments: StoredMoment[]): Promise<void> {
    const { error } = await supabase.from("moment_runs").update({ moments }).eq("id", runId);
    if (error) throw new MomentProjectsError(error.message, "UPDATE_FAILED");
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from("moment_projects").delete().eq("id", id);
    if (error) throw new MomentProjectsError(error.message, "DELETE_FAILED");
  },
};
