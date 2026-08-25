create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  persona text not null default '',
  topic text not null default '',
  settings jsonb not null default '{}'::jsonb,
  cards jsonb not null default '[]'::jsonb,
  character_sheet text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.projects enable row level security;
create policy "users manage their own projects" on public.projects for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
