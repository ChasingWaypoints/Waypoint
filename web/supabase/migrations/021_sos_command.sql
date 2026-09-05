-- 021_sos_command.sql
-- In-app SOS + Command View feed.
--  * record_entrant_fix gains p_sos so the poller can arm SOS on a fix (same
--    anon trust model it already has — no new surface).
--  * clear_participant_sos: organizer/super-admin acknowledges an SOS.
--  * get_command_for_event / get_command_by_token: the credentialed feed that
--    carries SOS + ICE (NEVER the public get_event_live_positions).
-- Safe to re-run.

-- ── record_entrant_fix + optional SOS arm ──────────────────────────────────
create or replace function public.record_entrant_fix(
  p_participant_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_recorded_at timestamptz,
  p_altitude_m double precision default null,
  p_speed_kmh double precision default null,
  p_message text default null,
  p_source text default null,
  p_sos boolean default false
)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_event_id uuid; v_inserted boolean := false;
begin
  select event_id into v_event_id from event_participants where id = p_participant_id;
  if v_event_id is null then return false; end if;
  insert into event_track_points
    (participant_id, event_id, lat, lng, altitude_m, speed_kmh, message, source, recorded_at)
  values
    (p_participant_id, v_event_id, p_lat, p_lng, p_altitude_m, p_speed_kmh, p_message, p_source, p_recorded_at)
  on conflict (participant_id, recorded_at) do nothing;
  get diagnostics v_inserted = row_count;
  update event_participants
     set last_lat = p_lat, last_lng = p_lng, last_seen_at = p_recorded_at
   where id = p_participant_id
     and (last_seen_at is null or p_recorded_at > last_seen_at);
  -- Arm SOS if the beacon reported one and it isn't already active.
  if p_sos then
    update event_participants
       set sos_at = now(), sos_cleared_at = null
     where id = p_participant_id
       and (sos_at is null or sos_cleared_at is not null);
  end if;
  return v_inserted;
end;
$$;
grant execute on function public.record_entrant_fix(uuid, double precision, double precision, timestamptz, double precision, double precision, text, text, boolean) to anon, authenticated;

-- ── Organizer/super acknowledges (clears) an SOS ───────────────────────────
create or replace function public.clear_participant_sos(p_participant_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select e.organizer_id into v_org
    from event_participants ep join events e on e.id = ep.event_id
   where ep.id = p_participant_id;
  if v_org is null then raise exception 'not_found'; end if;
  if v_org <> auth.uid()
     and not coalesce((select is_super_admin from profiles where id = auth.uid()), false) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  update event_participants set sos_cleared_at = now()
   where id = p_participant_id and sos_at is not null and sos_cleared_at is null;
end;
$$;
grant execute on function public.clear_participant_sos(uuid) to authenticated;

-- ── Shared command payload (SOS + ICE) — internal helper ───────────────────
create or replace function public.build_command_payload(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_event record; v_stages jsonb; v_result jsonb;
begin
  select id, name, status, route_name, starts_at, logo_url, sponsors,
         payment_mode, suspended_at
    into v_event from events where id = p_event_id;
  if v_event.id is null then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name, 'color', st.color,
      'route_line', st.route_line, 'waypoints', st.waypoints)
    order by st.position, st.created_at) filter (where st.visible), '[]'::jsonb)
  into v_stages from event_stages st where st.event_id = v_event.id;

  select jsonb_build_object(
    'event', jsonb_build_object('name', v_event.name, 'status', v_event.status,
      'route_name', v_event.route_name, 'starts_at', v_event.starts_at,
      'logo_url', v_event.logo_url, 'sponsors', coalesce(v_event.sponsors, '[]'::jsonb),
      'suspended', v_event.suspended_at is not null),
    'stages', v_stages,
    'entrants', coalesce(jsonb_agg(jsonb_build_object(
        'id', ep.id, 'name', ep.display_name, 'number', ep.rider_number,
        'class', ep.rider_class, 'lat', ep.last_lat, 'lng', ep.last_lng,
        'last_seen_at', ep.last_seen_at, 'device_type', ep.device_type,
        'linked', ep.user_id is not null,
        'sos', (ep.sos_at is not null and (ep.sos_cleared_at is null or ep.sos_cleared_at < ep.sos_at)),
        'ice', jsonb_build_object('name', ep.ice_name, 'phone', ep.ice_phone,
          'blood_type', ep.blood_type, 'allergies', ep.allergies))
      order by ep.rider_number nulls last, ep.display_name)
      filter (where ep.last_lat is not null
              and (v_event.payment_mode <> 'entrant' or ep.paid_at is not null)),
      '[]'::jsonb)
  ) into v_result
  from event_participants ep where ep.event_id = v_event.id;

  return v_result;
end;
$$;
-- internal only: not granted to anon/authenticated directly

-- ── Organizer/super command feed ───────────────────────────────────────────
create or replace function public.get_command_for_event(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select organizer_id into v_org from events where id = p_event_id;
  if v_org is null then return null; end if;
  if v_org <> auth.uid()
     and not coalesce((select is_super_admin from profiles where id = auth.uid()), false) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  return build_command_payload(p_event_id);
end;
$$;
grant execute on function public.get_command_for_event(uuid) to authenticated;

-- ── Command View feed by credential/participant token (no login) ───────────
create or replace function public.get_command_by_token(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_event_id uuid;
begin
  if p_token is null or length(trim(p_token)) < 8 then return null; end if;
  select event_id into v_event_id from event_gep_credentials where gep_token = trim(p_token) limit 1;
  if v_event_id is null then
    select event_id into v_event_id from event_participants where gep_token = trim(p_token) limit 1;
  end if;
  if v_event_id is null then return null; end if;
  return build_command_payload(v_event_id);
end;
$$;
grant execute on function public.get_command_by_token(text) to anon, authenticated;
