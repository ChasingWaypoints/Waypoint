import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "../../../../lib/stripe";
import { createAdminClient } from "../../../../lib/supabase/admin";

export const runtime = "nodejs";

function periodEndISO(sub: Stripe.Subscription): string | null {
  const cpe = (sub as unknown as { current_period_end?: number }).current_period_end;
  return cpe ? new Date(cpe * 1000).toISOString() : null;
}
function normStatus(s: string): string {
  return s === "active" || s === "trialing" ? "active" : s;
}

export async function POST(request: NextRequest) {
  const sig = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) return NextResponse.json({ error: "Missing signature/secret" }, { status: 400 });

  const body = await request.text();
  let evt: Stripe.Event;
  try {
    evt = getStripe().webhooks.constructEvent(body, sig, secret);
  } catch (e) {
    return NextResponse.json({ error: `Signature check failed: ${(e as Error).message}` }, { status: 400 });
  }

  const admin = createAdminClient();
  try {
    if (evt.type === "checkout.session.completed") {
      const s = evt.data.object as Stripe.Checkout.Session;
      const kind = s.metadata?.kind;
      if (kind === "event" && s.metadata?.event_id) {
        const seats = parseInt(s.metadata?.seats ?? "60", 10) || 60;
        await admin.from("events")
          .update({ paid: true, paid_at: new Date().toISOString(), seats_paid: seats })
          .eq("id", s.metadata.event_id);
        await admin.from("event_payments").insert({
          event_id: s.metadata.event_id,
          amount_cents: s.amount_total ?? 0,
          status: "paid",
          stripe_session_id: s.id,
        });
      } else if (kind === "seats" && s.metadata?.event_id) {
        // Add-seats top-up: increment the paid capacity by the purchased seats.
        const added = parseInt(s.metadata?.seats ?? "0", 10) || 0;
        const { data: ev } = await admin
          .from("events").select("seats_paid").eq("id", s.metadata.event_id).single();
        const current = ev?.seats_paid ?? 60;
        await admin.from("events")
          .update({ seats_paid: current + added })
          .eq("id", s.metadata.event_id);
        await admin.from("event_payments").insert({
          event_id: s.metadata.event_id,
          amount_cents: s.amount_total ?? 0,
          status: "paid",
          stripe_session_id: s.id,
        });
      } else if (kind === "subscription") {
        const userId = s.metadata?.user_id ?? s.client_reference_id ?? null;
        if (userId && s.subscription) {
          const sub = await getStripe().subscriptions.retrieve(s.subscription as string);
          await admin.from("user_subscriptions").upsert({
            user_id: userId,
            status: normStatus(sub.status),
            plan: s.metadata?.plan ?? null,
            current_period_end: periodEndISO(sub),
            stripe_customer_id: (sub.customer as string) ?? null,
            stripe_subscription_id: sub.id,
            updated_at: new Date().toISOString(),
          });
        }
      }
    } else if (evt.type === "customer.subscription.updated" || evt.type === "customer.subscription.deleted") {
      const sub = evt.data.object as Stripe.Subscription;
      await admin.from("user_subscriptions").update({
        status: evt.type === "customer.subscription.deleted" ? "canceled" : normStatus(sub.status),
        current_period_end: periodEndISO(sub),
        updated_at: new Date().toISOString(),
      }).eq("stripe_subscription_id", sub.id);
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
