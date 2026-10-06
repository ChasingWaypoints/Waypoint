-- ============================================================
-- Migration v47 — Waypoint Comms: live push-to-talk for events
--
-- Voice itself never touches Postgres. It is LIVE audio carried by LiveKit
-- (one room per event, room name 'event:<event_id>'). Postgres is the source
-- of truth for the parts that need a referee:
--
--   event_channels       the channels an event has (Race Control, Staff,
--                        All Riders, one per rider class)
--   event_transmissions  the talk log: one row per press of the button
--   channel_floor        who holds each channel right now (half-duplex,
--                        like a radio: one speaker per channel)
--
-- Who is talking is resolved the same two ways the rest of the app already
-- trusts, with no Waypoint login:
--   * a phone's beacon device token (036)        -> identity 'p:<participant>'
--   * a command-link credential (046 pattern)   -> identity 'c:<credential>'
--
-- Nothing is queued. If a phone has no signal it cannot take the floor, and
-- nothing it "said" is delivered later. Positions keep using pingQueue.
--
-- SOS boundary: nothing here creates or arms an SOS. Emergency alerts stay
-- with satellite beacons (via the poller) and organizer manual reports.
--
-- comms_enabled is switched by a SUPER ADMIN only until comms billing exists.
--
-- Run in the WAYPOINT TRACKER Supabase project, AFTER 046. Safe to re-run.
-- ============================================================

-- ── Columns ────────────────────────────────────────────────────────────────
alter table public.events
  add column if not exists comms_enabled boolean not null default false;

alter table public.event_participants
  add column if not exists comms_role text not null default 'rider';

