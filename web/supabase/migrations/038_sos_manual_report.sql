-- ============================================================
-- Migration v38 — SOS incident: manual "reported by someone else" support
--
-- In the backcountry the injured rider often can't trigger their own SOS — a
-- buddy rides out for signal, or dispatch gets a call. This lets the organizer
-- open an incident ON a rider, recording how the alarm was raised (device vs
-- manual), who reported it, and a corrected location when the rider's last fix
-- is stale.
--
-- Run in the WAYPOINT TRACKER Supabase project, AFTER 037. Safe to re-run.
-- ============================================================

alter table public.sos_incidents
  add column if not exists source      text default 'device',   -- 'device' | 'manual'
  add column if not exists reported_by text,                     -- e.g. another rider's name/number
  add column if not exists opened_by   uuid references public.profiles(id);

-- Replace open_sos_incident with the richer signature. Drop the old one first
-- so there's no ambiguous overload.
drop function if exists public.open_sos_incident(uuid);

create or replace function public.open_sos_incident(
  p_participant_id uuid,
  p_source      text default 'device',
  p_reported_by text default null,
  p_note        text default null,
  p_lat         double precision default null,
  p_lng         double precision default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_event uuid; v_id uuid; ep record;
begin
  select * into ep from public.event_participants where id = p_participant_id;
  if ep is null then raise exception 'participant not found'; end if;
  v_event := ep.event_id;
  if not public.is_event_organizer(v_event) then raise exception 'not authorized'; end if;

  -- Return the already-open incident if one exists.
  select id into v_id from public.sos_incidents
    where participant_id = p_participant_id and status = 'open'
    order by opened_at desc limit 1;
  if v_id is not null then return v_id; end if;

  insert into public.sos_incidents
    (event_id, participant_id, source, reported_by, opened_by,
     trigger_lat, trigger_lng, ice_snapshot)
  values
    (v_event, p_participant_id, coalesce(p_source, 'device'), p_reported_by, auth.uid(),
     coalesce(p_lat, ep.last_lat), coalesce(p_lng, ep.last_lng),
     jsonb_build_object('name', ep.display_name, 'number', ep.rider_number,
       'ice_name', ep.ice_name, 'ice_phone', ep.ice_phone,
       'blood_type', ep.blood_type, 'allergies', ep.allergies))
  returning id into v_id;

  insert into public.sos_incident_log (incident_id, kind, operator_id, note)
  values (v_id, 'note', auth.uid(),
    case when coalesce(p_source,'device') = 'manual'
         then 'Incident opened manually' || coalesce(' — reported by ' || p_reported_by, '')
              || coalesce(': ' || p_note, '')
         else 'Incident opened' end);

  -- Mirror onto the participant's SOS flag so the live map lights up too.
  update public.event_participants
     set sos_at = now(), sos_cleared_at = null
   where id = p_participant_id;

  return v_id;
end; $$;

revoke all on function public.open_sos_incident(uuid, text, text, text, double precision, double precision) from public;
grant execute on function public.open_sos_incident(uuid, text, text, text, double precision, double precision) to authenticated;

-- When an incident resolves, also clear the rider's SOS flag.
create or replace function public.log_sos_event(p_incident_id uuid, p_kind text, p_note text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_event uuid; v_part uuid; v_log bigint;
begin
  select event_id, participant_id into v_event, v_part from public.sos_incidents where id = p_incident_id;
  if v_event is null then raise exception 'incident not found'; end if;
  if not public.is_event_organizer(v_event) then raise exception 'not authorized'; end if;
  insert into public.sos_incident_log (incident_id, kind, operator_id, note)
  values (p_incident_id, p_kind, auth.uid(), p_note)
  returning id into v_log;
  if p_kind = 'resolved' then
    update public.sos_incidents set status = 'resolved', resolved_at = now() where id = p_incident_id;
    update public.event_participants set sos_cleared_at = now() where id = v_part;
  end if;
  return v_log;
end; $$;
