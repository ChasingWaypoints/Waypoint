import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../../lib/supabase/auth";
import { createAdminClient } from "../../../../../lib/supabase/admin";

// GET /api/events/[id]/gep-access
// Returns GEP access log for the event — organizer only.
// Each row shows who fetched the KML, when, and from what IP.
// Use this to trace a leaked GEP link back to the participant who shared it.
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

  // Pull last 500 accesses with participant info
  const { data: logs, error } = await admin
    .from("gep_access_log")
    .select("id, accessed_at, ip_address, user_agent, event_participants(display_name, role, gep_token)")
    .eq("event_id", id)
    .order("accessed_at", { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Summarise per-participant for easy scanning
  const byParticipant: Record<string, {
    display_name: string;
    role: string;
    gep_token: string;
    access_count: number;
    last_seen: string;
    unique_ips: string[];
    last_ip: string;
  }> = {};

  for (const log of logs ?? []) {
    const p = (log as any).event_participants;
    if (!p) continue;
    const key = p.gep_token;
    if (!byParticipant[key]) {
      byParticipant[key] = {
        display_name: p.display_name,
        role: p.role,
        gep_token: p.gep_token,
        access_count: 0,
        last_seen: log.accessed_at,
        unique_ips: [],
        last_ip: log.ip_address ?? "unknown",
      };
    }
    byParticipant[key].access_count += 1;
    if (log.ip_address && !byParticipant[key].unique_ips.includes(log.ip_address)) {
      byParticipant[key].unique_ips.push(log.ip_address);
    }
  }

  return NextResponse.json({
    summary: Object.values(byParticipant).sort((a, b) => b.access_count - a.access_count),
    raw_logs: logs,
  });
}
