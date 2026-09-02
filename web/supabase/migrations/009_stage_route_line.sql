-- ============================================================
-- Migration v9 — Lightweight route line (speed)
--
-- The live feed was returning each stage's full route_gpx (1–2 MB of
-- embedded tulip images) on every refresh. Store a compact route_line
-- ([[lng,lat], ...]) at upload time and serve THAT plus the waypoints,
-- never the raw GPX. Cuts the live payload from megabytes to kilobytes.
--
-- Run in the Supabase SQL editor after 008. Safe to re-run.
-- ============================================================

alter table public.event_stages
  add column if not exists route_line jsonb not null default '[]'::jsonb;

-- Serve route_line + waypoints; drop the heavy route_gpx and the event's
-- own route_gpx from the live feed.
create or replace function public.get_event_live_positions(p_share_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_event record; v_result jsonb; v_stages jsonb;
begin
  select id, name, status, route_name, starts_at
    into v_event from events where share_token = p_share_token limit 1;
  if v_event.id is null then return null; end if;

  select coalesce(jsonb_agg(
    jsonb_build_object('id', st.id, 'name', st.name, 'color', st.color,
                       'route_line', st.route_line, 'waypoints', st.waypoints)
    order by st.position, st.created_at
  ) filter (where st.visible), '[]'::jsonb)
  into v_stages from event_stages st where st.event_id = v_event.id;

  select jsonb_build_object(
    'event', jsonb_build_object('name', v_event.name, 'status', v_event.status,
      'route_name', v_event.route_name, 'starts_at', v_event.starts_at),
    'stages', v_stages,
    'entrants', coalesce(jsonb_agg(
      jsonb_build_object('id', ep.id, 'name', ep.display_name, 'number', ep.rider_number,
        'class', ep.rider_class, 'lat', ep.last_lat, 'lng', ep.last_lng,
        'last_seen_at', ep.last_seen_at, 'device_type', ep.device_type)
      order by ep.rider_number nulls last, ep.display_name
    ) filter (where ep.last_lat is not null), '[]'::jsonb)
  ) into v_result
  from event_participants ep where ep.event_id = v_event.id;

  return v_result;
end; $$;
grant execute on function public.get_event_live_positions(text) to anon, authenticated;
