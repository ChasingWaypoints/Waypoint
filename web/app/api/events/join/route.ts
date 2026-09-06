import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../lib/supabase/auth";
import type Stripe from "stripe";
import { getStripe } from "../../../../lib/stripe";
import { createAdminClient } from "../../../../lib/supabase/admin";

// GET /api/events/join?code=RIDE42
// Look up an event by join code without joining — returns name and rider_classes
// so the client can show the class picker before committing to join.
export async function GET(request: NextRequest) {
  const { user } = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const code = request.nextUrl.searchParams.get("code")?.trim().toUpperCase();
  if (!code) return NextResponse.json({ error: "code is required" }, { status: 400 });

  // Join-by-code must resolve for ANY authenticated user, not only the
  // organizer. Direct SELECT is behind organizer-only RLS, so use the
  // service-role client here (identity is already verified from the token).
  const db = createAdminClient();
  const { data: event } = await db
    .from("events")
    .select("id, name, status, rider_classes")
    .eq("join_code", code)
    .maybeSingle();

  if (!event) return NextResponse.json({ error: "Event not found. Check the code and try again." }, { status: 404 });
  if (event.status === "cancelled") return NextResponse.json({ error: "This event has been cancelled." }, { status: 410 });

  return NextResponse.json({
    id: event.id,
    name: event.name,
    status: event.status,
    rider_classes: event.rider_classes ?? [],
  });
}

// POST /api/events/join — look up event by join code and join in one step.
// Handles suspension, entrant-paid checkout, org pool, and the free/seat cap.
// Body: { code, display_name?, rider_class?, rider_number? }
async function entrantCheckoutUrl(
  event: { id: string; name: string; entrant_fee_cents: number | null },
  participantId: string,
  origin: string
): Promise<string | null> {
  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: event.entrant_fee_cents ?? 0,
        product_data: { name: `Waypoint Entry — ${event.name}` },
      },
    }],
    metadata: { kind: "entrant_paid", event_id: event.id, participant_id: participantId },
    managed_payments: { enabled: false },
    success_url: `${origin}/dashboard/events/${event.id}?entry=1`,
    cancel_url: `${origin}/dashboard`,
  } as Stripe.Checkout.SessionCreateParams);
  return session.url;
}

export async function POST(request: NextRequest) {
  const { user } = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const code = body.code?.trim().toUpperCase();
  if (!code) return NextResponse.json({ error: "Join code is required" }, { status: 400 });

  // Service-role client for the join operations (lookup + self-insert +
  // capacity) so a non-organizer rider can join; identity is verified above.
  const db = createAdminClient();
  const { data: event } = await db
    .from("events")
    .select("id, name, status, organizer_id, paid, comped, seats_paid, payment_mode, entrant_fee_cents, suspended_at")
    .eq("join_code", code)
    .maybeSingle();

  if (!event) return NextResponse.json({ error: "Event not found. Check the code and try again." }, { status: 404 });
  if (event.suspended_at) return NextResponse.json({ error: "This event is currently unavailable.", code: "suspended" }, { status: 403 });
  if (event.status === "cancelled") return NextResponse.json({ error: "This event has been cancelled." }, { status: 410 });

  const origin = request.headers.get("origin") ?? new URL(request.url).origin;
  const isEntrantPaid = event.payment_mode === "entrant";

  // Already a participant?
  const { data: existing } = await db
    .from("event_participants")
    .select("id, event_id, paid_at")
    .eq("event_id", event.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    if (isEntrantPaid && !existing.paid_at) {
      const url = await entrantCheckoutUrl(event, existing.id, origin);
      return NextResponse.json({ requires_payment: true, url });
    }
    return NextResponse.json({ event_id: event.id, already_joined: true });
  }

  const displayName =
    body.display_name?.trim() ||
    user.user_metadata?.full_name ||
    user.email?.split("@")[0] ||
    "Rider";
  const riderClass = body.rider_class?.trim() || null;
  const riderNumber = body.rider_number?.trim() || null;

  // Self-registration ICE capture — stored ONLY with explicit consent.
  const ice = body.ice_consent === true ? {
    ice_name: body.ice_name?.toString().trim() || null,
    ice_phone: body.ice_phone?.toString().trim() || null,
    blood_type: body.blood_type?.toString().trim() || null,
    allergies: body.allergies?.toString().trim() || null,
    ice_consent_at: new Date().toISOString(),
  } : {};

  // Entrant-paid: create a PENDING row, then send them to Checkout. The webhook
  // stamps paid_at; until then the row is excluded from all live feeds.
  if (isEntrantPaid) {
    const { data: inserted, error } = await db
      .from("event_participants")
      .insert({ event_id: event.id, user_id: user.id, display_name: displayName, role: "rider", rider_class: riderClass, rider_number: riderNumber, ...ice })
      .select("id")
      .single();
    if (error || !inserted) return NextResponse.json({ error: error?.message ?? "Could not join." }, { status: 500 });
    const url = await entrantCheckoutUrl(event, inserted.id, origin);
    return NextResponse.json({ requires_payment: true, url });
  }

  // Organizer-paid / free / org-covered. Capacity check before adding:
  //   comped        → uncapped
  //   org sub       → draw from the org's yearly pool (consume returns true)
  //   paid event    → capped at seats_paid (base 40 + $40/10-seat blocks)
  //   free ride     → capped at 10
  if (!event.comped) {
    const { data: consumed } = await db.rpc("consume_org_entrant", { p_event_id: event.id });
    if (consumed !== true) {
      const limit = event.paid ? (event.seats_paid ?? 40) : 10;
      const { count } = await db
        .from("event_participants")
        .select("id", { count: "exact", head: true })
        .eq("event_id", event.id);
      if ((count ?? 0) >= limit) {
        const msg = event.paid
          ? `This event is full (${limit} seats). Ask the organizer to add more seats.`
          : "This ride has reached its 10-rider limit. Ask the organizer to upgrade it to a paid event.";
        return NextResponse.json({ error: msg, code: "cap_reached" }, { status: 402 });
      }
    }
  }

  const { error } = await db.from("event_participants").insert({
    event_id: event.id,
    user_id: user.id,
    display_name: displayName,
    role: "rider",
    rider_class: riderClass,
    rider_number: riderNumber,
    ...ice,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ event_id: event.id, already_joined: false }, { status: 201 });
}
