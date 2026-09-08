-- 034_plan_entitlements.sql
-- Turn the pricing tiers into real entitlements. Until now every personal
-- feature was open to any signed-in user, so the $15 / $29 subscriptions
-- unlocked nothing. This adds plan-aware helpers and gates the paid features:
--
--   Free            → live share, group of 10, ICE, trip stories, last 30 days
--                     of ride history
--   Individual $15  → unlimited ride history + privacy zones
--   Individual Plus → everything in Individual + weather/radar + radar
--     $29             timelapse + an unbranded (custom) share page
--
-- An active Org plan includes the personal perks for the organizer's own
-- account, so the helpers below treat Org as >= Plus.

-- ── Which personal plan does this user hold? ───────────────────────────────
-- 'plus' | 'individual' | 'none'. Looks only at the personal subscription;
-- Org is folded in by the boolean helpers below, not here.
create or replace function public.user_plan(p_user_id uuid)
returns text language sql security definer set search_path = public as $$
  select case
    when exists (
      select 1 from user_subscriptions s
      where s.user_id = p_user_id
        and s.status = 'active'
        and (s.current_period_end is null or s.current_period_end > now())
        and s.plan = 'individual_plus'
    ) then 'plus'
    when exists (
      select 1 from user_subscriptions s
      where s.user_id = p_user_id
        and s.status = 'active'
        and (s.current_period_end is null or s.current_period_end > now())
    ) then 'individual'
    else 'none'
  end;
$$;
grant execute on function public.user_plan(uuid) to anon, authenticated;

-- Any paid personal plan (Individual or Plus), OR an active Org plan.
-- Gates: unlimited ride history, privacy zones.
create or replace function public.user_has_paid_plan(p_user_id uuid)
returns boolean language sql security definer set search_path = public as $$
  select public.user_has_subscription(p_user_id)
      or coalesce(public.user_has_org(p_user_id), false);
$$;
grant execute on function public.user_has_paid_plan(uuid) to anon, authenticated;

-- Plus-level entitlement: an active Individual Plus sub, OR an active Org plan.
-- Gates: weather/radar overlay, radar timelapse, unbranded share page.
create or replace function public.user_has_plus(p_user_id uuid)
returns boolean language sql security definer set search_path = public as $$
  select public.user_plan(p_user_id) = 'plus'
      or coalesce(public.user_has_org(p_user_id), false);
$$;
grant execute on function public.user_has_plus(uuid) to anon, authenticated;

-- ── Public share-page branding ─────────────────────────────────────────────
-- The share link is served by an anon client, so it can't read the owner's
-- subscription (RLS) directly. This SECURITY DEFINER helper returns just what
-- the public page needs: whether the owner gets the unbranded page, and the
-- name to show in place of the Waypoint wordmark.
create or replace function public.share_branding(p_user_id uuid)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'plus', public.user_has_plus(p_user_id),
    'name', (select display_name from profiles where id = p_user_id)
  );
$$;
grant execute on function public.share_branding(uuid) to anon, authenticated;

-- ── Privacy zones become a paid feature ────────────────────────────────────
-- Existing zones keep working (read / update / delete stay open to the owner),
-- but creating a NEW zone now requires a paid plan. Replaces the single
-- for-all policy from the base schema.
drop policy if exists "Users manage own privacy zones" on public.privacy_zones;

create policy "own zones read" on public.privacy_zones
  for select using (auth.uid() = user_id);
create policy "own zones update" on public.privacy_zones
  for update using (auth.uid() = user_id);
create policy "own zones delete" on public.privacy_zones
  for delete using (auth.uid() = user_id);
create policy "paid zones insert" on public.privacy_zones
  for insert with check (
    auth.uid() = user_id and public.user_has_paid_plan(auth.uid())
  );
