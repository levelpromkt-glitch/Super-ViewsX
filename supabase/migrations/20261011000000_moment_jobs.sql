-- Melhores Momentos: a análise dos cortes (busca por partes + revisão) roda no servidor.
-- O navegador só cria uma linha em moment_jobs; a função moment-jobs divide o trabalho em
-- tarefas (moment_job_tasks), executa em lotes e se reagenda sozinha até terminar, com a aba
-- aberta ou fechada. Um cron a cada minuto religa jobs que pararam no meio.

create table if not exists public.moment_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.moment_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  duration text not null,
  refresh boolean not null default false,
  -- "initial": primeira análise do projeto; "extra": nova rodada num projeto pronto
  kind text not null default 'initial' check (kind in ('initial', 'extra')),
  -- rodada existente da mesma duração: os cortes novos são somados a ela
  existing_run_id uuid,
  -- trechos já existentes que a IA não pode repetir: [{start,end}]
  exclude jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  phase text check (phase in ('scan', 'judge', 'done')),
  progress integer not null default 0,
  status_text text,
  windows_total integer not null default 0,
  windows_done integer not null default 0,
  video_topic text,
  warning text,
  used_backup boolean not null default false,
  notice text,
  run_id uuid,
  added_ids jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists moment_jobs_project_idx on public.moment_jobs (project_id, created_at desc);
create index if not exists moment_jobs_active_idx on public.moment_jobs (status) where status in ('pending', 'running');

create table if not exists public.moment_job_tasks (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.moment_jobs(id) on delete cascade,
  kind text not null check (kind in ('window', 'judge')),
  idx integer not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  attempts integer not null default 0,
  started_at timestamptz,
  result jsonb,
  error text,
  updated_at timestamptz not null default now(),
  unique (job_id, kind, idx)
);

create index if not exists moment_job_tasks_job_idx on public.moment_job_tasks (job_id, kind, status);

alter table public.moment_jobs enable row level security;
alter table public.moment_job_tasks enable row level security; -- sem políticas: só o servidor acessa

create policy "moment_jobs_select_own" on public.moment_jobs
  for select using (auth.uid() = user_id);
create policy "moment_jobs_insert_own" on public.moment_jobs
  for insert with check (auth.uid() = user_id);

-- Pega até p_limit tarefas pendentes de um job, de forma atômica (vários lotes não se atropelam).
create or replace function public.claim_moment_tasks(p_job uuid, p_kind text, p_limit integer)
returns setof public.moment_job_tasks
language sql
security definer
set search_path = public
as $$
  update public.moment_job_tasks t
     set status = 'running', started_at = now(), attempts = t.attempts + 1, updated_at = now()
   where t.id in (
     select id from public.moment_job_tasks
      where job_id = p_job and kind = p_kind and status = 'pending'
      order by idx
      limit p_limit
      for update skip locked
   )
  returning t.*;
$$;

-- Dispara um lote da função moment-jobs (assíncrono, via pg_net).
create or replace function public.kick_moment_job(p_job uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform net.http_post(
    url := 'https://blqddcvsvwsjempxyjiy.supabase.co/functions/v1/moment-jobs',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object('action', 'tick', 'jobId', p_job),
    timeout_milliseconds := 150000
  );
end;
$$;

create or replace function public.moment_jobs_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.kick_moment_job(new.id);
  return new;
end;
$$;

drop trigger if exists moment_jobs_kick on public.moment_jobs;
create trigger moment_jobs_kick
  after insert on public.moment_jobs
  for each row execute function public.moment_jobs_after_insert();

revoke all on function public.claim_moment_tasks(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.kick_moment_job(uuid) from public, anon, authenticated;
revoke all on function public.moment_jobs_after_insert() from public, anon, authenticated;
grant execute on function public.claim_moment_tasks(uuid, text, integer) to service_role;
grant execute on function public.kick_moment_job(uuid) to service_role;

-- Religa jobs que pararam no meio (função reiniciada, lote que passou do limite de tempo...).
create or replace function public.sweep_moment_jobs()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select id from public.moment_jobs
     where (status = 'running' and updated_at < now() - interval '150 seconds')
        or (status = 'pending' and created_at < now() - interval '40 seconds')
  loop
    perform public.kick_moment_job(r.id);
  end loop;
end;
$$;

revoke all on function public.sweep_moment_jobs() from public, anon, authenticated;
grant execute on function public.sweep_moment_jobs() to service_role;

select cron.unschedule('moment-jobs-sweep') where exists (select 1 from cron.job where jobname = 'moment-jobs-sweep');
select cron.schedule('moment-jobs-sweep', '* * * * *', $cron$select public.sweep_moment_jobs()$cron$);
