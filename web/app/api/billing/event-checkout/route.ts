import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../lib/supabase/auth";
import { getStripe, eventPriceCents } from "../../../../lib/stripe";
import type Stripe from "stripe";

export const runtime = "nodejs";

// POST /api/billing/event-checkout { eventId } — organizer upgrades a ride to a
// paid event. Returns a Stripe Checkout URL. $200 base (+$2/entrant over 60).
export async function POST(request: NextRequest) {
  const { user, supabase } = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId } = await request.json().catch(() => ({}));
  if (!eventId) return NextResponse.json({ error: "eventId required" }, { status: 400 });

  const { data: event } = await supabase
    .from("events")
    .select("id, name, organizer_id, paid, comped")
    .eq("id", eventId)
    .single();
  if (!event || event.organizer_id !== user.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (event.paid || event.comped)
    return NextResponse.json({ error: "This event is already paid." }, { status: 409 });

  const { count } = await supabase
    .from("event_participants")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId);
  const amount = eventPriceCents(count ?? 0);

  const origin = request.headers.get("origin") ?? new URL(request.url).origin;
  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: amount,
          product_data: {
            name: `Waypoint Event — ${event.name}`,
            description: `Live tracking event (up to 60 entrants; $2 each beyond).`,
          },
        },
      }],
      metadata: { event_id: eventId, kind: "event" },
      // Managed Payments is enabled by default on this Stripe account and would
      // require a per-item tax_code; we charge a flat fee, so opt the session out.
      managed_payments: { enabled: false },
      success_url: `${origin}/dashboard/events/${eventId}?paid=1`,
      cancel_url: `${origin}/dashboard/events/${eventId}`,
    } as Stripe.Checkout.SessionCreateParams);
    return NextResponse.json({ url: session.url });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
