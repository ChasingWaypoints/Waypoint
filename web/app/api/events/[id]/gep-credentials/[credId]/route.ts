import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../../../lib/supabase/auth";
import { createAdminClient } from "../../../../../../lib/supabase/admin";

// DELETE /api/events/[id]/gep-credentials/[credId]
// Revoke a named GEP credential — organizer only.
// After deletion the token in the KML file the viewer was given returns 401.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; credId: string }> }
) {
  const { id, credId } = await params;
  const { user, supabase } = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: event } = await supabase
    .from("events").select("organizer_id").eq("id", id).single();
  if (!event || event.organizer_id !== user.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("event_gep_credentials")
    .delete()
    .eq("id", credId)
    .eq("event_id", id); // safety check

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
