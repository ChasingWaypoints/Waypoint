import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../../../lib/supabase/auth";
import { parseCSVWithHeader } from "../../../../../../lib/csv";
import { rowToEntrant, EntrantInput, RowError, CSV_TEMPLATE } from "../../../../../../lib/entrants";

const MAX_ROWS = 1000;

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
  let csv = "";
  let dryRun = request.nextUrl.searchParams.get("dry_run") === "1";
  let replace = false;

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size > 2_000_000) {
      return NextResponse.json({ error: "File too large (2 MB max)" }, { status: 400 });
    }
    csv = await file.text();
    if (form.get("dry_run")) dryRun = true;
    if (form.get("replace")) replace = true;
  } else {
    let body: { csv?: string; dry_run?: boolean; replace?: boolean };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    csv = body.csv ?? "";
    if (body.dry_run) dryRun = true;
    if (body.replace) replace = true;
  }

  if (!csv.trim()) {
    return NextResponse.json({ error: "Empty CSV" }, { status: 400 });
  }

  const rows = parseCSVWithHeader(csv);
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
  const valid: EntrantInput[] = [];
  const errors: RowError[] = [];

  rows.forEach((row, i) => {
    const result = rowToEntrant(row, i + 2); // +2: 1-based, and skip header
    if ("error" in result) errors.push(result.error);
    else valid.push(result.entrant);
  });

  // ── Flag duplicates inside the file ─────────────────────────
  const seen = new Map<string, number>();
  const duplicates: string[] = [];
  valid.forEach((e) => {
    const key = `${e.display_name.toLowerCase()}|${e.rider_number ?? ""}`;
    const prev = seen.get(key);
    if (prev !== undefined) duplicates.push(e.display_name);
    else seen.set(key, 1);
  });

  if (dryRun) {
    return NextResponse.json({
      dry_run: true,
      would_insert: valid.length,
      errors,
      duplicates,
      preview: valid.slice(0, 10),
    });
  }

  if (valid.length === 0) {
    return NextResponse.json(
      { error: "No valid rows to import", errors },
      { status: 400 }
    );
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
    .insert(valid.map((e) => ({ ...e, event_id: id })))
    .select("id, display_name, rider_number, rider_class, device_type, gep_token");

  if (error) {
    return NextResponse.json(
      { error: error.message, errors, inserted: 0 },
      { status: 500 }
    );
  }

  return NextResponse.json({
    inserted: data?.length ?? 0,
    skipped: errors.length,
    errors,
    duplicates,
    entrants: data,
  });
}