alter table public.event_gep_credentials
  add column if not exists comms_role text not null default 'staff';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ep_comms_role_chk') then
    alter table public.event_participants
      add constraint ep_comms_role_chk
      check (comms_role in ('rider','marshal','sweep','medic','control'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'gep_comms_role_chk') then
    alter table public.event_gep_credentials
      add constraint gep_comms_role_chk
      check (comms_role in ('control','staff','listen'));
  end if;
end $$;

-- ── Channels ───────────────────────────────────────────────────────────────
create table if not exists public.event_channels (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events(id) on delete cascade,
  kind         text not null,
  name         text not null,
  rider_class  text,
  sort         integer not null default 0,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  constraint event_channels_kind_chk
    check (kind in ('race_control','staff','all_riders','class')),
  constraint event_channels_unique
    unique nulls not distinct (event_id, kind, rider_class)
);
create index if not exists event_channels_event_idx on public.event_channels (event_id);

-- ── Talk log ───────────────────────────────────────────────────────────────
create table if not exists public.event_transmissions (
  id                     uuid primary key default gen_random_uuid(),
  event_id               uuid not null references public.events(id) on delete cascade,
  channel_id             uuid not null references public.event_channels(id) on delete cascade,
  participant_id         uuid references public.event_participants(id) on delete set null,
  created_by_credential  uuid references public.event_gep_credentials(id) on delete set null,
  identity               text not null,      -- LiveKit identity, p:<id> / c:<id>
  speaker_label          text,               -- snapshotted; survives deletions
  speaker_number         text,
  priority               boolean not null default false,  -- race-control all-call
  started_at             timestamptz not null default now(),
  ended_at               timestamptz,
  lat                    double precision,
  lng                    double precision,
  recording_path         text,               -- Race Control only, set by Egress
  cleared_at             timestamptz         -- all-call withdrawn by race control
);
create index if not exists event_transmissions_event_idx
  on public.event_transmissions (event_id, started_at desc);
create index if not exists event_transmissions_open_allcall_idx
  on public.event_transmissions (event_id, started_at desc)
  where priority and cleared_at is null;

-- ── Floor (who holds each channel) ─────────────────────────────────────────
create table if not exists public.channel_floor (
  channel_id       uuid primary key references public.event_channels(id) on delete cascade,
  event_id         uuid not null references public.events(id) on delete cascade,
  transmission_id  uuid references public.event_transmissions(id) on delete set null,
  identity         text,
  holder_label     text,
  priority         boolean not null default false,
  expires_at       timestamptz
);
create index if not exists channel_floor_event_idx on public.channel_floor (event_id);

-- ── RLS: no client writes; organizers may read their own event's comms ─────
alter table public.event_channels      enable row level security;
alter table public.event_transmissions enable row level security;
alter table public.channel_floor       enable row level security;

drop policy if exists "organizer reads event channels" on public.event_channels;
create policy "organizer reads event channels" on public.event_channels
  for select using (exists (
    select 1 from public.events e
     where e.id = event_channels.event_id and e.organizer_id = auth.uid()));

drop policy if exists "organizer reads event transmissions" on public.event_transmissions;
create policy "organizer reads event transmissions" on public.event_transmissions
  for select using (exists (
    select 1 from public.events e
     where e.id = event_transmissions.event_id and e.organizer_id = auth.uid()));
-- channel_floor: no policies; only SECURITY DEFINER functions touch it.

-- ── Who is this token? ─────────────────────────────────────────────────────
-- Internal. A beacon device token resolves to the rider on their active event;
-- otherwise a command-link credential resolves to its event (expiry enforced
-- by command_credential_event).
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
  v_role text;
begin
  if p_token is null or length(btrim(p_token)) < 8 then return; end if;

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

-- ── What may this role hear and say? ───────────────────────────────────────
--   rider            hears Race Control, All Riders, own class
--                    talks on own class and Race Control
--   marshal/sweep/medic and 'staff' credentials
--                    hear Race Control, Staff, All Riders
--                    talk on Staff and Race Control
--   control          hears and talks on everything; may all-call
--   listen           hears everything, talks on nothing
create or replace function public.comms_rights(
  p_event_id uuid, p_role text, p_rider_class text
)
returns table (
  channel_id uuid, kind text, name text, rider_class text, sort integer, can_talk boolean
)
language sql
stable
security definer
set search_path = public
as $fn$
  select c.id, c.kind, c.name, c.rider_class, c.sort,
         case
           when p_role = 'control' then true
           when p_role = 'listen'  then false
           when p_role in ('staff','marshal','sweep','medic')
             then c.kind in ('staff','race_control')
           else c.kind = 'race_control'
             or (c.kind = 'class' and c.rider_class = p_rider_class)
         end
    from public.event_channels c
   where c.event_id = p_event_id
     and c.archived_at is null
     and case
           when p_role in ('control','listen') then true
           when p_role in ('staff','marshal','sweep','medic')
             then c.kind in ('race_control','staff','all_riders')
           else c.kind in ('race_control','all_riders')
             or (c.kind = 'class' and c.rider_class = p_rider_class)
         end
   order by c.sort, c.name;
$fn$;
revoke all on function public.comms_rights(uuid, text, text) from public, anon, authenticated;

-- ── Channels follow the roster ─────────────────────────────────────────────
create or replace function public.ensure_event_channels(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare v_total integer := 0; v_n integer;
begin
  insert into public.event_channels (event_id, kind, name, rider_class, sort)
  values (p_event_id, 'race_control', 'Race Control', null, 0),
         (p_event_id, 'staff',        'Staff',        null, 10),
         (p_event_id, 'all_riders',   'All Riders',   null, 20)
  on conflict on constraint event_channels_unique do nothing;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  insert into public.event_channels (event_id, kind, name, rider_class, sort)
  select distinct p_event_id, 'class', btrim(ep.rider_class), btrim(ep.rider_class), 100
    from public.event_participants ep
   where ep.event_id = p_event_id
     and nullif(btrim(ep.rider_class), '') is not null
  on conflict on constraint event_channels_unique do nothing;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  return v_total;
end; $fn$;
revoke all on function public.ensure_event_channels(uuid) from public, anon, authenticated;

-- ── Join: everything a client needs to connect ─────────────────────────────
-- Called by /api/comms/token, which then mints the LiveKit token.
create or replace function public.comms_join(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare a record; e record; v_channels jsonb;
begin
  select * into a from public.comms_actor(p_token);
  if a.event_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  select ev.id, ev.name, ev.status::text as status, ev.comms_enabled
    into e from public.events ev where ev.id = a.event_id;
  if not coalesce(e.comms_enabled, false) then
    return jsonb_build_object('ok', false, 'error', 'comms_disabled');
  end if;
  if e.status in ('completed', 'cancelled') then
    return jsonb_build_object('ok', false, 'error', 'event_closed');
  end if;

  perform public.ensure_event_channels(a.event_id);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.channel_id, 'kind', r.kind, 'name', r.name,
           'rider_class', r.rider_class, 'can_talk', r.can_talk)
           order by r.sort, r.name), '[]'::jsonb)
    into v_channels
    from public.comms_rights(a.event_id, a.role, a.rider_class) r;

  return jsonb_build_object(
    'ok', true,
    'event_id', a.event_id,
    'event_name', e.name,
    'room', 'event:' || a.event_id::text,
    'identity', a.identity,
    'label', a.label,
    'number', a.rider_number,
    'role', a.role,
    'channels', v_channels);
