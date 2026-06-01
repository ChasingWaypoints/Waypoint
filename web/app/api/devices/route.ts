import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";

// GET /api/devices — list user's devices
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("devices")
    .select("id, name, type, is_active, last_polled_at, poll_error, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/devices — add a new device
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { name, type, feed_url, feed_id, feed_password } = body;

  if (!name || !type) return NextResponse.json({ error: "Name and type required" }, { status: 400 });

  // Validate Garmin feed URL by fetching it
  if (type === "garmin" && feed_url) {
    try {
      const res = await fetch(feed_url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return NextResponse.json({ error: "Could not reach Garmin feed URL. Check your MapShare link." }, { status: 400 });
      const text = await res.text();
      if (!text.includes("kml") && !text.includes("KML") && !text.includes("Placemark")) {
        return NextResponse.json({ error: "URL does not appear to be a valid Garmin KML feed." }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: "Could not reach Garmin feed URL. Check your MapShare link." }, { status: 400 });
    }
  }

  const { data, error } = await supabase
    .from("devices")
    .insert({ user_id: user.id, name, type, feed_url, feed_id, feed_password })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
