"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { theme, font, text } from "../../lib/theme";
import { LogoMark } from "@/components/LogoMark";

/**
 * Browser tracking — the interim "track from your phone, no app" path until the
 * mobile app ships. Uses navigator.geolocation.watchPosition for accuracy and
 * persists a fix at the chosen interval, holds a Wake Lock so the screen stays
 * on, and writes straight to the owner's trip via RLS (no API route needed).
 */

type Phase = "idle" | "tracking" | "done";
const INTERVALS = [1, 5, 15, 30] as const;

function randomToken(): string {
  try { return crypto.randomUUID().replace(/-/g, "").slice(0, 12); }
  catch { return Math.random().toString(36).slice(2, 14); }
}

export default function BrowserTrackPage() {
  const supabase = getSupabaseClient();
  const [phase, setPhase] = useState<Phase>("idle");
  const [tripName, setTripName] = useState("");
  const [intervalMin, setIntervalMin] = useState<number>(5);
  const [error, setError] = useState<string | null>(null);
  const [wakeOn, setWakeOn] = useState(false);
  const [pointCount, setPointCount] = useState(0);
  const [lastFix, setLastFix] = useState<{ lat: number; lng: number; at: string } | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const wakeRef = useRef<WakeLockSentinel | null>(null);
  const tripIdRef = useRef<string | null>(null);
  const lastPostedRef = useRef<number>(0);
  const intervalRef = useRef<number>(intervalMin);
  intervalRef.current = intervalMin;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) { window.location.href = "/auth/login"; return; }
      setAuthed(true);
      const d = new Date();
      setTripName(`Trip ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
    });
    return () => { stopWatch(); releaseWake(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function acquireWake() {
    try {
      if ("wakeLock" in navigator) {
        wakeRef.current = await (navigator as Navigator & { wakeLock: { request: (t: "screen") => Promise<WakeLockSentinel> } }).wakeLock.request("screen");
        wakeRef.current.addEventListener?.("release", () => setWakeOn(false));
        setWakeOn(true);
      }
    } catch { setWakeOn(false); }
  }
  function releaseWake() {
    try { wakeRef.current?.release?.(); } catch {}
    wakeRef.current = null;
    setWakeOn(false);
  }
  function stopWatch() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }

  useEffect(() => {
    function onVis() {
      if (document.visibilityState === "visible" && phase === "tracking" && !wakeRef.current) acquireWake();
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [phase]);

  async function persistFix(pos: GeolocationPosition, force = false) {
    const now = Date.now();
    const dueMs = intervalRef.current * 60000;
    if (!force && now - lastPostedRef.current < dueMs) return;
    lastPostedRef.current = now;
    const c = pos.coords;
    const recorded_at = new Date(pos.timestamp || now).toISOString();
    const { error: insErr } = await supabase.from("track_points").insert({
      trip_id: tripIdRef.current,
      lat: c.latitude,
      lng: c.longitude,
      altitude_m: c.altitude ?? null,
      speed_kmh: c.speed != null ? c.speed * 3.6 : null,
      heading: c.heading ?? null,
      accuracy_m: c.accuracy ?? null,
      source: "phone",
      recorded_at,
    });
    if (!insErr) setPointCount((n) => n + 1);
  }

  async function startTracking() {
    setError(null);
    if (!("geolocation" in navigator)) { setError("This device has no location support."); return; }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { window.location.href = "/auth/login"; return; }

    const token = randomToken();
    const { data: trip, error: tErr } = await supabase.from("trips").insert({
      user_id: session.user.id,
      name: tripName.trim() || "Trip",
      status: "active",
      is_public: true,
      share_token: token,
      started_at: new Date().toISOString(),
    }).select("id, share_token").single();

    if (tErr || !trip) { setError(tErr?.message ?? "Could not start the trip."); return; }
    tripIdRef.current = trip.id;
    setShareToken(trip.share_token);
    setPointCount(0);
    lastPostedRef.current = 0;
    setPhase("tracking");
    acquireWake();

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setLastFix({ lat: pos.coords.latitude, lng: pos.coords.longitude, at: new Date().toISOString() });
        persistFix(pos, lastPostedRef.current === 0);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setError("Location permission was denied. Enable it in your browser settings to track.");
        else setError(err.message || "Could not get your location.");
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
    );
  }

  async function stopTracking() {
    stopWatch();
    releaseWake();
    if (tripIdRef.current) {
      await supabase.from("trips").update({ status: "completed", ended_at: new Date().toISOString() }).eq("id", tripIdRef.current);
    }
    setPhase("done");
  }

  if (authed === null) {
    return <div style={{ minHeight: "100vh", background: theme.canvas, color: theme.muted, display: "flex", alignItems: "center", justifyContent: "center", font: `14px ${font.sans}` }}>Loading…</div>;
  }

  return (
    <div style={{ minHeight: "100vh", background: theme.canvas, color: theme.body, font: `14px ${font.sans}`, display: "flex", flexDirection: "column" }}>
      <nav style={{ background: theme.surface, padding: "0 16px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, borderBottom: `1px solid ${theme.hairline}` }}>
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: theme.ink, fontWeight: 700, fontSize: text.md, letterSpacing: 1, textTransform: "uppercase", textDecoration: "none" }}><LogoMark size={20} />Waypoint</Link>
        <Link href="/dashboard" style={{ color: theme.muted, fontSize: text.sm, textDecoration: "none" }}>← Dashboard</Link>
      </nav>

      <div style={{ maxWidth: 460, width: "100%", margin: "0 auto", padding: "28px 16px", boxSizing: "border-box" }}>
        <p style={{ fontSize: text.xs, fontWeight: 700, letterSpacing: 1.5, color: theme.muted, textTransform: "uppercase", margin: "0 0 4px" }}>Track from this phone</p>
        <h1 style={{ fontSize: text.xxl, fontWeight: 700, color: theme.ink, margin: "0 0 20px" }}>Live tracking</h1>

        {error && (
          <div style={{ background: theme.dangerSurface, border: `1px solid ${theme.danger}`, color: "#FFC9C4", padding: "10px 12px", borderRadius: 6, fontSize: text.base, marginBottom: 16 }}>{error}</div>
        )}

        {phase === "idle" && (
          <div style={{ background: theme.surface, border: `1px solid ${theme.hairline}`, borderRadius: 8, padding: 20 }}>
            <label style={{ display: "block", fontSize: text.sm, color: theme.muted, marginBottom: 6 }}>Trip name</label>
            <input value={tripName} onChange={(e) => setTripName(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", background: theme.canvas, color: theme.ink, border: `1px solid ${theme.hairline}`, borderRadius: 4, padding: "10px 12px", fontSize: text.md, marginBottom: 18 }} />

            <label style={{ display: "block", fontSize: text.sm, color: theme.muted, marginBottom: 8 }}>Update every</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 22, flexWrap: "wrap" }}>
              {INTERVALS.map((m) => (
                <button key={m} onClick={() => setIntervalMin(m)}
                  style={{ flex: "1 1 auto", padding: "10px 0", borderRadius: 999, cursor: "pointer", fontWeight: 700, fontSize: text.base,
                    border: `1px solid ${intervalMin === m ? theme.accent : theme.hairline}`,
                    background: intervalMin === m ? theme.accent : "transparent",
                    color: intervalMin === m ? theme.accentInk : theme.body }}>
                  {m} min
                </button>
              ))}
            </div>

            <button onClick={startTracking}
              style={{ width: "100%", background: theme.track, color: theme.accentInk, border: "none", borderRadius: 6, padding: "14px 0", fontSize: text.md, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer" }}>
              ● Start tracking
            </button>
            <p style={{ fontSize: text.sm, color: theme.muted, lineHeight: 1.6, margin: "14px 0 0" }}>
              Keep this tab open and your screen on. Your location is shared on a live map you can send to family or friends. A shorter interval is more precise but uses more battery.
            </p>
          </div>
        )}

        {phase === "tracking" && (
          <div style={{ background: theme.surface, border: `1px solid ${theme.hairline}`, borderRadius: 8, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
              <span className="wp-pulse" style={{ width: 12, height: 12, borderRadius: "50%", background: theme.live, display: "inline-block" }} />
              <span style={{ fontSize: 16, fontWeight: 700, color: theme.ink }}>Tracking live</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
              <Stat label="Points logged" value={String(pointCount)} />
              <Stat label="Interval" value={`${intervalMin} min`} />
              <Stat label="Last fix" value={lastFix ? new Date(lastFix.at).toLocaleTimeString() : "waiting…"} />
              <Stat label="Screen lock" value={wakeOn ? "On" : "Off"} valueColor={wakeOn ? theme.live : theme.warn} />
            </div>

            {lastFix && (
              <div style={{ fontSize: text.sm, color: theme.muted, marginBottom: 18 }}>
                {lastFix.lat.toFixed(5)}, {lastFix.lng.toFixed(5)}
              </div>
            )}

            {shareToken && (
              <a href={`/share/${shareToken}`} target="_blank" rel="noopener noreferrer"
                style={{ display: "block", textAlign: "center", background: "transparent", color: theme.ink, border: `1px solid ${theme.hairline}`, borderRadius: 6, padding: "11px 0", fontSize: text.base, fontWeight: 700, textTransform: "uppercase", textDecoration: "none", marginBottom: 10 }}>
                View / share live map ↗
              </a>
            )}
            <button onClick={stopTracking}
              style={{ width: "100%", background: "transparent", color: theme.danger, border: `1px solid ${theme.danger}`, borderRadius: 6, padding: "12px 0", fontSize: text.base, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer" }}>
              Stop tracking
            </button>
            {!wakeOn && (
              <p style={{ fontSize: text.sm, color: theme.warn, lineHeight: 1.6, margin: "12px 0 0" }}>
                Your device wouldn&apos;t keep the screen awake. Set your screen timeout to a few minutes so tracking isn&apos;t interrupted.
              </p>
            )}
          </div>
        )}

        {phase === "done" && (
          <div style={{ background: theme.surface, border: `1px solid ${theme.hairline}`, borderRadius: 8, padding: 20, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🏁</div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: theme.ink, margin: "0 0 6px" }}>Trip saved</h2>
            <p style={{ fontSize: text.base, color: theme.muted, margin: "0 0 18px" }}>{pointCount} point{pointCount !== 1 ? "s" : ""} logged.</p>
            <Link href="/dashboard" style={{ display: "inline-block", background: theme.track, color: theme.accentInk, borderRadius: 6, padding: "11px 20px", fontSize: text.base, fontWeight: 700, textTransform: "uppercase", textDecoration: "none" }}>
              Back to dashboard
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ background: theme.canvas, border: `1px solid ${theme.hairline}`, borderRadius: 6, padding: "10px 12px" }}>
      <div style={{ fontSize: text.xxs, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: theme.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: valueColor ?? theme.ink }}>{value}</div>
    </div>
  );
}
