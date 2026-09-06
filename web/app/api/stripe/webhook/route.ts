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

  // Fail loudly if the service-role key is absent — otherwise writes below get
  // silently rejected by RLS and the webhook returns 200 while nothing updates.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[webhook] SUPABASE_SERVICE_ROLE_KEY is not set");
    return NextResponse.json({ error: "Server not configured: SUPABASE_SERVICE_ROLE_KEY missing" }, { status: 500 });
  }

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
        const seats = parseInt(s.metadata?.seats ?? "40", 10) || 40;
        const { data: rows, error } = await admin.from("events")
          .update({ paid: true, paid_at: new Date().toISOString(), seats_paid: seats })
          .eq("id", s.metadata.event_id)
          .select("id");
        if (error) throw new Error(`events paid update failed: ${error.message}`);
        if (!rows || rows.length === 0) throw new Error(`event ${s.metadata.event_id} not found for paid update`);
        const { error: payErr } = await admin.from("event_payments").insert({
          event_id: s.metadata.event_id,
          amount_cents: s.amount_total ?? 0,
          status: "paid",
          stripe_session_id: s.id,
        });
        if (payErr) throw new Error(`event_payments insert failed: ${payErr.message}`);
      } else if (kind === "seats" && s.metadata?.event_id) {
        // Add-seats top-up: increment the paid capacity by the purchased seats.
        const added = parseInt(s.metadata?.seats ?? "0", 10) || 0;
        const { data: ev, error: selErr } = await admin
          .from("events").select("seats_paid").eq("id", s.metadata.event_id).single();
        if (selErr) throw new Error(`seats select failed: ${selErr.message}`);
        const current = ev?.seats_paid ?? 40;
        const { data: rows, error } = await admin.from("events")
          .update({ seats_paid: current + added })
          .eq("id", s.metadata.event_id)
          .select("id");
        if (error) throw new Error(`seats update failed: ${error.message}`);
        if (!rows || rows.length === 0) throw new Error(`event ${s.metadata.event_id} not found for seats update`);
        const { error: payErr } = await admin.from("event_payments").insert({
          event_id: s.metadata.event_id,
          amount_cents: s.amount_total ?? 0,
          status: "paid",
          stripe_session_id: s.id,
        });
        if (payErr) throw new Error(`event_payments insert failed: ${payErr.message}`);
      } else if (kind === "subscription") {
        const userId = s.metadata?.user_id ?? s.client_reference_id ?? null;
        if (userId && s.subscription) {
          const sub = await getStripe().subscriptions.retrieve(s.subscription as string);
          const { error } = await admin.from("user_subscriptions").upsert({
            user_id: userId,
            status: normStatus(sub.status),
            plan: s.metadata?.plan ?? null,
            current_period_end: periodEndISO(sub),
            stripe_customer_id: (sub.customer as string) ?? null,
            stripe_subscription_id: sub.id,
            updated_at: new Date().toISOString(),
          });
          if (error) throw new Error(`user_subscriptions upsert failed: ${error.message}`);
        }
      } else if (kind === "entrant_paid" && s.metadata?.participant_id) {
        const { data: rows, error } = await admin.from("event_participants")
          .update({ paid_at: new Date().toISOString() })
          .eq("id", s.metadata.participant_id)
          .select("id");
        if (error) throw new Error(`entrant paid update failed: ${error.message}`);
        if (!rows || rows.length === 0) throw new Error(`participant ${s.metadata.participant_id} not found for paid update`);
        if (s.metadata?.event_id) {
          const { error: payErr } = await admin.from("event_payments").insert({
            event_id: s.metadata.event_id,
            amount_cents: s.amount_total ?? 0,
            status: "paid",
            stripe_session_id: s.id,
          });
          if (payErr) throw new Error(`event_payments insert failed: ${payErr.message}`);
        }
      } else if (kind === "org") {
        const userId = s.metadata?.user_id ?? s.client_reference_id ?? null;
        if (userId && s.subscription) {
          const sub = await getStripe().subscriptions.retrieve(s.subscription as string);
          const { error } = await admin.from("org_subscriptions").upsert({
            user_id: userId,
            status: normStatus(sub.status),
            current_period_end: periodEndISO(sub),
            entrant_pool: 1500,
            entrants_used: 0,
            stripe_customer_id: (sub.customer as string) ?? null,
            stripe_subscription_id: sub.id,
            updated_at: new Date().toISOString(),
          });
          if (error) throw new Error(`org_subscriptions upsert failed: ${error.message}`);
        }
      } else {
        // Unknown/again kind — acknowledge so Stripe stops retrying, but log it.
        console.warn(`[webhook] checkout.session.completed with unhandled kind=${kind ?? "(none)"} id=${s.id}`);
      }
    } else if (evt.type === "customer.subscription.updated" || evt.type === "customer.subscription.deleted") {
      const sub = evt.data.object as Stripe.Subscription;
      await admin.from("user_subscriptions").update({
        status: evt.type === "customer.subscription.deleted" ? "canceled" : normStatus(sub.status),
        current_period_end: periodEndISO(sub),
        updated_at: new Date().toISOString(),
      }).eq("stripe_subscription_id", sub.id);

      // Org subscription: mirror status/period, and reset the entrant pool when
      // the billing period rolls forward (annual renewal).
      const { data: orgRow } = await admin.from("org_subscriptions")
        .select("current_period_end").eq("stripe_subscription_id", sub.id).maybeSingle();
      if (orgRow) {
        const newEnd = periodEndISO(sub);
        const renewed = !!orgRow.current_period_end && !!newEnd
          && new Date(newEnd) > new Date(orgRow.current_period_end);
        await admin.from("org_subscriptions").update({
          status: evt.type === "customer.subscription.deleted" ? "canceled" : normStatus(sub.status),
          current_period_end: newEnd,
          ...(renewed ? { entrants_used: 0 } : {}),
          updated_at: new Date().toISOString(),
        }).eq("stripe_subscription_id", sub.id);
      }
    }
  } catch (e) {
    console.error("[webhook] handler error:", (e as Error).message);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
