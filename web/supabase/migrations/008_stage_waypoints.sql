-- ============================================================
-- Migration v8 — Stage waypoints (OpenRally support)
--
-- OpenRally GPX files carry named waypoints (DSS/FSS start-finish,
-- WPM/WPE waypoints, CKP checkpoints, etc.). When a stage GPX is
-- uploaded we parse its <wpt> elements and store them here so every
-- map can show labelled waypoint pins along the route.
--
-- Run in the Supabase SQL editor after 007. Safe to re-run.
-- ============================================================

alter table public.event_stages
  add column if not exists waypoints jsonb not null default '[]'::jsonb;

-- Re-publish get_event_live_positions so the visible stages carry their
-- waypoints out to every shared map.
create or replace function public.get_event_live_positions(p_share_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event   record;
  v_result  jsonb;
  v_stages  jsonb;
begin
  select id, name, status, route_gpx, route_name, starts_at
    into v_event
  from events
  where share_token = p_share_token
  limit 1;

  if v_event.id is null then
    return null;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',        st.id,
      'name',      st.name,
      'route_gpx', st.route_gpx,
      'color',     st.color,
      'waypoints', st.waypoints
    )
    order by st.position, st.created_at
  ) filter (where st.visible), '[]'::jsonb)
  into v_stages
  from event_stages st
  where st.event_id = v_event.id;

  select jsonb_build_object(
    'event', jsonb_build_object(
      'name',       v_event.name,
      'status',     v_event.status,
      'route_gpx',  v_event.route_gpx,
      'route_name', v_event.route_name,
      'starts_at',  v_event.starts_at
    ),
    'stages', v_stages,
    'entrants', coalesce(jsonb_agg(
      jsonb_build_object(
        'id',           ep.id,
        'name',         ep.display_name,
        'number',       ep.rider_number,
        'class',        ep.rider_class,
        'lat',          ep.last_lat,
        'lng',          ep.last_lng,
        'last_seen_at', ep.last_seen_at,
        'device_type',  ep.device_type
      )
      order by ep.rider_number nulls last, ep.display_name
    ) filter (where ep.last_lat is not null), '[]'::jsonb)
  )
  into v_result
  from event_participants ep
  where ep.event_id = v_event.id;

  return v_result;
end;
$$;

grant execute on function public.get_event_live_positions(text) to anon, authenticated;
