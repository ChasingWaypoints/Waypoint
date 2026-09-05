import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../lib/supabase/auth";
import { getStripe } from "../../../../lib/stripe";
import type Stripe from "stripe";

export const runtime = "nodejs";

// POST /api/billing/subscribe { plan: "individual" | "individual_plus" }
// Personal subscription: Individual $15/yr or Individual Plus $29/yr. Returns a
// Checkout URL.
export async function POST(request: NextRequest) {
  const { user } = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { plan } = await request.json().catch(() => ({}));
  const isPlus = plan === "individual_plus";
  const recurring: { interval: "year" | "month"; interval_count: number } = {
    interval: "year", interval_count: 1,
  };
  const amount = isPlus ? 2900 : 1500;

  const origin = request.headers.get("origin") ?? new URL(request.url).origin;
  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      customer_email: user.email ?? undefined,
      client_reference_id: user.id,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: amount,
          recurring,
          product_data: { name: isPlus ? "Waypoint Individual Plus" : "Waypoint Individual" },
        },
      }],
      metadata: { user_id: user.id, plan: isPlus ? "individual_plus" : "individual", kind: "subscription" },
      managed_payments: { enabled: false },
      success_url: `${origin}/dashboard?subscribed=1`,
      cancel_url: `${origin}/dashboard`,
    } as Stripe.Checkout.SessionCreateParams);
    return NextResponse.json({ url: session.url });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
