import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getUserFromRequest } from "../../../../lib/supabase/auth";
import { getStripe } from "../../../../lib/stripe";

export const runtime = "nodejs";

// POST /api/billing/org-checkout — Organization subscription, $3,500/yr.
// Unlimited events, a shared 1,500-entrant/yr pool, white-label branding.
export async function POST(request: NextRequest) {
  const { user } = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
          unit_amount: 350000,
          recurring: { interval: "year", interval_count: 1 },
          product_data: {
            name: "Waypoint Organization",
            description: "Unlimited events, 1,500 entrants/yr, white-label branding, command credentials.",
          },
        },
      }],
      metadata: { user_id: user.id, kind: "org" },
      managed_payments: { enabled: false },
      success_url: `${origin}/dashboard?org=1`,
      cancel_url: `${origin}/dashboard`,
    } as Stripe.Checkout.SessionCreateParams);
    return NextResponse.json({ url: session.url });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
