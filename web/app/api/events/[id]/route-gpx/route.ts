import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../../lib/supabase/auth";

// POST /api/events/[id]/route-gpx — organizer uploads a GPX route file
// Body: multipart/form-data with `file` field (GPX file) and optional `route_name`
// OR JSON body with `gpx` (raw GPX string) and optional `route_name`
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, supabase } = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify organizer
  const { data: event } = await supabase
    .from("events").select("organizer_id").eq("id", id).single();
  if (!event || event.organizer_id !== user.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let gpxContent = "";
  let routeName = "";

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (!file.name.toLowerCase().endsWith(".gpx"))
      return NextResponse.json({ error: "File must be a .gpx file" }, { status: 400 });
    gpxContent = await file.text();
    routeName = (form.get("route_name") as string) || file.name.replace(/\.gpx$/i, "");
  } else {
    const body = await request.json();
    gpxContent = body.gpx ?? "";
    routeName = body.route_name ?? "Route";
  }

  if (!gpxContent.includes("<gpx")) {
    return NextResponse.json({ error: "Invalid GPX file" }, { status: 400 });
  }

  const { error } = await supabase
    .from("events")
    .update({ route_gpx: gpxContent, route_name: routeName })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, route_name: routeName });
}

// DELETE /api/events/[id]/route-gpx — remove the uploaded route
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, supabase } = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: event } = await supabase
    .from("events").select("organizer_id").eq("id", id).single();
  if (!event || event.organizer_id !== user.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await supabase.from("events").update({ route_gpx: null, route_name: null }).eq("id", id);
  return NextResponse.json({ ok: true });
}
