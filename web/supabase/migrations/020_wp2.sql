-- 020_wp2.sql
-- WP2 data model: onboarding stamp, entrant-supplied ICE columns, in-app SOS
-- state, public course-visibility toggles, and the event-replay window function.
-- Builds only on events / event_participants / event_track_points (all present).
-- Safe to re-run.

-- ── Onboarding ─────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists onboarded_at timestamptz;

-- ── Entrant ICE (organizer + command view only; never public) ──────────────
alter table public.event_participants
  add column if not exists email      text,
  add column if not exists ice_name   text,
  add column if not exists ice_phone  text,
  add column if not exists blood_type text,
  add column if not exists allergies  text;

-- ── In-app SOS state (never on the public feed) ────────────────────────────
alter table public.event_participants
  add column if not exists sos_at         timestamptz,
  add column if not exists sos_cleared_at timestamptz;

-- ── Public course-visibility toggles (default TRUE = current behavior) ─────
alter table public.events
  add column if not exists public_show_route     boolean not null default true,
  add column if not exists public_show_waypoints boolean not null default true;

-- ── Event replay window ────────────────────────────────────────────────────
create index if not exists event_track_points_event_recorded
  on public.event_track_points (event_id, recorded_at);

-- Every entrant's fixes in a time window, for the replay scrubber. Respects
-- suspension and hides unpaid entrant-mode rows (matching the live feed).
create or replace function public.get_event_track_window(
  p_event_id uuid, p_from timestamptz, p_to timestamptz
)
returns table (
  participant_id uuid,
  lat double precision,
  lng double precision,
  recorded_at timestamptz
)
language sql security definer set search_path = public as $$
  select tp.participant_id, tp.lat, tp.lng, tp.recorded_at
  from event_track_points tp
  join events e on e.id = tp.event_id
  join event_participants ep on ep.id = tp.participant_id
  where tp.event_id = p_event_id
    and e.suspended_at is null
    and (e.payment_mode <> 'entrant' or ep.paid_at is not null)
    and tp.recorded_at >= p_from
    and tp.recorded_at <= p_to
  order by tp.recorded_at;
$$;
grant execute on function public.get_event_track_window(uuid, timestamptz, timestamptz) to anon, authenticated;
