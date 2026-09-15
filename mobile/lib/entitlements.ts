/**
 * entitlements.ts
 *
 * The phone's view of the plan ladder the web already enforces (migration 034).
 *
 * The app had no concept of plans at all, which cut both ways: free riders got
 * unlimited history on mobile that the web caps at 30 days, and privacy zones —
 * gated to paid by an RLS insert policy — failed with a raw Postgres error
 * instead of an upsell. Both are this file's job to fix.
 *
 * Source of truth stays server-side. These RPCs are SECURITY DEFINER and read
 * user_subscriptions directly, so a client that lies about its plan gains
 * nothing: the RLS policy still refuses the write.
 */

import { supabase } from "./supabase";

export type Plan = "none" | "individual" | "plus";

/** Days of ride history a free account can see. Mirrors web/api/trips. */
export const FREE_HISTORY_DAYS = 30;

export type Entitlements = {
  plan: Plan;
  /** Individual, Plus, or an active Org plan. Unlocks history + privacy zones. */
  paid: boolean;
  /** Plus or Org. Unlocks weather/radar and the unbranded share page. */
  plus: boolean;
};

export const FREE: Entitlements = { plan: "none", paid: false, plus: false };

/**
 * Cached for the session. A plan changes when someone checks out on the web,
 * which is rare and never mid-ride; re-asking on every screen focus would add a
 * round trip to a rider who may have no signal. refreshEntitlements() exists
 * for the case where they just upgraded and came back.
 */
let cache: Entitlements | null = null;
let inflight: Promise<Entitlements> | null = null;

async function load(): Promise<Entitlements> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return FREE;

  const [planRes, paidRes, plusRes] = await Promise.all([
    supabase.rpc("user_plan", { p_user_id: user.id }),
    supabase.rpc("user_has_paid_plan", { p_user_id: user.id }),
    supabase.rpc("user_has_plus", { p_user_id: user.id }),
  ]);

  // Offline or erroring: assume free. Under-granting shows an upsell the rider
  // can dismiss; over-granting shows them a button that fails at the database.
  if (planRes.error || paidRes.error || plusRes.error) return FREE;

  const plan = (planRes.data as Plan) ?? "none";
  return {
    plan,
    paid: paidRes.data === true,
    plus: plusRes.data === true,
  };
}

export async function getEntitlements(): Promise<Entitlements> {
  if (cache) return cache;
  if (!inflight) {
    inflight = load()
      .then((e) => { cache = e; return e; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export async function refreshEntitlements(): Promise<Entitlements> {
  cache = null;
  return getEntitlements();
}

/** Called on sign-out so the next account doesn't inherit this one's plan. */
export function clearEntitlements() {
  cache = null;
}

export const PRICING_URL = "https://waypointtracking.com/pricing";

/** Plan names as the pricing page words them, so the upsells match the checkout. */
export const PLAN_LABEL: Record<Plan, string> = {
  none: "Free",
  individual: "Individual",
  plus: "Individual Plus",
};
