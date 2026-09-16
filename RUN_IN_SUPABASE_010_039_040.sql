-- ============================================================
-- WAYPOINT — run this whole file, top to bottom, in the Supabase SQL editor
-- (WAYPOINT TRACKER project). Safe to re-run.
--
-- Part 1 fixes the profile page returning HTTP 400 (and the Waypoint ID
--        showing as a dash): migration 010 was never applied to this
--        project, so profiles has no blood_type / emergency_contact_*
--        columns. get_ice_card() and get_participant_emergency() are
--        broken for the same reason.
-- Part 2 adds the display-name helper (039).
-- Part 3 re-applies beacon_join_event so it uses that helper, which stops
--        mobile joins landing on the roster as "Rider" (040, was 038).
-- ============================================================

-- ========== PART 1 — migration 010: rider / SAR profile fields ==========

alter table public.profiles
  add column if not exists first_name              text,
  add column if not exists last_name               text,
  add column if not exists date_of_birth           date,
  add column if not exists blood_type              text,
  add column if not exists country                 text,
  add column if not exists phone                   text,
  add column if not exists emergency_contact_name  text,
  add column if not exists emergency_contact_phone text,
  add column if not exists emergency_contact_relation text;

-- Keep updated_at honest on any profile edit.
create or replace function public.touch_profile_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute procedure public.touch_profile_updated_at();

-- ========== PART 2 — migration 039: display-name helper ==========
-- 039_join_display_name.sql
-- Join with the name the rider already has.
--
-- beacon_join_event fell back to profiles.first_name/last_name and then to the
-- literal 'Rider'. But a Waypoint display name lives in
-- auth.users.raw_user_meta_data->>'full_name' — that is what signup writes and
-- what the web join route uses. A new account has a name there and nothing in
-- profiles, so every phone join landed on the organizer's roster as "Rider".
--
-- Order now matches the web: what the app passed, then the auth display name,
-- then the profile name, then the email local-part, then 'Rider'. Reading
-- auth.users is fine here — the function is already SECURITY DEFINER and only
-- ever reads the row belonging to the beacon's own owner.

create or replace function public.beacon_display_name(p_user_id uuid)
returns text
language sql
security definer
set search_path = public, auth
as $fn$
  select coalesce(
    nullif(btrim(u.raw_user_meta_data->>'full_name'), ''),
    nullif(btrim(u.raw_user_meta_data->>'name'), ''),
    nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
    nullif(split_part(u.email, '@', 1), ''),
    'Rider'
  )
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = p_user_id;
$fn$;

revoke all on function public.beacon_display_name(uuid) from public, anon, authenticated;

-- ========== PART 3 — migration 040: beacon_join_event ==========
-- 038_beacon_join_event.sql
-- One code box on the phone that does the right thing.
--
-- The app could claim a roster row (037) but could not JOIN an event. The
-- screen that did that, mobile/app/events/join.tsx, was deleted in 8742f61
-- during the three-tab simplification — it looked like a duplicate of the
-- events tab, and join-by-code was the one thing on it with no other home.
--
-- So a rider invited to a free group ride entered the code, matched no roster
-- row (there is none — nobody imported them), and got "no unclaimed entry".
-- Dead end, on the flow most likely to be someone's first experience.
--
-- This resolves both cases server-side so the rider never has to know which
-- one they are in:
--   • a roster row matching their number and unclaimed  → claim it
--   • already a participant                             → say so, no-op
--   • otherwise                                         → join outright
--
-- The capacity and payment rules mirror web/app/api/events/join exactly:
-- comped is uncapped, an org subscription draws from its pool, a paid event is
-- capped at seats_paid, and a free ride is capped at 10. Entrant-pays events
-- are NOT joinable here — the app cannot take payment without app-store
-- billing taking a cut of an organizer's entry fee — so it returns
-- needs_payment and the app sends the rider to the web to finish.

