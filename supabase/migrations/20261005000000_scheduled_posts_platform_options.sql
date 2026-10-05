alter table public.scheduled_posts add column if not exists options jsonb not null default '{}'::jsonb;
