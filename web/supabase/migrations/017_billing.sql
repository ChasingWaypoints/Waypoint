-- 017_billing.sql
-- Billing foundation: event payment/comp state, individual subscriptions,
-- and entitlement checks. Stripe wiring (checkout + webhooks) comes next; this
-- migration is the data model + the super-admin comp override.

-- ── Event billing state ────────────────────────────────────────────────────
alter table public.events add column if not exists paid boolean not null default false;
alter table public.events add column if not exists paid_at timestamptz;
alter table public.events add column if not exists comped boolean not null default false;
alter table public.events add column if not exists comped_by uuid references auth.users(id);
alter table public.events add column if not exists comped_reason text;

-- ── Individual user subscription (personal tracking + share map) ───────────
create table if not exists public.user_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'inactive',      -- active | inactive | past_due | canceled
  plan text,                                     -- annual | quarterly
  current_period_end timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  updated_at timestamptz not null default now()
);
alter table public.user_subscriptions enable row level security;
drop policy if exists "own subscription read" on public.user_subscriptions;
create policy "own subscription read" on public.user_subscriptions
  for select using (user_id = auth.uid());
-- writes only via SECURITY DEFINER / webhooks (no client write policy)

-- ── Event payment audit trail ──────────────────────────────────────────────
create table if not exists public.event_payments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  amount_cents integer not null,
  entrant_count integer,
  status text not null default 'pending',        -- pending | paid | refunded
  stripe_session_id text,
  created_at timestamptz not null default now()
);
alter table public.event_payments enable row level security;
drop policy if exists "organizer reads event payments" on public.event_payments;
create policy "organizer reads event payments" on public.event_payments
  for select using (exists (
    select 1 from events e where e.id = event_id and e.organizer_id = auth.uid()
  ));

-- ── Entitlement: is this event allowed beyond the free ride cap? ───────────
-- Free rides (≤10 riders) are always entitled; larger events need paid or comped.
create or replace function public.event_is_entitled(p_event_id uuid)
returns boolean language sql security definer set search_path = public as $$
  select
    coalesce((select paid from events where id = p_event_id), false)
    or coalesce((select comped from events where id = p_event_id), false)
    or (select count(*) from event_participants where event_id = p_event_id) <= 10;
$$;
grant execute on function public.event_is_entitled(uuid) to anon, authenticated;

-- Does a user hold an active personal subscription?
create or replace function public.user_has_subscription(p_user_id uuid)
returns boolean language sql security definer set search_path = public as $$
  select coalesce((
    select status = 'active' and (current_period_end is null or current_period_end > now())
    from user_subscriptions where user_id = p_user_id
  ), false);
$$;
grant execute on function public.user_has_subscription(uuid) to authenticated;

-- ── Super-admin comp override (sponsor an event = waive the fee) ───────────
create or replace function public.admin_set_event_comped(
  p_event_id uuid, p_comped boolean, p_reason text default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not coalesce((select is_super_admin from profiles where id = auth.uid()), false) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  update events set
    comped = p_comped,
    comped_by = case when p_comped then auth.uid() else null end,
    comped_reason = case when p_comped then p_reason else null end
  where id = p_event_id;
end; $$;
grant execute on function public.admin_set_event_comped(uuid, boolean, text) to authenticated;

-- ── Republish admin_list_events to carry billing state ────────────────────
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
      e.paid, e.comped,
      u.email as organizer_email,
      (select count(*) from event_participants ep where ep.event_id = e.id) as participant_count,
      (select count(*) from event_participants ep where ep.event_id = e.id and ep.last_lat is not null) as reporting_count
    from events e left join auth.users u on u.id = e.organizer_id
  ) t;

  return v_result;
end; $$;
grant execute on function public.admin_list_events() to authenticated;