create or replace function public.beacon_join_event(
  p_token        text,
  p_join_code    text,
  p_rider_number text default null,
  p_display_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_beacon   public.device_beacons;
  v_event    public.events;
  v_part     public.event_participants;
  v_existing public.event_participants;
  v_name     text;
  v_limit    int;
  v_count    int;
  v_consumed boolean;
begin
  v_beacon := public.beacon_by_token(p_token);
  if v_beacon.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_device');
  end if;
  if v_beacon.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_claimed');
  end if;

  -- Same throttle as the roster claim: event codes are semi-public.
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

  if v_event.suspended_at is not null then
    return jsonb_build_object('ok', false, 'error', 'suspended');
  end if;
  if v_event.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'error', 'cancelled');
  end if;

  -- ── Already in? ───────────────────────────────────────────────────────────
  select * into v_existing
    from public.event_participants
   where event_id = v_event.id and user_id = v_beacon.user_id
   limit 1;

  if v_existing.id is not null then
    if v_event.payment_mode = 'entrant' and v_existing.paid_at is null then
      return jsonb_build_object('ok', false, 'error', 'needs_payment',
                                'event_name', v_event.name);
    end if;
    return jsonb_build_object('ok', true, 'already_joined', true,
                              'event_id', v_event.id,
                              'event_name', v_event.name,
                              'participant_id', v_existing.id);
  end if;

  -- ── A roster row waiting for them? ────────────────────────────────────────
  -- Only when a rider number was given; matching on nothing would hand out
  -- someone else's entry.
  if p_rider_number is not null and btrim(p_rider_number) <> '' then
    select * into v_part
      from public.event_participants
     where event_id = v_event.id
       and upper(btrim(coalesce(rider_number, ''))) = upper(btrim(p_rider_number))
       and user_id is null
     limit 1
     for update;

    if v_part.id is not null then
      update public.event_participants
         set user_id = v_beacon.user_id
       where id = v_part.id;
      insert into public.roster_claim_attempts (beacon_id, succeeded)
        values (v_beacon.id, true);
      return jsonb_build_object('ok', true, 'claimed', true,
                                'event_id', v_event.id,
                                'event_name', v_event.name,
                                'participant_id', v_part.id);
    end if;
  end if;

  -- ── Entrant-pays: finish on the web ───────────────────────────────────────
  if v_event.payment_mode = 'entrant' then
    return jsonb_build_object('ok', false, 'error', 'needs_payment',
                              'event_name', v_event.name);
  end if;

  -- ── Capacity, mirroring the web join route ────────────────────────────────
  if not coalesce(v_event.comped, false) then
    select public.consume_org_entrant(v_event.id) into v_consumed;
    if v_consumed is not true then
      v_limit := case when coalesce(v_event.paid, false)
                      then coalesce(v_event.seats_paid, 40) else 10 end;
      select count(*) into v_count
        from public.event_participants where event_id = v_event.id;
      if v_count >= v_limit then
        return jsonb_build_object('ok', false,
          'error', case when coalesce(v_event.paid, false) then 'event_full' else 'free_cap_reached' end,
          'limit', v_limit, 'event_name', v_event.name);
      end if;
    end if;
  end if;

  -- Display name: what they passed, else whatever the account already has.
  -- See 039 — the name lives in auth metadata, not profiles, and reading only
  -- profiles put every phone join on the roster as "Rider".
  v_name := nullif(btrim(coalesce(p_display_name, '')), '');
  if v_name is null then
    v_name := public.beacon_display_name(v_beacon.user_id);
  end if;
  v_name := coalesce(v_name, 'Rider');

  insert into public.event_participants
    (event_id, user_id, display_name, role, rider_number)
  values
    (v_event.id, v_beacon.user_id, v_name, 'rider',
     nullif(btrim(coalesce(p_rider_number, '')), ''))
  returning * into v_part;

  insert into public.roster_claim_attempts (beacon_id, succeeded)
    values (v_beacon.id, true);

  return jsonb_build_object('ok', true, 'joined', true,
                            'event_id', v_event.id,
                            'event_name', v_event.name,
                            'participant_id', v_part.id);
end; $fn$;

revoke all on function public.beacon_join_event(text, text, text, text) from public;
grant execute on function public.beacon_join_event(text, text, text, text)
  to anon, authenticated;


-- ========== Reload PostgREST's schema cache ==========
notify pgrst, 'reload schema';

-- ========== Verify ==========
select count(*) filter (where column_name = 'blood_type')                 as blood_type,
       count(*) filter (where column_name = 'emergency_contact_name')     as ice_name,
       count(*) filter (where column_name = 'emergency_contact_phone')    as ice_phone,
       count(*) filter (where column_name = 'emergency_contact_relation') as ice_rel
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles';
