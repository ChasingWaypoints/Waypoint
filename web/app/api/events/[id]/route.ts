import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../lib/supabase/auth";
import { createAnonClient } from "../../../../lib/supabase/admin";
import { eventDurationDays, entrantFeeCentsForDays } from "../../../../lib/pricing";

// GET /api/events/[id] — full event data with riders and their tracks
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, supabase } = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: event, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOrganizer = event.organizer_id === user.id;

  // Fetch participants via the user's own supabase client (RLS enforced — correct)
  const { data: participants } = await supabase
    .from("event_participants")
    .select("id, user_id, display_name, role, gep_token, joined_at, rider_class, rider_number")
    .eq("event_id", id)
    .order("role", { ascending: true }); // organizer first

  // Find the current user's gep_token
  const me = (participants ?? []).find((p: any) => p.user_id === user.id);

  // For each participant, fetch their track via the get_rider_track() SECURITY DEFINER
  // RPC — this lets us read any user's trips/track_points without the service role key.
  const anonSupabase = createAnonClient();
  const riders = await Promise.all(
    (participants ?? []).map(async (p: any) => {
      const { gep_token, rider_class, rider_number, ...rest } = p;

      const { data: points } = await anonSupabase.rpc("get_rider_track", {
        p_user_id:    p.user_id,
        p_max_points: 500,
      });

      const pts = (points ?? []) as { lat: number; lng: number; altitude_m: number; speed_kmh: number; recorded_at: string }[];
      const latest = pts.length > 0 ? pts[pts.length - 1] : null;

      return {
        ...rest,
        rider_class: rider_class ?? null,
        rider_number: rider_number ?? null,
        latest,
        track: pts,
        ...(isOrganizer ? { gep_token } : {}),
      };
    })
  );

  return NextResponse.json({
    event,
    riders,
    my_gep_token: me?.gep_token ?? null,
    is_organizer: isOrganizer,
  });
}

// PATCH /api/events/[id] — update event (organizer only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, supabase } = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: event } = await supabase.from("events").select("organizer_id").eq("id", id).single();
  if (!event || event.organizer_id !== user.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const allowed = ["name", "description", "status", "starts_at", "ends_at"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }
  // rider_classes is a text[] — validate separately
  if ("rider_classes" in body) {
    updates.rider_classes = Array.isArray(body.rider_classes)
      ? body.rider_classes.map((c: string) => String(c).trim()).filter(Boolean)
      : [];
  }

  // Branding: event logo URL + sponsor list (validated/sanitised).
  if ("logo_url" in body) {
    updates.logo_url = body.logo_url ? String(body.logo_url) : null;
  }
  if ("sponsors" in body) {
    updates.sponsors = Array.isArray(body.sponsors)
      ? body.sponsors
          .filter((sp: { logo_url?: unknown }) => sp && typeof sp.logo_url === "string" && sp.logo_url)
          .slice(0, 24)
          .map((sp: { name?: unknown; logo_url: string; url?: unknown; headline?: unknown }) => ({
            name: sp.name ? String(sp.name).slice(0, 80) : "",
            logo_url: String(sp.logo_url),
            url: sp.url ? String(sp.url).slice(0, 300) : "",
            headline: !!sp.headline,
          }))
      : [];
  }

  // Payment mode. The entrant fee is DERIVED from the event window below, not
  // taken from the client, so riders are always charged the correct tier.
  if ("payment_mode" in body) {
    updates.payment_mode = body.payment_mode === "entrant" ? "entrant" : "organizer";
  }
  // Re-derive the entrant fee whenever the dates or payment mode change. Use the
  // event's effective window (new value if provided, otherwise the stored one).
  const touchesFee = "starts_at" in body || "ends_at" in body || "payment_mode" in body;
  if (touchesFee) {
    const { data: cur } = await supabase
      .from("events").select("starts_at, ends_at").eq("id", id).single();
    const startsAt = ("starts_at" in updates ? updates.starts_at : cur?.starts_at) as string | null;
    const endsAt = ("ends_at" in updates ? updates.ends_at : cur?.ends_at) as string | null;
    const days = eventDurationDays(startsAt, endsAt);
    updates.entrant_fee_cents = entrantFeeCentsForDays(days);
  }
  if ("public_show_route" in body) updates.public_show_route = !!body.public_show_route;
  if ("public_show_waypoints" in body) updates.public_show_waypoints = !!body.public_show_waypoints;

  // Private events (no public spectator page/embed) are a premium feature —
  // available on paid or comped events, or to organizers on an active Org plan.
  if ("is_private" in body) {
    const wantsPrivate = !!body.is_private;
    if (wantsPrivate) {
      const { data: ev } = await supabase.from("events").select("paid, comped").eq("id", id).single();
      let eligible = !!(ev?.paid || ev?.comped);
      if (!eligible) {
        const { data: sub } = await supabase
          .from("org_subscriptions").select("status, current_period_end").eq("user_id", user.id).maybeSingle();
        eligible = !!sub && sub.status === "active"
          && (!sub.current_period_end || new Date(sub.current_period_end) > new Date());
      }
      if (!eligible) {
        return NextResponse.json(
          { error: "Private events require a paid event or an Org plan." },
          { status: 403 }
        );
      }
    }
    updates.is_private = wantsPrivate;
  }

  const { data, error } = await supabase.from("events").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/events/[id] — hard-delete an event (organizer only; super admins
// use the admin route). The delete_event RPC checks organizer-or-super-admin and
// cascades to participants, track points, stages and billing seats.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, supabase } = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase.rpc("delete_event", { p_event_id: id });
  if (error) {
    if (error.code === "42501" || /not authorized/i.test(error.message)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, deleted: true });
}
