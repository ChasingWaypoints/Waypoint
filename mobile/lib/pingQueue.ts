/**
 * pingQueue.ts
 *
 * Durable, offline-first buffer for position fixes.
 *
 * The old background task inserted straight into Supabase. In a dead zone that
 * insert simply failed and the fix was gone forever — which in Baja is most of
 * them. Every fix now lands in SQLite first and is only deleted once the server
 * has acknowledged it, so a rider can run the whole day off-grid and still
 * produce a complete track the moment they get a bar of signal.
 */

import * as SQLite from "expo-sqlite";

export type QueuedPing = {
  id?: number;
  recorded_at: string;          // ISO 8601
  lat: number;
  lng: number;
  altitude_m: number | null;
  speed_kmh: number | null;
  accuracy_m: number | null;
  heading_deg: number | null;
  battery_pct: number | null;
  /** "trip" writes to track_points, "event" goes through ingest_phone_points. */
  mode: "trip" | "event";
  /** trip_id for mode "trip", event_id for mode "event". */
  context_id: string;
  /** participant_id, only for mode "event". */
  participant_id: string | null;
};

/** Hard cap. At 30 s cadence this is ~3.5 days of continuous off-grid riding. */
const MAX_ROWS = 10_000;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) dbPromise = SQLite.openDatabaseAsync("waypoint-queue.db");
  return dbPromise;
}

export async function initQueue(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS pending_pings (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      recorded_at    TEXT    NOT NULL,
      lat            REAL    NOT NULL,
      lng            REAL    NOT NULL,
      altitude_m     REAL,
      speed_kmh      REAL,
      accuracy_m     REAL,
      heading_deg    REAL,
      battery_pct    INTEGER,
      mode           TEXT    NOT NULL,
      context_id     TEXT    NOT NULL,
      participant_id TEXT
    );
    CREATE INDEX IF NOT EXISTS pending_order ON pending_pings (id);
    CREATE UNIQUE INDEX IF NOT EXISTS pending_dedupe
      ON pending_pings (context_id, recorded_at);
  `);
}

export async function enqueue(p: QueuedPing): Promise<void> {
  const db = await getDb();
  // INSERT OR IGNORE: a duplicate timestamp for the same context is the same
  // fix arriving twice, which the OS does do when it batches deliveries.
  await db.runAsync(
    `INSERT OR IGNORE INTO pending_pings
       (recorded_at, lat, lng, altitude_m, speed_kmh, accuracy_m, heading_deg,
        battery_pct, mode, context_id, participant_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      p.recorded_at, p.lat, p.lng, p.altitude_m, p.speed_kmh, p.accuracy_m,
      p.heading_deg, p.battery_pct, p.mode, p.context_id, p.participant_id,
    ]
  );
  await trimQueue();
}

/** Oldest-first, which is the order a track has to be rebuilt in. */
export async function peek(limit = 200): Promise<QueuedPing[]> {
  const db = await getDb();
  return db.getAllAsync<QueuedPing>(
    `SELECT * FROM pending_pings ORDER BY id ASC LIMIT ?`,
    [limit]
  );
}

export async function drop(ids: number[]): Promise<void> {
  if (!ids.length) return;
  const db = await getDb();
  const marks = ids.map(() => "?").join(",");
  await db.runAsync(`DELETE FROM pending_pings WHERE id IN (${marks})`, ids);
}

export async function pendingCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM pending_pings`
  );
  return row?.n ?? 0;
}

/**
 * Drop the OLDEST rows when over cap. Losing the start of a long off-grid day
 * is bad; losing the most recent fixes — the ones that say where the rider is
 * right now — would be worse.
 */
async function trimQueue(): Promise<void> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM pending_pings`
  );
  const n = row?.n ?? 0;
  if (n <= MAX_ROWS) return;
  await db.runAsync(
    `DELETE FROM pending_pings WHERE id IN (
       SELECT id FROM pending_pings ORDER BY id ASC LIMIT ?
     )`,
    [n - MAX_ROWS]
  );
}

/** Used by Settings → delete device data. */
export async function clearQueue(): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM pending_pings`);
}
