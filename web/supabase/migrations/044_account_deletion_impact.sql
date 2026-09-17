-- ============================================================
-- Migration v44 — tell an organizer what deleting their account destroys
--
-- events.organizer_id cascades from auth.users, which is correct for a
-- deletion request but has a consequence the current dialog does not mention:
-- deleting an organizer's account deletes EVERY event they created, and with
-- each event goes every rider's roster entry and event track points. Riders
-- who were never asked lose their ride record.
--
-- "This permanently deletes your account, all trips, and track data" is true
-- for a rider and badly incomplete for an organizer. This returns the real
-- numbers so the app can say what will actually happen.
--
-- SECURITY DEFINER because it counts rows across other people's participant
-- entries, but it only ever reports on the CALLER's own account — p_user_id
-- is not a parameter, auth.uid() is the only input.
--
-- Run AFTER 043. Safe to re-run.
-- ============================================================

create or replace function public.account_deletion_impact()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $fn$
declare
  v_uid    uuid := auth.uid();
  v_events int;
  v_riders int;
  v_trips  int;
  v_live   int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  select count(*) into v_events
    from public.events where organizer_id = v_uid;

  -- Other people on those rosters. The organizer's own row does not count as
  -- somebody else losing data.
  select count(*) into v_riders
    from public.event_participants p
    join public.events e on e.id = p.event_id
   where e.organizer_id = v_uid
     and coalesce(p.role, '') <> 'organizer'
     and (p.user_id is null or p.user_id <> v_uid);

  -- Events that have not ended yet — deleting mid-season is the bad case.
  select count(*) into v_live
    from public.events
   where organizer_id = v_uid
     and (ends_at is null or ends_at >= now());

  select count(*) into v_trips
    from public.trips where user_id = v_uid;

  return jsonb_build_object(
    'ok', true,
    'is_organizer', v_events > 0,
    'events', v_events,
    'events_not_ended', v_live,
    'riders_affected', v_riders,
    'trips', v_trips
  );
end; $fn$;

grant execute on function public.account_deletion_impact() to authenticated;

notify pgrst, 'reload schema';