end; $fn$;
revoke all on function public.comms_join(text) from public;
grant execute on function public.comms_join(text) to anon, authenticated;

-- ── Take the floor ─────────────────────────────────────────────────────────
-- One speaker per channel. A hold lasts 30 s (60 s for an all-call) and is
-- released early by release_floor or by the LiveKit webhook on disconnect.
-- An all-call is race control talking on Race Control with priority: it
-- pre-empts every speaker in the event, and blocks new grants until it ends.
-- Returns 'mute' = the speakers the API route must silence in LiveKit.
create or replace function public.request_floor(
  p_token      text,
  p_channel_id uuid,
  p_priority   boolean default false,
  p_lat        double precision default null,
  p_lng        double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  a       record;
  e       record;
  ch      public.event_channels;
  f       public.channel_floor;
  v_can   boolean;
  v_tx    uuid;
  v_hold  interval;
  v_until timestamptz;
  v_label text;
  v_lat   double precision := p_lat;
  v_lng   double precision := p_lng;
  v_mute  jsonb := '[]'::jsonb;
begin
  select * into a from public.comms_actor(p_token);
  if a.event_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  select ev.status::text as status, ev.comms_enabled into e
    from public.events ev where ev.id = a.event_id;
  if not coalesce(e.comms_enabled, false) then
    return jsonb_build_object('ok', false, 'error', 'comms_disabled');
  end if;
  if e.status in ('completed', 'cancelled') then
    return jsonb_build_object('ok', false, 'error', 'event_closed');
  end if;

  select * into ch from public.event_channels c
   where c.id = p_channel_id and c.event_id = a.event_id and c.archived_at is null;
  if ch.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_channel');
  end if;

  select r.can_talk into v_can
    from public.comms_rights(a.event_id, a.role, a.rider_class) r
   where r.channel_id = p_channel_id;
  if not coalesce(v_can, false) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_priority and a.role <> 'control' then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_priority and ch.kind <> 'race_control' then
    return jsonb_build_object('ok', false, 'error', 'all_call_is_race_control_only');
  end if;

  -- Serialize floor changes per event so an all-call and a normal grant can
  -- never interleave.
  perform pg_advisory_xact_lock(hashtextextended(a.event_id::text, 47));

  -- Expired holds end at their expiry, not now.
  update public.event_transmissions t
     set ended_at = fl.expires_at
    from public.channel_floor fl
   where fl.event_id = a.event_id
     and fl.transmission_id = t.id
     and fl.expires_at <= now()
     and t.ended_at is null;
  update public.channel_floor
     set transmission_id = null, identity = null, holder_label = null,
         priority = false, expires_at = null
   where event_id = a.event_id and expires_at <= now();

  -- An all-call in progress blocks everyone else.
  if not p_priority then
    select * into f from public.channel_floor fl
     where fl.event_id = a.event_id and fl.priority
       and fl.transmission_id is not null
       and fl.identity is distinct from a.identity
     limit 1;
    if f.channel_id is not null then
      return jsonb_build_object('ok', true, 'granted', false,
        'reason', 'all_call', 'holder', f.holder_label);
    end if;
  end if;

  select * into f from public.channel_floor fl where fl.channel_id = p_channel_id;
  if f.transmission_id is not null then
    if f.identity = a.identity then
      return jsonb_build_object('ok', true, 'granted', true,
        'transmission_id', f.transmission_id, 'expires_at', f.expires_at,
        'room', 'event:' || a.event_id::text, 'mute', '[]'::jsonb);
    end if;
    if not p_priority then
      return jsonb_build_object('ok', true, 'granted', false,
        'reason', 'busy', 'holder', f.holder_label);
    end if;
  end if;

  if p_priority then
    with ended as (
      update public.event_transmissions t
         set ended_at = now()
        from public.channel_floor fl
       where fl.event_id = a.event_id
         and fl.transmission_id = t.id
         and t.ended_at is null
         and fl.identity is distinct from a.identity
      returning t.identity as who, t.channel_id as chan
    )
    select coalesce(jsonb_agg(jsonb_build_object('identity', who, 'channel_id', chan)), '[]'::jsonb)
      into v_mute from ended;

    update public.channel_floor
       set transmission_id = null, identity = null, holder_label = null,
           priority = false, expires_at = null
     where event_id = a.event_id
       and identity is distinct from a.identity;
  end if;

  if (v_lat is null or v_lng is null) and a.participant_id is not null then
    select ep.last_lat, ep.last_lng into v_lat, v_lng
      from public.event_participants ep where ep.id = a.participant_id;
  end if;

  v_hold  := case when p_priority then interval '60 seconds' else interval '30 seconds' end;
  v_until := now() + v_hold;
  v_label := case when a.rider_number is not null and btrim(a.rider_number) <> ''
                  then '#' || btrim(a.rider_number) || ' ' || a.label
                  else a.label end;

  insert into public.event_transmissions
    (event_id, channel_id, participant_id, created_by_credential, identity,
     speaker_label, speaker_number, priority, lat, lng)
  values
    (a.event_id, p_channel_id, a.participant_id, a.credential_id, a.identity,
     a.label, a.rider_number, p_priority, v_lat, v_lng)
  returning id into v_tx;

  insert into public.channel_floor
    (channel_id, event_id, transmission_id, identity, holder_label, priority, expires_at)
  values
    (p_channel_id, a.event_id, v_tx, a.identity, v_label, p_priority, v_until)
  on conflict (channel_id) do update
    set transmission_id = excluded.transmission_id,
        identity        = excluded.identity,
        holder_label    = excluded.holder_label,
        priority        = excluded.priority,
        expires_at      = excluded.expires_at;

  return jsonb_build_object('ok', true, 'granted', true,
    'transmission_id', v_tx, 'expires_at', v_until,
    'room', 'event:' || a.event_id::text, 'mute', v_mute);
end; $fn$;
revoke all on function public.request_floor(text, uuid, boolean, double precision, double precision) from public;
grant execute on function public.request_floor(text, uuid, boolean, double precision, double precision) to anon, authenticated;

-- ── Let go ─────────────────────────────────────────────────────────────────
create or replace function public.release_floor(p_token text, p_transmission_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare a record;
begin
  select * into a from public.comms_actor(p_token);
  if a.event_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  update public.event_transmissions
     set ended_at = now()
   where id = p_transmission_id and identity = a.identity and ended_at is null;

  update public.channel_floor
     set transmission_id = null, identity = null, holder_label = null,
         priority = false, expires_at = null
   where transmission_id = p_transmission_id and identity = a.identity;

  return jsonb_build_object('ok', true);
end; $fn$;
revoke all on function public.release_floor(text, uuid) from public;
grant execute on function public.release_floor(text, uuid) to anon, authenticated;

-- ── Webhook helpers (service role only) ────────────────────────────────────
-- LiveKit says a participant left: end whatever they were holding.
create or replace function public.comms_release_identity(p_event_id uuid, p_identity text)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare v_n integer;
begin
  update public.event_transmissions
     set ended_at = now()
   where event_id = p_event_id and identity = p_identity and ended_at is null;
  get diagnostics v_n = row_count;

  update public.channel_floor
     set transmission_id = null, identity = null, holder_label = null,
         priority = false, expires_at = null
   where event_id = p_event_id and identity = p_identity;

  return v_n;
end; $fn$;
revoke all on function public.comms_release_identity(uuid, text) from public, anon, authenticated;
grant execute on function public.comms_release_identity(uuid, text) to service_role;

-- LiveKit says a track was published: may this identity talk on that channel?
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

-- ── Reconnect banner: race control's latest standing all-call ──────────────
create or replace function public.current_instruction(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $fn$
declare a record; t record;
begin
  select * into a from public.comms_actor(p_token);
  if a.event_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  select tx.id, tx.speaker_label, tx.started_at, tx.ended_at, tx.recording_path
    into t
    from public.event_transmissions tx
   where tx.event_id = a.event_id and tx.priority and tx.cleared_at is null
   order by tx.started_at desc
   limit 1;

  if t.id is null then
    return jsonb_build_object('ok', true, 'instruction', null);
  end if;

  return jsonb_build_object('ok', true, 'instruction', jsonb_build_object(
    'transmission_id', t.id,
    'speaker', t.speaker_label,
    'started_at', t.started_at,
    'age_s', greatest(0, extract(epoch from (now() - t.started_at)))::integer,
    'has_recording', t.recording_path is not null));
end; $fn$;
revoke all on function public.current_instruction(text) from public;
grant execute on function public.current_instruction(text) to anon, authenticated;

-- Race control withdraws an all-call so it leaves every reconnect banner.
create or replace function public.clear_instruction(p_token text, p_transmission_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare a record; v_n integer;
begin
  select * into a from public.comms_actor(p_token);
  if a.event_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;
  if a.role <> 'control' then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;

  update public.event_transmissions
     set cleared_at = now()
   where id = p_transmission_id and event_id = a.event_id
     and priority and cleared_at is null;
  get diagnostics v_n = row_count;

  return jsonb_build_object('ok', true, 'cleared', v_n > 0);
end; $fn$;
revoke all on function public.clear_instruction(text, uuid) from public;
grant execute on function public.clear_instruction(text, uuid) to anon, authenticated;

-- ── Switch comms on for an event (super admin only, for now) ───────────────
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
  end if;

  return jsonb_build_object('ok', true, 'enabled', coalesce(p_enabled, false),
                            'channels_created', v_channels);
end; $fn$;
revoke all on function public.set_event_comms(uuid, boolean) from public, anon;
grant execute on function public.set_event_comms(uuid, boolean) to authenticated;

-- ── Closing an event closes its comms ──────────────────────────────────────
create or replace function public.comms_on_event_closed()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.status::text in ('completed', 'cancelled')
     and old.status is distinct from new.status then
    update public.event_transmissions
       set ended_at = now()
     where event_id = new.id and ended_at is null;
    update public.channel_floor
       set transmission_id = null, identity = null, holder_label = null,
           priority = false, expires_at = null
     where event_id = new.id;
    update public.event_channels
       set archived_at = now()
     where event_id = new.id and archived_at is null;
  end if;
  return new;
end; $fn$;

drop trigger if exists comms_event_closed on public.events;
create trigger comms_event_closed
  after update of status on public.events
  for each row execute function public.comms_on_event_closed();
