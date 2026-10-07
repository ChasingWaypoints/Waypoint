"use client";

/**
 * /radio — join an event's radio with a code. For marshals, sweep, medics and
 * race control on any phone browser, no app or account needed.
 *
 *   1. Enter the code the organizer gave out (or scan the QR: /radio?code=XXXXXX)
 *   2. Enter your name — it shows to everyone when you talk
 *   3. Hold to talk
 *
 * The personal radio token is remembered on this device so a reload or a
 * dropped connection doesn't mean signing up again. Riders don't use this page:
 * joining the event in the Waypoint app already puts them on the radio.
 */

import { useCallback, useEffect, useState } from "react";
import CommsPanel from "../../components/CommsPanel";
import { theme, font, text } from "../../lib/theme";

type Saved = { token: string; event_name: string; label: string; role: "staff" | "control" };
const KEY = "waypoint-radio";

function readSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}
function writeSaved(v: Saved | null) {
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v));
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode: they'll just sign in again next time.
  }
}

const ERRORS: Record<string, string> = {
  unknown_code: "That code doesn't match an event. Check it with the organizer.",
  bad_code: "Codes are 6 letters and numbers.",
  bad_name: "Enter your name (2–40 characters).",
  comms_disabled: "Radio isn't turned on for this event.",
  event_closed: "This event has ended.",
  event_full: "This event's radio is full. Ask the organizer.",
};

export default function RadioPage() {
  const [saved, setSaved] = useState<Saved | null>(null);
  const [ready, setReady] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    const s = readSaved();
    const fromUrl = new URLSearchParams(window.location.search).get("code") ?? "";
    // Restoring device-local state on mount; there is no server value to sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(s);
    setCode(fromUrl.toUpperCase());
    setReady(true);
  }, []);

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/comms/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, name }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(ERRORS[d.error] ?? "Could not join. Try again.");
        return;
      }
      const s: Saved = { token: d.token, event_name: d.event_name, label: d.label, role: d.role };
      writeSaved(s);
      setEnded(false);
      setSaved(s);
    } catch {
      setError("No connection. Try again when you have signal.");
    } finally {
      setBusy(false);
    }
  };

  const leave = () => {
    writeSaved(null);
    setSaved(null);
    setEnded(false);
  };

  const onUnavailable = useCallback(() => setEnded(true), []);

  if (!ready) return <Shell />;

  return (
    <Shell>
      {saved && !ended ? (
        <>
          <div style={{ marginBottom: 14 }}>
            <div style={{ font: `700 ${text.xl}px ${font.sans}`, color: theme.ink }}>{saved.event_name}</div>
            <div style={{ fontSize: text.sm, color: theme.muted, marginTop: 2 }}>
              You: <b style={{ color: theme.body }}>{saved.label}</b> · {saved.role === "control" ? "Race control" : "Staff"}
            </div>
          </div>
          <CommsPanel token={saved.token} layout="page" onUnavailable={onUnavailable} />
          <button onClick={leave} style={linkBtn}>Sign out of this radio</button>
        </>
      ) : (
        <>
          <div style={{ font: `700 ${text.xxl}px ${font.sans}`, color: theme.ink, marginBottom: 6 }}>Join event radio</div>
          <p style={{ fontSize: text.base, color: theme.muted, margin: "0 0 20px", lineHeight: 1.5 }}>
            {ended
              ? "Your radio access for that event has ended or was removed. Enter a code to join again."
              : "For marshals, sweep, medics and race control. Riders: use the Waypoint app — you're on the radio when you join the event."}
          </p>
          <label style={label}>Code</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={9}
            style={{ ...input, letterSpacing: 4, font: `700 ${text.xl}px ${font.mono}` }}
          />
          <label style={label}>Your name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="First Last"
            autoComplete="name"
            maxLength={40}
            onKeyDown={(e) => { if (e.key === "Enter") join(); }}
            style={input}
          />
          <button
            onClick={join}
            disabled={busy || code.replace(/[^A-Za-z0-9]/g, "").length !== 6 || name.trim().length < 2}
            style={{
              width: "100%", marginTop: 8, background: "#CCFF00", color: theme.accentInk, border: "none",
              borderRadius: 8, padding: "14px", font: `800 ${text.md}px ${font.sans}`, cursor: "pointer",
              opacity: busy || code.replace(/[^A-Za-z0-9]/g, "").length !== 6 || name.trim().length < 2 ? 0.5 : 1,
            }}
          >
            {busy ? "Joining…" : "Join radio"}
          </button>
          {error && <div style={{ marginTop: 12, fontSize: text.sm, color: theme.danger }}>{error}</div>}
        </>
      )}
    </Shell>
  );
}

function Shell({ children }: { children?: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100dvh", background: theme.canvas, color: theme.body, font: `${text.base}px ${font.sans}`, padding: "28px 16px calc(28px + env(safe-area-inset-bottom))" }}>
      <div style={{ maxWidth: 440, margin: "0 auto" }}>
        <div style={{ font: `800 ${text.xs}px ${font.sans}`, letterSpacing: 2, color: theme.accent, marginBottom: 18 }}>WAYPOINT · RADIO</div>
        {children}
      </div>
    </div>
  );
}

const label: React.CSSProperties = { display: "block", fontSize: text.xs, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: theme.muted, margin: "0 0 6px" };
const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", background: "#0A0A0A", color: theme.ink, border: `1px solid ${theme.hairline}`, borderRadius: 6, padding: "12px", fontSize: text.md, marginBottom: 14, outline: "none" };
const linkBtn: React.CSSProperties = { marginTop: 18, background: "none", border: "none", color: theme.muted, fontSize: text.xs, cursor: "pointer", padding: 0 };
