import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../lib/supabase/auth";

// GET /api/org — org subscription status + branding for the current user.
export async function GET(request: NextRequest) {
  const { user, supabase } = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: sub } = await supabase
    .from("org_subscriptions")
    .select("status, current_period_end, entrant_pool, entrants_used")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: branding } = await supabase
    .from("org_branding")
    .select("org_name, logo_url, accent_color, site_url")
    .eq("user_id", user.id)
    .maybeSingle();

  const active = !!sub && sub.status === "active" &&
    (!sub.current_period_end || new Date(sub.current_period_end) > new Date());

  return NextResponse.json({
    active,
    subscription: sub ?? null,
    branding: branding ?? null,
  });
}

// PATCH /api/org — update the org's white-label branding (owner only).
export async function PATCH(request: NextRequest) {
  const { user, supabase } = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const updates: Record<string, unknown> = { user_id: user.id, updated_at: new Date().toISOString() };

  if ("org_name" in body) updates.org_name = body.org_name ? String(body.org_name).slice(0, 80) : null;
  if ("logo_url" in body) updates.logo_url = body.logo_url ? String(body.logo_url).slice(0, 500) : null;
  if ("site_url" in body) updates.site_url = body.site_url ? String(body.site_url).slice(0, 300) : null;
  if ("accent_color" in body) {
    const c = String(body.accent_color || "").trim();
    updates.accent_color = /^#[0-9a-fA-F]{6}$/.test(c) ? c.toUpperCase() : null;
  }

  const { error } = await supabase.from("org_branding").upsert(updates, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
