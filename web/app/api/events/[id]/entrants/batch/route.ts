import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../../../lib/supabase/auth";
import { parseCSVWithHeader, normaliseHeader } from "../../../../../../lib/csv";
import * as XLSX from "xlsx";
import { rowToEntrant, EntrantInput, RowError, CSV_TEMPLATE, waypointCodeFromRow } from "../../../../../../lib/entrants";

const MAX_ROWS = 1000;

// Parse the first sheet of an .xlsx/.xls workbook into rows keyed by the
// same normalised headers parseCSVWithHeader produces, so the rest of the
// importer treats a spreadsheet exactly like a CSV.
function parseXlsxRows(buf: Buffer): Record<string, string>[] {
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
  return raw.map((r) => {
    const obj: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) {
      const nk = normaliseHeader(k);
      if (nk) obj[nk] = String(v ?? "").trim();
    }
    return obj;
  });
}

async function requireOrganizer(request: NextRequest, eventId: string) {
  const { user, supabase } = await getUserFromRequest(request);
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const { data: event } = await supabase
    .from("events")
    .select("id, organizer_id")
    .eq("id", eventId)
    .single();
  if (!event || event.organizer_id !== user.id) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user, supabase };
}

// ── GET — download the CSV template ───────────────────────────

// Read-only seat-capacity snapshot for an event (no side effects). Mirrors the
// join route's tiers: comped = uncapped; otherwise free events cap at 10 and
// paid events at seats_paid, with an active org subscription's pool on top.
async function readCapacity(
  supabase: NonNullable<Awaited<ReturnType<typeof requireOrganizer>>["supabase"]>,
  eventId: string,
  organizerId: string
) {
  const { data: ev } = await supabase
    .from("events").select("comped, paid, seats_paid").eq("id", eventId).single();
  if (!ev) return { comped: false, limit: 10, existing: 0, poolRemaining: 0 };
  if (ev.comped) return { comped: true, limit: Infinity, existing: 0, poolRemaining: 0 };
  const { count } = await supabase
    .from("event_participants").select("id", { count: "exact", head: true }).eq("event_id", eventId);
  const limit = ev.paid ? (ev.seats_paid ?? 40) : 10;
  const { data: sub } = await supabase
    .from("org_subscriptions")
    .select("entrant_pool, entrants_used, status, current_period_end")
    .eq("user_id", organizerId).maybeSingle();
  const active = !!sub && sub.status === "active"
    && (!sub.current_period_end || new Date(sub.current_period_end) > new Date());
  const poolRemaining = active ? Math.max(0, (sub.entrant_pool ?? 0) - (sub.entrants_used ?? 0)) : 0;
  return { comped: false, limit, existing: count ?? 0, poolRemaining };
}

export async function GET(
  _request: NextRequest,
  _ctx: { params: Promise<{ id: string }> }
) {
  // The template is a fixed sample CSV with no event data, so it needs no
  // auth — a plain <a download> link can fetch it without a Bearer token.
  return new NextResponse(CSV_TEMPLATE, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="waypoint-entrants-template.csv"',
    },
  });
}

