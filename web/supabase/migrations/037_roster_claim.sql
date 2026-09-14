-- 037_roster_claim.sql
-- Let a batch-imported rider link themselves to their own roster row.
--
-- Two ways a rider lands on a roster: the organizer imports a CSV, or the
-- rider self-registers at /join/<code>. Only the second one sets user_id —
-- the import links a row ONLY when the file carries a Waypoint ID column, and
-- race registration produces names, numbers and classes, not Waypoint IDs.
-- So the common case imports unlinked, beacon_events returns nothing, and the
-- event never appears on the rider's Track screen. Silently.
--
-- The rider proves who they are with two things they already have: the event
-- code the organizer gave the field, and their own rider number. No list of
-- entrants is ever returned — nothing to browse, nothing to mis-tap, and no
-- way to harvest a roster by poking at the endpoint.
--
-- Authentication is the device token, not auth.uid(), for the same reason the
-- rest of the beacon surface uses it: the row has to be linked to the account
-- this phone actually feeds. A phone signed in as one account but claimed to
-- another would otherwise link the wrong rider and be very hard to diagnose.

-- ─── Attempt log ─────────────────────────────────────────────────────────────
-- An event code is semi-public — the organizer hands it to the whole field.
-- Rider numbers are short. Without a throttle, anyone holding a code could walk
-- the numbers and take rows out from under riders who had not linked yet.

create table if not exists public.roster_claim_attempts (
  id           uuid primary key default gen_random_uuid(),
  beacon_id    uuid not null references public.device_beacons(id) on delete cascade,
  attempted_at timestamptz not null default now(),
  succeeded    boolean not null default false
);

create index if not exists roster_claim_attempts_beacon_time_idx
  on public.roster_claim_attempts (beacon_id, attempted_at desc);

alter table public.roster_claim_attempts enable row level security;
-- No policies: reachable only through the SECURITY DEFINER functions below.

