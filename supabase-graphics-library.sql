-- Graphics library: Madison's study graphics, searchable and linkable.
-- Safe to run once in the Supabase SQL Editor.
create table if not exists graphics (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  body_system text,
  nclex_category text,
  tags text[] not null default '{}',
  image_path text not null unique,
  created_at timestamptz not null default now()
);
alter table graphics enable row level security;
drop policy if exists "admins manage graphics" on graphics;
drop policy if exists "signed in users view graphics" on graphics;
create policy "admins manage graphics" on graphics
  for all to authenticated using (is_app_admin()) with check (is_app_admin());
create policy "signed in users view graphics" on graphics
  for select to authenticated using (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('graphics-library', 'graphics-library', false, 15728640, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "signed in users view graphic files" on storage.objects;
drop policy if exists "admins manage graphic files" on storage.objects;
create policy "signed in users view graphic files" on storage.objects
  for select to authenticated using (bucket_id = 'graphics-library');
create policy "admins manage graphic files" on storage.objects
  for all to authenticated using (bucket_id = 'graphics-library' and is_app_admin())
  with check (bucket_id = 'graphics-library' and is_app_admin());
