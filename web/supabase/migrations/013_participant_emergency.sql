-- ============================================================
-- Migration v13 — Emergency info for linked entrants (SAR)
--
-- Two things:
--  1. get_event_live_positions now flags each entrant as linked or not
--     (a boolean only — no personal data on the public feed).
--  2. get_participant_emergency returns the linked account's emergency
--     details, but ONLY to the event's organizer (checked inside the
--     SECURITY DEFINER function via auth.uid()).
-- Run after 012. Safe to re-run.
-- ============================================================

-- ── Live feed: add a linked flag (safe, boolean only) ──
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
        'last_seen_at', ep.last_seen_at, 'device_type', ep.device_type,
        'linked', (ep.user_id is not null))
      order by ep.rider_number nulls last, ep.display_name
    ) filter (where ep.last_lat is not null), '[]'::jsonb)
  ) into v_result
  from event_participants ep where ep.event_id = v_event.id;

  return v_result;
end; $$;
grant execute on function public.get_event_live_positions(text) to anon, authenticated;

-- ── Emergency details — organizer only ──
create or replace function public.get_participant_emergency(p_participant_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_event uuid; v_org uuid; v jsonb;
begin
  select ep.user_id, ep.event_id into v_user, v_event
    from event_participants ep where ep.id = p_participant_id;
  if v_event is null then return jsonb_build_object('error', 'not_found'); end if;

  -- Only the event's organizer may read a rider's emergency info.
  select organizer_id into v_org from events where id = v_event;
  if v_org is null or v_org <> auth.uid() then
    return jsonb_build_object('error', 'forbidden');
  end if;

  if v_user is null then
    return jsonb_build_object('linked', false);
  end if;

  select jsonb_build_object(
    'linked', true,
    'name', nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''),
    'phone', phone,
    'blood_type', blood_type,
    'date_of_birth', date_of_birth,
    'country', country,
    'emergency_contact_name', emergency_contact_name,
    'emergency_contact_phone', emergency_contact_phone,
    'emergency_contact_relation', emergency_contact_relation,
    'waypoint_id', waypoint_id
  ) into v from profiles where id = v_user;

  return coalesce(v, jsonb_build_object('linked', true));
end; $$;
revoke all on function public.get_participant_emergency(uuid) from public;
grant execute on function public.get_participant_emergency(uuid) to authenticated;
