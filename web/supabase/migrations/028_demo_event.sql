-- 028_demo_event.sql
-- A single shared, read-only DEMO event every new user can open to explore the
-- UI — a finished Baja night ride with four entrants across classes, each with
-- a satellite track. It renders on the public map at /event/demo-baja-rodada
-- (get_event_live_positions shows completed events; only suspended ones go dark).
--
-- Owned by the super-admin profile, flagged is_demo, comped, and payment_mode
-- 'organizer' so every entrant with a fix is publicly visible. The seed is
-- idempotent: it wipes any prior demo (cascade clears participants + tracks)
-- and re-inserts, so re-running the migration refreshes it cleanly.

alter table public.events add column if not exists is_demo boolean not null default false;

delete from public.events where is_demo = true;

do $$
declare
  v_org uuid;
  v_ev  uuid := 'd0d0d0d0-e0e0-4a0a-8b0b-000000000001';
  p1    uuid := 'd0d0d0d0-e0e0-4a0a-8b0b-000000000101';
  p2    uuid := 'd0d0d0d0-e0e0-4a0a-8b0b-000000000102';
  p3    uuid := 'd0d0d0d0-e0e0-4a0a-8b0b-000000000103';
  p4    uuid := 'd0d0d0d0-e0e0-4a0a-8b0b-000000000104';
  t     timestamptz := now() - interval '2 days';   -- ride finished ~2 days ago
begin
  select id into v_org from public.profiles where is_super_admin = true order by created_at limit 1;
  if v_org is null then select id into v_org from public.profiles order by created_at limit 1; end if;
  if v_org is null then raise notice 'No profile available to own the demo event; skipping seed.'; return; end if;

  insert into public.events
    (id, organizer_id, name, description, status, payment_mode, is_demo, comped, comped_reason,
     join_code, share_token, route_name, rider_classes, public_show_route, public_show_waypoints,
     starts_at, ends_at)
  values
    (v_ev, v_org, 'Baja Adventure Riders — Rodada Nocturna',
     'A sample night ride through the Baja backcountry. Explore the live map, roster, class filters, the measure tool, and the recovery feed — no setup required.',
     'completed', 'organizer', true, true, 'Demo event',
     'DEMO01', 'demo-baja-rodada', 'Rodada Nocturna',
     array['RallyPro','Rally1','ADV']::text[], true, true,
     t - interval '3 hours', t);

  insert into public.event_participants
    (id, event_id, user_id, display_name, rider_number, rider_class, device_type, join_token, role,
     last_lat, last_lng, last_seen_at)
  values
    (p1, v_ev, null, 'Marco Salgado',  '1',  'ADV',      'garmin', 'demo-baja-1',  'participant', 32.015, -116.455, t - interval '9 min'),
    (p2, v_ev, null, 'Luis Gutierrez', '3',  'Rally1',   'spot',   'demo-baja-3',  'participant', 31.900, -116.250, t - interval '22 min'),
    (p3, v_ev, null, 'Diego Ramirez',  '7',  'RallyPro', 'garmin', 'demo-baja-7',  'participant', 32.022, -115.925, t - interval '4 min'),
    (p4, v_ev, null, 'Carla Mendoza',  '12', 'ADV',      'zoleo',  'demo-baja-12', 'participant', 32.083, -116.582, t - interval '41 min');

  insert into public.event_track_points (participant_id, event_id, lat, lng, recorded_at, source) values
    -- #1 Marco Salgado (west, Valle de Guadalupe)
    (p1, v_ev, 32.100, -116.600, t - interval '3 hours',  'demo'),
    (p1, v_ev, 32.072, -116.558, t - interval '2 hours',  'demo'),
    (p1, v_ev, 32.048, -116.520, t - interval '1 hour',   'demo'),
    (p1, v_ev, 32.028, -116.483, t - interval '30 min',   'demo'),
    (p1, v_ev, 32.015, -116.455, t - interval '9 min',    'demo'),
    -- #3 Luis Gutierrez (central, Ojos Negros)
    (p2, v_ev, 31.985, -116.365, t - interval '3 hours',  'demo'),
    (p2, v_ev, 31.958, -116.332, t - interval '2 hours',  'demo'),
    (p2, v_ev, 31.932, -116.302, t - interval '1 hour',   'demo'),
    (p2, v_ev, 31.912, -116.272, t - interval '40 min',   'demo'),
    (p2, v_ev, 31.900, -116.250, t - interval '22 min',   'demo'),
    -- #7 Diego Ramirez (leading, toward Laguna Hanson)
    (p3, v_ev, 31.978, -116.100, t - interval '3 hours',  'demo'),
    (p3, v_ev, 31.998, -116.052, t - interval '2 hours',  'demo'),
    (p3, v_ev, 32.010, -116.005, t - interval '1 hour',   'demo'),
    (p3, v_ev, 32.018, -115.962, t - interval '25 min',   'demo'),
    (p3, v_ev, 32.022, -115.925, t - interval '4 min',    'demo'),
    -- #12 Carla Mendoza (back of pack, near start)
    (p4, v_ev, 32.122, -116.642, t - interval '3 hours',  'demo'),
    (p4, v_ev, 32.112, -116.622, t - interval '2 hours',  'demo'),
    (p4, v_ev, 32.100, -116.606, t - interval '1 hour',   'demo'),
    (p4, v_ev, 32.090, -116.592, t - interval '55 min',   'demo'),
    (p4, v_ev, 32.083, -116.582, t - interval '41 min',   'demo');
end $$;
