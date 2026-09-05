import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getUserFromRequest } from "../../../../lib/supabase/auth";
import { getStripe, seatBlockPriceCents, SEATS_PER_BLOCK } from "../../../../lib/stripe";

export const runtime = "nodejs";

// POST /api/billing/event-seats { eventId, blocks? } — organizer adds seat
// capacity to an already-paid event in blocks of 20 seats ($40 each). Returns
// a Stripe Checkout URL; the webhook increments events.seats_paid on success.
export async function POST(request: NextRequest) {
  const { user, supabase } = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId, blocks } = await request.json().catch(() => ({}));
  if (!eventId) return NextResponse.json({ error: "eventId required" }, { status: 400 });
  const nBlocks = Math.max(1, Math.min(20, Math.floor(Number(blocks) || 1)));

  const { data: event } = await supabase
    .from("events")
    .select("id, name, organizer_id, paid, comped")
    .eq("id", eventId)
    .single();
  if (!event || event.organizer_id !== user.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (event.comped)
    return NextResponse.json({ error: "This event is sponsored — no seat limit applies." }, { status: 409 });
  if (!event.paid)
    return NextResponse.json({ error: "Upgrade the event to a paid event before adding seats." }, { status: 409 });

  const addedSeats = nBlocks * SEATS_PER_BLOCK;
  const amount = seatBlockPriceCents(nBlocks);
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
            name: `Waypoint Seats — ${event.name}`,
            description: `${addedSeats} additional rider seats.`,
          },
        },
      }],
      metadata: { event_id: eventId, kind: "seats", seats: String(addedSeats) },
      managed_payments: { enabled: false },
      success_url: `${origin}/dashboard/events/${eventId}?seats=1`,
      cancel_url: `${origin}/dashboard/events/${eventId}`,
    } as Stripe.Checkout.SessionCreateParams);
    return NextResponse.json({ url: session.url });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
