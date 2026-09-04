import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../lib/supabase/auth";
import { getStripe } from "../../../../lib/stripe";

export const runtime = "nodejs";

// POST /api/billing/subscribe { plan: "annual" | "quarterly" }
// Personal subscription: $24/yr or $15 per 3 months. Returns a Checkout URL.
export async function POST(request: NextRequest) {
  const { user } = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { plan } = await request.json().catch(() => ({}));
  const isAnnual = plan !== "quarterly";
  const recurring: { interval: "year" | "month"; interval_count: number } = isAnnual
    ? { interval: "year", interval_count: 1 }
    : { interval: "month", interval_count: 3 };
  const amount = isAnnual ? 2400 : 1500;

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
          product_data: { name: `Waypoint Personal — ${isAnnual ? "Annual" : "3-month"}` },
        },
      }],
      metadata: { user_id: user.id, plan: isAnnual ? "annual" : "quarterly", kind: "subscription" },
      success_url: `${origin}/dashboard?subscribed=1`,
      cancel_url: `${origin}/dashboard`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
