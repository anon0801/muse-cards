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
drop policy if exists "users manage their own projects" on public.projects;
create policy "users manage their own projects" on public.projects for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.set_project_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists project_updated_at on public.projects;
create trigger project_updated_at before update on public.projects for each row execute function public.set_project_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('card-assets', 'card-assets', false, 10485760, array['image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "card owners upload assets" on storage.objects;
drop policy if exists "card owners read assets" on storage.objects;
drop policy if exists "card owners update assets" on storage.objects;
create policy "card owners upload assets" on storage.objects for insert to authenticated with check (bucket_id = 'card-assets' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "card owners read assets" on storage.objects for select to authenticated using (bucket_id = 'card-assets' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "card owners update assets" on storage.objects for update to authenticated using (bucket_id = 'card-assets' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'card-assets' and (storage.foldername(name))[1] = auth.uid()::text);
