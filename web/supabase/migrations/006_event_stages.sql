-- ============================================================
-- Migration v6 — Event stages (multi-day / multi-stage routes)
--
-- An organizer can upload several route files (one per day or special
-- stage), name each for reference, and select which one is "active".
-- The active stage's GPX is mirrored into events.route_gpx/route_name,
-- so every existing map and GEP feed keeps reading events.route_gpx
-- with no downstream change.
--
-- Run in the Supabase SQL editor after 005. Safe to re-run.
-- ============================================================

create table if not exists public.event_stages (
  id          uuid        primary key default gen_random_uuid(),
  event_id    uuid        not null references public.events(id) on delete cascade,
  name        text        not null,
  route_gpx   text        not null,
  position    int         not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists event_stages_event_pos
  on public.event_stages (event_id, position, created_at);

-- Which stage is currently selected for tracking/display.
alter table public.events
  add column if not exists active_stage_id uuid references public.event_stages(id) on delete set null;

alter table public.event_stages enable row level security;

-- Organizer manages stages for their own events; everyone in the event may read.
drop policy if exists "stages_select" on public.event_stages;
create policy "stages_select" on public.event_stages
  for select using (
    exists (
      select 1 from public.events e
      where e.id = event_id
        and (
          e.organizer_id = auth.uid()
          or exists (
            select 1 from public.event_participants ep
            where ep.event_id = e.id and ep.user_id = auth.uid()
          )
        )
    )
  );

drop policy if exists "stages_write" on public.event_stages;
create policy "stages_write" on public.event_stages
  for all using (
    exists (select 1 from public.events e where e.id = event_id and e.organizer_id = auth.uid())
  ) with check (
    exists (select 1 from public.events e where e.id = event_id and e.organizer_id = auth.uid())
  );

-- Activating a stage copies its route onto the event (one call, atomic).
create or replace function public.activate_event_stage(p_event_id uuid, p_stage_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gpx  text;
  v_name text;
begin
  select route_gpx, name into v_gpx, v_name
  from event_stages
  where id = p_stage_id and event_id = p_event_id;

  if v_gpx is null then
    raise exception 'stage not found for this event';
  end if;

  update events
     set route_gpx = v_gpx,
         route_name = v_name,
         active_stage_id = p_stage_id,
         updated_at = now()
   where id = p_event_id;
end;
$$;

revoke all on function public.activate_event_stage(uuid, uuid) from public;
grant execute on function public.activate_event_stage(uuid, uuid) to authenticated;
