-- Run this in Supabase → SQL Editor (one time)

-- 1) Events table for click / view / message stats
create table if not exists public.events (
  id bigint generated always as identity primary key,
  event_type text not null check (event_type in ('view', 'click', 'message')),
  apartment_id text not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists events_apartment_id_idx on public.events (apartment_id);
create index if not exists events_event_type_idx on public.events (event_type);

alter table public.events enable row level security;

drop policy if exists "Allow anonymous insert" on public.events;
create policy "Allow anonymous insert"
  on public.events for insert
  to anon
  with check (true);

drop policy if exists "Allow anonymous read" on public.events;
create policy "Allow anonymous read"
  on public.events for select
  to anon
  using (true);

-- 2) Public storage for listing photos & videos (visible to all site visitors)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-media',
  'listing-media',
  true,
  52428800,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read listing media" on storage.objects;
create policy "Public read listing media"
  on storage.objects for select
  to public
  using (bucket_id = 'listing-media');

drop policy if exists "Anon upload listing media" on storage.objects;
create policy "Anon upload listing media"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'listing-media');

drop policy if exists "Anon update listing media" on storage.objects;
create policy "Anon update listing media"
  on storage.objects for update
  to anon
  using (bucket_id = 'listing-media')
  with check (bucket_id = 'listing-media');
