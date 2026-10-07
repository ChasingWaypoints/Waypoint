-- ============================================================
-- Migration v48 — Radio sign-up by code, not by link
--
-- Handing 50 marshals 50 links doesn't work. Each comms-enabled event now has
-- two short codes:
--
--   comms_staff_code    marshals, sweep, medics. Shareable: say it at the
--                       riders' meeting, print it as a QR.
--   comms_control_code  race control. Keep it to the core team.
--
-- Someone enters a code + their name (app or waypointtracking.com/radio) and
-- gets their OWN radio identity: a row in event_radio_members with a private
-- token. So their name shows when they talk and the organizer can revoke one
-- person without changing the code for everyone.
--
-- Deliberately a separate table from event_gep_credentials: a command link
-- opens the full Command View (positions + ICE). A radio code must not.
-- A radio member token only works for comms.
--
-- Riders need no code: joining the event in the app (join code) already gives
-- the phone a beacon identity, which comms_actor (047) resolves.
--
-- Run in the WAYPOINT TRACKER Supabase project, AFTER 047. Safe to re-run.
-- ============================================================

-- ── Codes on the event ─────────────────────────────────────────────────────
alter table public.events add column if not exists comms_staff_code   text;
alter table public.events add column if not exists comms_control_code text;
create unique index if not exists events_comms_staff_code_key
  on public.events (comms_staff_code) where comms_staff_code is not null;
create unique index if not exists events_comms_control_code_key
  on public.events (comms_control_code) where comms_control_code is not null;

-- 6 characters, no 0/O/1/I so it survives being shouted across a parking lot.
create or replace function public.gen_comms_code()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_alpha constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  i int;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alpha, 1 + floor(random() * length(v_alpha))::int, 1);
    end loop;
    exit when not exists (
      select 1 from public.events
       where comms_staff_code = v_code or comms_control_code = v_code);
  end loop;
  return v_code;
end; $fn$;
revoke all on function public.gen_comms_code() from public, anon, authenticated;

-- Normalise what people type: case, spaces, dashes.
create or replace function public.norm_comms_code(p text)
returns text language sql immutable as $$
  select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g'))
$$;

-- ── Radio members (people who joined with a code) ──────────────────────────
create table if not exists public.event_radio_members (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  display_name  text not null,
  comms_role    text not null default 'staff',
  token_hash    text not null unique,      -- sha256 of the member's token
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz,
  revoked_at    timestamptz,
  constraint radio_members_role_chk check (comms_role in ('staff','control'))
);
create index if not exists event_radio_members_event_idx on public.event_radio_members (event_id);

alter table public.event_radio_members enable row level security;
drop policy if exists "organizer reads radio members" on public.event_radio_members;
create policy "organizer reads radio members" on public.event_radio_members
  for select using (exists (
    select 1 from public.events e
     where e.id = event_radio_members.event_id and e.organizer_id = auth.uid()));

create or replace function public.radio_token_hash(p_token text)
returns text language sql immutable as $$
  select encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
$$;

