import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../lib/supabase/auth";
import { getStripe } from "../../../../lib/stripe";

export const runtime = "nodejs";

// POST /api/billing/portal — open the Stripe Billing Portal for the caller so
// they can update, cancel, or download invoices for their subscription. Works
// for either an individual or an org subscription (whichever holds a customer id).
export async function POST(request: NextRequest) {
  const { user, supabase } = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Find a Stripe customer id from either subscription table.
  const [{ data: ind }, { data: org }] = await Promise.all([
    supabase.from("user_subscriptions").select("stripe_customer_id").eq("user_id", user.id).maybeSingle(),
    supabase.from("org_subscriptions").select("stripe_customer_id").eq("user_id", user.id).maybeSingle(),
  ]);
  const customerId = ind?.stripe_customer_id || org?.stripe_customer_id;
  if (!customerId) {
    return NextResponse.json({ error: "No billing account yet. Subscribe first." }, { status: 404 });
  }

  const origin = request.headers.get("origin") ?? new URL(request.url).origin;
  try {
    const portal = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/dashboard`,
    });
    return NextResponse.json({ url: portal.url });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