-- Ten wrong guesses in fifteen minutes and this beacon stops guessing. A rider
-- fat-fingering their own number has plenty of room; an enumerator does not.
create or replace function public.roster_claim_throttled(p_beacon_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $fn$
  select count(*) >= 10
    from public.roster_claim_attempts
   where beacon_id = p_beacon_id
     and succeeded = false
     and attempted_at > now() - interval '15 minutes';
$fn$;

revoke all on function public.roster_claim_throttled(uuid) from public, anon, authenticated;

-- ─── Preview: "is this you?" ─────────────────────────────────────────────────
-- Returns ONE masked name, or nothing. Masking is first name + last initial:
-- enough to recognise yourself, not enough to be useful to anyone else.

create or replace function public.beacon_preview_roster_claim(
  p_token         text,
  p_join_code     text,
  p_rider_number  text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_beacon public.device_beacons;
  v_event  public.events;
  v_part   public.event_participants;
  v_masked text;
  v_parts  text[];
begin
  v_beacon := public.beacon_by_token(p_token);
  if v_beacon.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_device');
  end if;
  if v_beacon.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_claimed');
  end if;

  if public.roster_claim_throttled(v_beacon.id) then
    return jsonb_build_object('ok', false, 'error', 'too_many_attempts');
  end if;

  select * into v_event
    from public.events
   where upper(join_code) = upper(btrim(p_join_code))
   limit 1;

  if v_event.id is null then
    insert into public.roster_claim_attempts (beacon_id, succeeded)
      values (v_beacon.id, false);
    return jsonb_build_object('ok', false, 'error', 'unknown_event');
  end if;

  -- Already on this roster under this account? Nothing to claim.
  if exists (
    select 1 from public.event_participants
     where event_id = v_event.id and user_id = v_beacon.user_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_linked',
                              'event_name', v_event.name);
  end if;

  select * into v_part
    from public.event_participants
   where event_id = v_event.id
     and upper(btrim(coalesce(rider_number, ''))) = upper(btrim(p_rider_number))
     and user_id is null
   limit 1;

  if v_part.id is null then
    insert into public.roster_claim_attempts (beacon_id, succeeded)
      values (v_beacon.id, false);
    return jsonb_build_object('ok', false, 'error', 'no_match',
                              'event_name', v_event.name);
  end if;

  v_parts := regexp_split_to_array(btrim(coalesce(v_part.display_name, '')), '\s+');
  if array_length(v_parts, 1) is null or v_parts[1] = '' then
    v_masked := 'Unnamed entrant';
  elsif array_length(v_parts, 1) = 1 then
    v_masked := v_parts[1];
  else
    v_masked := v_parts[1] || ' ' || upper(left(v_parts[array_length(v_parts, 1)], 1)) || '.';
  end if;

  return jsonb_build_object(
    'ok', true,
    'event_id',     v_event.id,
    'event_name',   v_event.name,
    'masked_name',  v_masked,
    'rider_number', v_part.rider_number,
    'rider_class',  v_part.rider_class
  );
end; $fn$;

revoke all on function public.beacon_preview_roster_claim(text, text, text) from public;
grant execute on function public.beacon_preview_roster_claim(text, text, text)
  to anon, authenticated;

-- ─── Claim ───────────────────────────────────────────────────────────────────
-- Same two factors, re-checked. Only an unlinked row can be taken, so a rider
-- can never displace someone who is already on the map.

create or replace function public.beacon_claim_roster(
  p_token        text,
  p_join_code    text,
  p_rider_number text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_beacon public.device_beacons;
  v_event  public.events;
  v_part   public.event_participants;
begin
  v_beacon := public.beacon_by_token(p_token);
  if v_beacon.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_device');
  end if;
  if v_beacon.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_claimed');
  end if;

  if public.roster_claim_throttled(v_beacon.id) then
    return jsonb_build_object('ok', false, 'error', 'too_many_attempts');
  end if;

  select * into v_event
    from public.events
   where upper(join_code) = upper(btrim(p_join_code))
   limit 1;
  if v_event.id is null then
    insert into public.roster_claim_attempts (beacon_id, succeeded)
      values (v_beacon.id, false);
    return jsonb_build_object('ok', false, 'error', 'unknown_event');
  end if;

  if exists (
    select 1 from public.event_participants
     where event_id = v_event.id and user_id = v_beacon.user_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_linked');
  end if;

  -- Lock the candidate so two riders racing on the same number cannot both win.
  select * into v_part
    from public.event_participants
   where event_id = v_event.id
     and upper(btrim(coalesce(rider_number, ''))) = upper(btrim(p_rider_number))
     and user_id is null
   limit 1
   for update;

  if v_part.id is null then
    insert into public.roster_claim_attempts (beacon_id, succeeded)
      values (v_beacon.id, false);
    return jsonb_build_object('ok', false, 'error', 'no_match');
  end if;

  update public.event_participants
     set user_id = v_beacon.user_id
   where id = v_part.id;

  insert into public.roster_claim_attempts (beacon_id, succeeded)
    values (v_beacon.id, true);

  return jsonb_build_object('ok', true,
                            'event_id', v_event.id,
                            'event_name', v_event.name,
                            'participant_id', v_part.id);
end; $fn$;

revoke all on function public.beacon_claim_roster(text, text, text) from public;
grant execute on function public.beacon_claim_roster(text, text, text)
  to anon, authenticated;

-- ─── Release ─────────────────────────────────────────────────────────────────
-- A wrong claim has to be a ten-second fix, not a support ticket. Releasing
-- puts the row back exactly as the organizer imported it — the rider number,
-- class and name are the organizer's data and are left untouched.

create or replace function public.beacon_release_roster(
  p_token    text,
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_beacon public.device_beacons;
  v_id     uuid;
begin
  v_beacon := public.beacon_by_token(p_token);
  if v_beacon.id is null or v_beacon.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_device');
  end if;

  select id into v_id
    from public.event_participants
   where event_id = p_event_id and user_id = v_beacon.user_id
   limit 1;

  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_linked');
  end if;

  update public.event_participants
     set user_id = null
   where id = v_id;

  -- Any beacon pointed at this event must stop pointing at it.
  update public.device_beacons
     set active_event_id = null, active_participant_id = null
   where user_id = v_beacon.user_id and active_event_id = p_event_id;

  return jsonb_build_object('ok', true);
end; $fn$;

revoke all on function public.beacon_release_roster(text, uuid) from public;
grant execute on function public.beacon_release_roster(text, uuid) to anon, authenticated;
