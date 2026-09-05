-- 019_entrant_org_suspend.sql
-- WP1b: entrant-paid mode, org subscriptions + shared entrant pool, super-admin
-- event suspension, and the entitlement / live-feed updates those require.
-- Touches events / event_participants / subscriptions only — no dependency on
-- the Drive-era migrations. Safe to re-run.

-- ── Event: payment mode + entrant fee ──────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_type where typname = 'event_payment_mode') then
    create type public.event_payment_mode as enum ('organizer','entrant');
  end if;
end $$;

alter table public.events
  add column if not exists payment_mode public.event_payment_mode not null default 'organizer',
  add column if not exists entrant_fee_cents integer;

alter table public.events drop constraint if exists events_entrant_fee_range;
alter table public.events add constraint events_entrant_fee_range
  check (
    payment_mode <> 'entrant'
    or (entrant_fee_cents is not null and entrant_fee_cents between 800 and 1500)
  );

-- ── Event: super-admin suspension (T&C enforcement) ────────────────────────
alter table public.events
  add column if not exists suspended_at   timestamptz,
  add column if not exists suspended_by   uuid references auth.users(id),
  add column if not exists suspend_reason text;

-- ── Participant: entrant payment stamp ─────────────────────────────────────
alter table public.event_participants
  add column if not exists paid_at timestamptz;

-- ── Org subscriptions + shared yearly entrant pool ─────────────────────────
create table if not exists public.org_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'inactive',      -- active | inactive | past_due | canceled
  current_period_end timestamptz,
  entrant_pool  integer not null default 1500,
  entrants_used integer not null default 0,      -- reset to 0 on renewal (webhook)
  stripe_customer_id text,
  stripe_subscription_id text,
  updated_at timestamptz not null default now()
);
alter table public.org_subscriptions enable row level security;
drop policy if exists "own org subscription read" on public.org_subscriptions;
create policy "own org subscription read" on public.org_subscriptions
  for select using (user_id = auth.uid());
-- writes only via webhook / SECURITY DEFINER (no client write policy)

-- Active org subscription?
create or replace function public.user_has_org(p_user_id uuid)
returns boolean language sql security definer set search_path = public as $$
  select coalesce((
    select status = 'active' and (current_period_end is null or current_period_end > now())
    from org_subscriptions where user_id = p_user_id
  ), false);
$$;
grant execute on function public.user_has_org(uuid) to authenticated;

-- Draw one entrant from the org's pool for an org-owned event. Returns true if
-- consumed, false if no active org sub or the pool is exhausted. Call exactly
-- once per newly-joined participant (caller ensures idempotency).
create or replace function public.consume_org_entrant(p_event_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_ok boolean;
begin
  select organizer_id into v_org from events where id = p_event_id;
  if v_org is null then return false; end if;
  update org_subscriptions
     set entrants_used = entrants_used + 1, updated_at = now()
   where user_id = v_org
     and status = 'active'
     and (current_period_end is null or current_period_end > now())
     and entrants_used < entrant_pool
  returning true into v_ok;
  return coalesce(v_ok, false);
end; $$;
grant execute on function public.consume_org_entrant(uuid) to authenticated;

-- ── Entitlement now also honors an active org subscription ──────────────────
create or replace function public.event_is_entitled(p_event_id uuid)
returns boolean language sql security definer set search_path = public as $$
  select
    coalesce((select paid   from events where id = p_event_id), false)
    or coalesce((select comped from events where id = p_event_id), false)
    or coalesce((select user_has_org(organizer_id) from events where id = p_event_id), false)
    or (select count(*) from event_participants where event_id = p_event_id) <= 10;
$$;
grant execute on function public.event_is_entitled(uuid) to anon, authenticated;

-- ── Super-admin: suspend / unsuspend an event ──────────────────────────────
create or replace function public.admin_set_event_suspended(
  p_event_id uuid, p_suspended boolean, p_reason text default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not coalesce((select is_super_admin from profiles where id = auth.uid()), false) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  update events set
    suspended_at   = case when p_suspended then now()      else null end,
    suspended_by   = case when p_suspended then auth.uid() else null end,
    suspend_reason = case when p_suspended then p_reason   else null end
  where id = p_event_id;
end; $$;
grant execute on function public.admin_set_event_suspended(uuid, boolean, text) to authenticated;

-- ── Live feed: suspended events go dark; unpaid entrant-mode rows hidden ────
create or replace function public.get_event_live_positions(p_share_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_event record; v_result jsonb; v_stages jsonb;
begin
  select id, name, status, route_name, starts_at, logo_url, sponsors,
         payment_mode, suspended_at
    into v_event from events where share_token = p_share_token limit 1;
  if v_event.id is null then return null; end if;
  if v_event.suspended_at is not null then return null; end if;  -- suspended = dark

  select coalesce(jsonb_agg(
    jsonb_build_object('id', st.id, 'name', st.name, 'color', st.color,
                       'route_line', st.route_line, 'waypoints', st.waypoints)
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

-- ── Republish admin_list_events to surface suspend + entrant/org state ──────
create or replace function public.admin_list_events()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_result jsonb;
begin
  if not coalesce((select is_super_admin from profiles where id = auth.uid()), false) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.created_at desc), '[]'::jsonb)
    into v_result
  from (
    select e.id, e.name, e.status, e.join_code, e.share_token, e.created_at, e.organizer_id,
      e.paid, e.comped, e.payment_mode, e.entrant_fee_cents,
      (e.suspended_at is not null) as suspended, e.suspend_reason,
      u.email as organizer_email,
      (select count(*) from event_participants ep where ep.event_id = e.id) as participant_count,
      (select count(*) from event_participants ep
         where ep.event_id = e.id and ep.last_lat is not null) as reporting_count
    from events e left join auth.users u on u.id = e.organizer_id
  ) t;
  return v_result;
end; $$;
grant execute on function public.admin_list_events() to authenticated;
