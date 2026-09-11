-- ============================================================
-- Migration v41 — repoint emergency lookup to event-scoped ICE, then drop the
-- last standing profile health columns.
--
-- get_participant_emergency() used to return the linked rider's PROFILE health
-- data (blood_type, emergency_contact_*). It now returns the EVENT roster's ICE
-- (event_participants.blood_type/allergies/ice_name/ice_phone) — entered at
-- registration and purged 7 days after the event — plus non-health identity
-- (name/phone/waypoint_id) from the linked account.
--
-- Run AFTER the app change (TrackingMap renderEmergency) is deployed.
-- Safe to re-run.
-- ============================================================

create or replace function public.get_participant_emergency(p_participant_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid; ep record; v_fn text; v_ln text; v_phone text; v_wpid text;
begin
  select * into ep from event_participants where id = p_participant_id;
  if not found then return jsonb_build_object('error', 'not_found'); end if;

  -- Only the event's organizer may read a rider's emergency info.
  select organizer_id into v_org from events where id = ep.event_id;
  if v_org is null or v_org <> auth.uid() then
    return jsonb_build_object('error', 'forbidden');
  end if;

  -- Non-health identity from the linked account, if any.
  if ep.user_id is not null then
    select first_name, last_name, phone, waypoint_id
      into v_fn, v_ln, v_phone, v_wpid
      from profiles where id = ep.user_id;
  end if;

  return jsonb_build_object(
    'linked', ep.user_id is not null,
    'name', coalesce(nullif(trim(coalesce(v_fn, '') || ' ' || coalesce(v_ln, '')), ''), ep.display_name),
    'phone', v_phone,
    'waypoint_id', v_wpid,
    -- Event-scoped ICE (event_participants):
    'blood_type', ep.blood_type,
    'allergies', ep.allergies,
    'emergency_contact_name', ep.ice_name,
    'emergency_contact_phone', ep.ice_phone
  );
end; $$;

-- No caller reads these profile columns any more — drop the standing health data.
alter table public.profiles
  drop column if exists blood_type,
  drop column if exists emergency_contact_name,
  drop column if exists emergency_contact_phone,
  drop column if exists emergency_contact_relation;