// ── POST — batch load a roster ────────────────────────────────
//
// Accepts either multipart/form-data with a `file` field, or JSON
// { csv: "..." }. Add `?dry_run=1` (or dry_run in the form/body) to
// validate without writing — the dashboard uses this to preview.
//
// Rows are validated independently: a bad row never blocks the good
// ones. The response always reports exactly what happened per row.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guard = await requireOrganizer(request, id);
  if ("error" in guard) return guard.error;

  const contentType = request.headers.get("content-type") ?? "";
  let dryRun = request.nextUrl.searchParams.get("dry_run") === "1";
  let replace = false;
  let rows: Record<string, string>[] = [];

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size > 2_000_000) {
      return NextResponse.json({ error: "File too large (2 MB max)" }, { status: 400 });
    }
    if (form.get("dry_run")) dryRun = true;
    if (form.get("replace")) replace = true;

    const name = (file.name || "").toLowerCase();
    const isXlsx =
      name.endsWith(".xlsx") ||
      name.endsWith(".xls") ||
      file.type.includes("spreadsheetml") ||
      file.type.includes("ms-excel");
    if (isXlsx) {
      const buf = Buffer.from(await file.arrayBuffer());
      try {
        rows = parseXlsxRows(buf);
      } catch {
        return NextResponse.json({ error: "Could not read that spreadsheet." }, { status: 400 });
      }
    } else {
      const csv = await file.text();
      if (!csv.trim()) {
        return NextResponse.json({ error: "Empty file" }, { status: 400 });
      }
      rows = parseCSVWithHeader(csv);
    }
  } else {
    let body: { csv?: string; dry_run?: boolean; replace?: boolean };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const csv = body.csv ?? "";
    if (body.dry_run) dryRun = true;
    if (body.replace) replace = true;
    if (!csv.trim()) {
      return NextResponse.json({ error: "Empty CSV" }, { status: 400 });
    }
    rows = parseCSVWithHeader(csv);
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No data rows found. The first line must be a header row." },
      { status: 400 }
    );
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `Too many rows (${rows.length}). Maximum is ${MAX_ROWS}.` },
      { status: 400 }
    );
  }

  // ── Validate every row ──────────────────────────────────────
  const valid: { entrant: EntrantInput; code: string | null }[] = [];
  const errors: RowError[] = [];

  rows.forEach((row, i) => {
    const result = rowToEntrant(row, i + 2); // +2: 1-based, and skip header
    if ("error" in result) errors.push(result.error);
    else valid.push({ entrant: result.entrant, code: waypointCodeFromRow(row) });
  });

  // Resolve any Waypoint account codes to linked users (dedup the calls).
  const codeToUser = new Map<string, string | null>();
  const uniqueCodes = [
    ...new Set(valid.map((v) => v.code).filter((c): c is string => !!c).map((c) => c.toUpperCase())),
  ];
  for (const code of uniqueCodes) {
    const { data: uid } = await guard.supabase!.rpc("resolve_waypoint_id", { p_code: code });
    codeToUser.set(code, (uid as string | null) ?? null);
  }
  const linkFor = (code: string | null): string | null =>
    code ? codeToUser.get(code.toUpperCase()) ?? null : null;
  const unlinkedCodes = uniqueCodes.filter((c) => !codeToUser.get(c));

  // Collision-safe linking: a Waypoint account already in this event (or
  // appearing twice in this file) can't be linked to a second entry. Such
  // rows still import — just unlinked — and are reported back.
  const resolvedIds = [
    ...new Set(valid.map((v) => linkFor(v.code)).filter((u): u is string => !!u)),
  ];
  const existingUserIds = new Set<string>();
  if (resolvedIds.length) {
    const { data: existing } = await guard.supabase!
      .from("event_participants")
      .select("user_id")
      .eq("event_id", id)
      .in("user_id", resolvedIds);
    for (const r of (existing ?? []) as { user_id: string | null }[]) {
      if (r.user_id) existingUserIds.add(r.user_id);
    }
  }
  const usedInBatch = new Set<string>();
  const alreadyInEvent: string[] = [];
  let insertRows = valid.map((v) => {
    let uid = linkFor(v.code);
    if (uid && (existingUserIds.has(uid) || usedInBatch.has(uid))) {
      alreadyInEvent.push(v.entrant.display_name);
      uid = null;
    } else if (uid) {
      usedInBatch.add(uid);
    }
    return { ...v.entrant, event_id: id, user_id: uid };
  });
  const linkedCount = insertRows.filter((r) => r.user_id).length;

  // ── Flag duplicates inside the file ─────────────────────────
  const seen = new Map<string, number>();
  const duplicates: string[] = [];
  valid.forEach((v) => {
    const e = v.entrant;
    const key = `${e.display_name.toLowerCase()}|${e.rider_number ?? ""}`;
    const prev = seen.get(key);
    if (prev !== undefined) duplicates.push(e.display_name);
    else seen.set(key, 1);
  });

  if (dryRun) {
    const cap = await readCapacity(guard.supabase!, id, guard.user!.id);
    const room = cap.comped ? valid.length : Math.max(0, cap.limit - cap.existing) + cap.poolRemaining;
    const wouldInsert = Math.min(valid.length, room);
    return NextResponse.json({
      dry_run: true,
      would_insert: wouldInsert,
      would_cap: valid.length - wouldInsert,
      would_link: linkedCount,
      unlinked_codes: unlinkedCodes,
      already_in_event: alreadyInEvent,
      errors,
      duplicates,
      preview: valid.slice(0, 10).map((v) => v.entrant),
    });
  }

  if (valid.length === 0) {
    return NextResponse.json(
      { error: "No valid rows to import", errors },
      { status: 400 }
    );
  }

  // ── Seat cap enforcement ────────────────────────────────────
  // Roster import must respect the same capacity as join-by-code, or it
  // becomes a way to bypass paid seats. comped = uncapped; an active org
  // subscription's pool covers rows first; otherwise free = 10, paid = seats_paid.
  let cappedForCapacity = 0;
  {
    const { data: ev } = await guard.supabase!
      .from("events").select("comped, paid, seats_paid").eq("id", id).single();
    if (ev && !ev.comped) {
      const { count: existing } = await guard.supabase!
        .from("event_participants").select("id", { count: "exact", head: true }).eq("event_id", id);
      const limit = ev.paid ? (ev.seats_paid ?? 40) : 10;
      const { data: hasOrg } = await guard.supabase!
        .rpc("user_has_org", { p_user_id: guard.user!.id });
      let capCount = existing ?? 0;
      const kept: typeof insertRows = [];
      for (const row of insertRows) {
        let covered = false;
        if (hasOrg) {
          const { data: consumed } = await guard.supabase!
            .rpc("consume_org_entrant", { p_event_id: id });
          if (consumed) covered = true;
        }
        if (!covered) {
          if (capCount < limit) capCount++;
          else { cappedForCapacity++; continue; }
        }
        kept.push(row);
      }
      insertRows = kept;
    }
  }

  if (insertRows.length === 0) {
    return NextResponse.json({
      inserted: 0,
      capped: cappedForCapacity,
      error: cappedForCapacity > 0
        ? "Event is full — no riders added. Upgrade or add seats to import more."
        : "No valid rows to import",
    }, { status: cappedForCapacity > 0 ? 409 : 400 });
  }

  // ── Optionally clear the existing roster ────────────────────
  // Only removes account-less roster rows; app users who joined with
  // the event code keep their place.
  if (replace) {
    const { error: delError } = await guard.supabase!
      .from("event_participants")
      .delete()
      .eq("event_id", id)
      .is("user_id", null);
    if (delError) {
      return NextResponse.json(
        { error: `Could not clear existing roster: ${delError.message}` },
        { status: 500 }
      );
    }
  }

  const { data, error } = await guard.supabase!
    .from("event_participants")
    .insert(insertRows)
    .select("id, display_name, rider_number, rider_class, device_type, gep_token");

  if (error) {
    return NextResponse.json(
      { error: error.message, errors, inserted: 0 },
      { status: 500 }
    );
  }

  return NextResponse.json({
    inserted: data?.length ?? 0,
    capped: cappedForCapacity,
    linked: linkedCount,
    unlinked_codes: unlinkedCodes,
    already_in_event: alreadyInEvent,
    skipped: errors.length,
    errors,
    duplicates,
    entrants: data,
  });
}