-- ── Organizer or super admin? ──────────────────────────────────────────────
create or replace function public.comms_can_manage(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (select 1 from public.events e
                  where e.id = p_event_id and e.organizer_id = auth.uid())
      or coalesce((select p.is_super_admin from public.profiles p where p.id = auth.uid()), false);
$fn$;
revoke all on function public.comms_can_manage(uuid) from public, anon;
grant execute on function public.comms_can_manage(uuid) to authenticated;

-- ── Redeem a code: anyone with a code + a name ─────────────────────────────
create or replace function public.comms_redeem_code(p_code text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_code  text := public.norm_comms_code(p_code);
  v_name  text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  e       record;
  v_role  text;
  v_token text;
  v_id    uuid;
  v_count int;
begin
  if length(v_code) <> 6 then
    return jsonb_build_object('ok', false, 'error', 'bad_code');
  end if;
  if length(v_name) < 2 or length(v_name) > 40 then
    return jsonb_build_object('ok', false, 'error', 'bad_name');
  end if;

  select ev.id, ev.name, ev.status::text as status, ev.comms_enabled,
         ev.comms_staff_code, ev.comms_control_code
    into e
    from public.events ev
   where ev.comms_staff_code = v_code or ev.comms_control_code = v_code
   limit 1;

  if e.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_code');
  end if;
  if not coalesce(e.comms_enabled, false) then
    return jsonb_build_object('ok', false, 'error', 'comms_disabled');
  end if;
  if e.status in ('completed', 'cancelled') then
    return jsonb_build_object('ok', false, 'error', 'event_closed');
  end if;

  -- A leaked code can't flood an event.
  select count(*) into v_count from public.event_radio_members
   where event_id = e.id and revoked_at is null;
  if v_count >= 300 then
    return jsonb_build_object('ok', false, 'error', 'event_full');
  end if;

  v_role  := case when v_code = e.comms_control_code then 'control' else 'staff' end;
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.event_radio_members (event_id, display_name, comms_role, token_hash)
  values (e.id, v_name, v_role, public.radio_token_hash(v_token))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'token', v_token, 'member_id', v_id,
    'event_id', e.id, 'event_name', e.name, 'role', v_role, 'label', v_name);
end; $fn$;
revoke all on function public.comms_redeem_code(text, text) from public;
grant execute on function public.comms_redeem_code(text, text) to anon, authenticated;

-- ── comms_actor learns a third identity: radio members ('r:<id>') ──────────
create or replace function public.comms_actor(p_token text)
returns table (
  event_id uuid, identity text, participant_id uuid, credential_id uuid,
  label text, rider_number text, rider_class text, role text
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $fn$
#variable_conflict use_column
declare
  v   public.device_beacons;
  ep  public.event_participants;
  r   record;
  m   public.event_radio_members;
  v_role text;
begin
  if p_token is null or length(btrim(p_token)) < 8 then return; end if;

  -- 1) phone beacon (riders)
  v := public.beacon_by_token(p_token);
  if v.id is not null and v.active_participant_id is not null then
    select * into ep from public.event_participants x where x.id = v.active_participant_id;
    if ep.id is not null then
      event_id       := ep.event_id;
      identity       := 'p:' || ep.id::text;
      participant_id := ep.id;
      credential_id  := null;
      label          := coalesce(nullif(btrim(ep.display_name), ''), 'Rider');
      rider_number   := ep.rider_number;
      rider_class    := nullif(btrim(ep.rider_class), '');
      role           := coalesce(ep.comms_role, 'rider');
      return next;
      return;
    end if;
  end if;

  -- 2) radio member (joined with a staff/control code)
  select * into m from public.event_radio_members x
   where x.token_hash = public.radio_token_hash(btrim(p_token))
     and x.revoked_at is null;
  if m.id is not null then
    event_id       := m.event_id;
    identity       := 'r:' || m.id::text;
    participant_id := null;
    credential_id  := null;
    label          := m.display_name;
    rider_number   := null;
    rider_class    := null;
    role           := m.comms_role;
    return next;
    return;
  end if;

  -- 3) command-link credential
  select * into r from public.command_credential_event(p_token);
  if r.event_id is not null then
    select coalesce(c.comms_role, 'staff') into v_role
      from public.event_gep_credentials c where c.id = r.credential_id;
    event_id       := r.event_id;
    identity       := 'c:' || r.credential_id::text;
    participant_id := null;
    credential_id  := r.credential_id;
    label          := coalesce(r.credential_label, 'Command');
    rider_number   := null;
    rider_class    := null;
    role           := coalesce(v_role, 'staff');
    return next;
  end if;
end; $fn$;
revoke all on function public.comms_actor(text) from public, anon, authenticated;

