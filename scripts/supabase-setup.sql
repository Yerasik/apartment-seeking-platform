-- Run this in Supabase → SQL Editor (one time)
-- Then paste your Project URL + anon key into Admin → Settings

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
