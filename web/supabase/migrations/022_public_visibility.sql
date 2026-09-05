-- 022_public_visibility.sql
-- Honor the public course-visibility toggles (added in 020) on the public feed:
-- when public_show_route is off, hide stage route lines; when
-- public_show_waypoints is off, hide stage waypoints. Organizer + command feeds
-- are unaffected. Safe to re-run.

create or replace function public.get_event_live_positions(p_share_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_event record; v_result jsonb; v_stages jsonb;
begin
  select id, name, status, route_name, starts_at, logo_url, sponsors,
         payment_mode, suspended_at, public_show_route, public_show_waypoints
    into v_event from events where share_token = p_share_token limit 1;
  if v_event.id is null then return null; end if;
  if v_event.suspended_at is not null then return null; end if;  -- suspended = dark

  select coalesce(jsonb_agg(
    jsonb_build_object('id', st.id, 'name', st.name, 'color', st.color,
      'route_line', case when v_event.public_show_route then st.route_line else null end,
      'waypoints',  case when v_event.public_show_waypoints then st.waypoints else '[]'::jsonb end)
    order by st.position, st.created_at
  ) filter (where st.visible), '[]'::jsonb)
  into v_stages from event_stages st where st.event_id = v_event.id;

  select jsonb_build_object(
    'event', jsonb_build_object('name', v_event.name, 'status', v_event.status,
      'route_name', v_event.route_name, 'starts_at', v_event.starts_at,
      'logo_url', v_event.logo_url, 'sponsors', coalesce(v_event.sponsors, '[]'::jsonb)),
    'stages', v_stages,
    'entrants', coalesce(jsonb_agg(
      jsonb_build_object('id', ep.id, 'name', ep.display_name, 'number', ep.rider_number,
        'class', ep.rider_class, 'lat', ep.last_lat, 'lng', ep.last_lng,
        'last_seen_at', ep.last_seen_at, 'device_type', ep.device_type)
      order by ep.rider_number nulls last, ep.display_name
    ) filter (where ep.last_lat is not null
              and (v_event.payment_mode <> 'entrant' or ep.paid_at is not null)),
      '[]'::jsonb)
  ) into v_result
  from event_participants ep where ep.event_id = v_event.id;

  return v_result;
end; $$;
grant execute on function public.get_event_live_positions(text) to anon, authenticated;
