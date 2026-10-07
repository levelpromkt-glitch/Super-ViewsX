-- Melhores Momentos: cada vídeo analisado vira um "projeto" guardado na conta.
-- A transcrição fica no projeto (reabrir ou pedir outra duração não transcreve de novo)
-- e cada rodada de análise (uma duração) vira uma linha em moment_runs.

create table if not exists public.moment_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('upload', 'youtube')),
  -- chave do arquivo no R2 (upload) ou id do vídeo (youtube); vazio enquanto o envio não termina
  source_key text not null default '',
  title text not null,
  thumbnail text,
  video_duration_sec integer,
  stage text not null default 'uploading'
    check (stage in ('uploading', 'transcribing', 'finding', 'ready', 'failed')),
  error text,
  job_id uuid,
  -- duração pedida na análise em andamento (para retomar depois de recarregar a página)
  requested_duration text,
  moments_count integer not null default 0,
  -- { lines, audioSignals, words }
  transcript jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists moment_projects_user_created_idx
  on public.moment_projects (user_id, created_at desc);

create table if not exists public.moment_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.moment_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  duration text not null,
  moments jsonb not null default '[]'::jsonb,
  video_topic text,
  created_at timestamptz not null default now()
);

create index if not exists moment_runs_project_idx
  on public.moment_runs (project_id, created_at desc);

alter table public.moment_projects enable row level security;
alter table public.moment_runs enable row level security;

create policy "moment_projects_select_own" on public.moment_projects
  for select using (auth.uid() = user_id);
create policy "moment_projects_insert_own" on public.moment_projects
  for insert with check (auth.uid() = user_id);
create policy "moment_projects_update_own" on public.moment_projects
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "moment_projects_delete_own" on public.moment_projects
  for delete using (auth.uid() = user_id);

create policy "moment_runs_select_own" on public.moment_runs
  for select using (auth.uid() = user_id);
create policy "moment_runs_insert_own" on public.moment_runs
  for insert with check (auth.uid() = user_id);
create policy "moment_runs_update_own" on public.moment_runs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "moment_runs_delete_own" on public.moment_runs
  for delete using (auth.uid() = user_id);

create or replace function public.touch_moment_project_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists moment_projects_touch on public.moment_projects;
create trigger moment_projects_touch
  before update on public.moment_projects
  for each row execute function public.touch_moment_project_updated_at();
