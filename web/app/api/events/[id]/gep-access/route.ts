import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../../lib/supabase/auth";
import { createAdminClient } from "../../../../../lib/supabase/admin";

// GET /api/events/[id]/gep-access
// Returns GEP access log for the event — organizer only.
// Covers both participant tokens (app riders) and named credentials (external viewers).
// Use this to trace a leaked GEP link back to the person who shared it.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, supabase } = await getUserFromRequest(request);
  const admin = createAdminClient();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: event } = await supabase
    .from("events").select("organizer_id").eq("id", id).single();
  if (!event || event.organizer_id !== user.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Pull last 500 accesses — join both participant and credential tables
  const { data: logs, error } = await admin
    .from("gep_access_log")
    .select(`
      id, accessed_at, ip_address, user_agent,
      participant_id, credential_id,
      event_participants(display_name, role, gep_token),
      event_gep_credentials(display_name, gep_token)
    `)
    .eq("event_id", id)
    .order("accessed_at", { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Summarise per token — each entry is either a participant or a named credential
  const byToken: Record<string, {
    display_name: string;
    type: "participant" | "credential";
    role?: string;
    gep_token: string;
    access_count: number;
    last_seen: string;
    unique_ips: string[];
    last_ip: string;
  }> = {};

  for (const log of logs ?? []) {
    const participant = (log as any).event_participants;
    const credential = (log as any).event_gep_credentials;
    const holder = participant ?? credential;
    if (!holder) continue;

    const key = holder.gep_token;
    if (!byToken[key]) {
      byToken[key] = {
        display_name: holder.display_name,
        type: participant ? "participant" : "credential",
        role: participant?.role,
        gep_token: holder.gep_token,
        access_count: 0,
        last_seen: log.accessed_at,
        unique_ips: [],
        last_ip: log.ip_address ?? "unknown",
      };
    }
    byToken[key].access_count += 1;
    if (log.ip_address && !byToken[key].unique_ips.includes(log.ip_address)) {
      byToken[key].unique_ips.push(log.ip_address);
    }
  }

  return NextResponse.json({
    summary: Object.values(byToken).sort((a, b) => b.access_count - a.access_count),
    raw_logs: logs,
  });
}