-- Webhook check knows radio members too.
create or replace function public.comms_identity_can_talk(
  p_event_id uuid, p_identity text, p_channel_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare v_role text; v_class text; v_id uuid; v_can boolean;
begin
  if p_identity like 'p:%' then
    v_id := substring(p_identity from 3)::uuid;
    select coalesce(ep.comms_role, 'rider'), nullif(btrim(ep.rider_class), '')
      into v_role, v_class
      from public.event_participants ep
     where ep.id = v_id and ep.event_id = p_event_id;
  elsif p_identity like 'c:%' then
    v_id := substring(p_identity from 3)::uuid;
    select coalesce(c.comms_role, 'staff') into v_role
      from public.event_gep_credentials c
     where c.id = v_id and c.event_id = p_event_id;
  elsif p_identity like 'r:%' then
    v_id := substring(p_identity from 3)::uuid;
    select m.comms_role into v_role
      from public.event_radio_members m
     where m.id = v_id and m.event_id = p_event_id and m.revoked_at is null;
  end if;
  if v_role is null then return false; end if;

  select r.can_talk into v_can
    from public.comms_rights(p_event_id, v_role, v_class) r
   where r.channel_id = p_channel_id;
  return coalesce(v_can, false);
exception when invalid_text_representation then
  return false;
end; $fn$;
revoke all on function public.comms_identity_can_talk(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.comms_identity_can_talk(uuid, text, uuid) to service_role;

-- ── Organizer: see codes + who joined ──────────────────────────────────────
create or replace function public.get_event_comms(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare e record; v_members jsonb;
begin
  if not public.comms_can_manage(p_event_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select ev.comms_enabled, ev.comms_staff_code, ev.comms_control_code
    into e from public.events ev where ev.id = p_event_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id, 'name', m.display_name, 'role', m.comms_role,
           'joined_at', m.created_at, 'revoked', m.revoked_at is not null)
           order by m.revoked_at nulls first, m.created_at), '[]'::jsonb)
    into v_members
    from public.event_radio_members m where m.event_id = p_event_id;

  return jsonb_build_object(
    'enabled', coalesce(e.comms_enabled, false),
    'staff_code', e.comms_staff_code,
    'control_code', e.comms_control_code,
    'can_toggle', coalesce((select p.is_super_admin from public.profiles p where p.id = auth.uid()), false),
    'members', v_members);
end; $fn$;
revoke all on function public.get_event_comms(uuid) from public, anon;
grant execute on function public.get_event_comms(uuid) to authenticated;

-- New code (old one stops working; people already in keep their access).
create or replace function public.regenerate_comms_code(p_event_id uuid, p_kind text)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare v_code text;
begin
  if not public.comms_can_manage(p_event_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  v_code := public.gen_comms_code();
  if p_kind = 'staff' then
    update public.events set comms_staff_code = v_code where id = p_event_id;
  elsif p_kind = 'control' then
    update public.events set comms_control_code = v_code where id = p_event_id;
  else
    raise exception 'bad kind' using errcode = '22023';
  end if;
  return v_code;
end; $fn$;
revoke all on function public.regenerate_comms_code(uuid, text) from public, anon;
grant execute on function public.regenerate_comms_code(uuid, text) to authenticated;

-- Remove one person; returns their LiveKit identity so the API can kick them.
create or replace function public.revoke_radio_member(p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare m public.event_radio_members;
begin
  select * into m from public.event_radio_members where id = p_member_id;
  if m.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if not public.comms_can_manage(m.event_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  update public.event_radio_members set revoked_at = now()
   where id = m.id and revoked_at is null;

  update public.event_transmissions set ended_at = now()
   where event_id = m.event_id and identity = 'r:' || m.id::text and ended_at is null;
  update public.channel_floor
     set transmission_id = null, identity = null, holder_label = null,
         priority = false, expires_at = null
   where event_id = m.event_id and identity = 'r:' || m.id::text;

  return jsonb_build_object('ok', true, 'event_id', m.event_id,
    'room', 'event:' || m.event_id::text, 'identity', 'r:' || m.id::text);
end; $fn$;
revoke all on function public.revoke_radio_member(uuid) from public, anon;
grant execute on function public.revoke_radio_member(uuid) to authenticated;

-- ── Turning comms on also issues the codes ─────────────────────────────────
create or replace function public.set_event_comms(p_event_id uuid, p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare v_channels integer := 0;
begin
  if not coalesce((select p.is_super_admin from public.profiles p where p.id = auth.uid()), false) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  update public.events set comms_enabled = coalesce(p_enabled, false) where id = p_event_id;
  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;

  if p_enabled then
    v_channels := public.ensure_event_channels(p_event_id);
    update public.events
       set comms_staff_code   = coalesce(comms_staff_code,   public.gen_comms_code()),
           comms_control_code = coalesce(comms_control_code, public.gen_comms_code())
     where id = p_event_id;
  end if;

  return jsonb_build_object('ok', true, 'enabled', coalesce(p_enabled, false),
                            'channels_created', v_channels);
end; $fn$;
revoke all on function public.set_event_comms(uuid, boolean) from public, anon;
grant execute on function public.set_event_comms(uuid, boolean) to authenticated;

-- Events already switched on get their codes now.
update public.events set comms_staff_code = public.gen_comms_code()
 where comms_enabled and comms_staff_code is null;
update public.events set comms_control_code = public.gen_comms_code()
 where comms_enabled and comms_control_code is null;
