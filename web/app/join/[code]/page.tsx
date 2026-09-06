"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { authFetch } from "@/lib/authFetch";
import { theme, text } from "../../../lib/theme";

/**
 * Public event registration — the link an organizer shares with a rider who
 * isn't on Waypoint yet. Signed-out visitors are sent to sign up / log in
 * (returning here); signed-in riders fill their details + ICE (with explicit
 * consent) and join in one step.
 */

interface EventInfo { id: string; name: string; status: string; rider_classes: string[] }

export default function RegisterPage() {
  const supabase = getSupabaseClient();
  const { code } = useParams<{ code: string }>();
  const joinCode = (code || "").toUpperCase();

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [riderNumber, setRiderNumber] = useState("");
  const [riderClass, setRiderClass] = useState("");
  const [iceName, setIceName] = useState("");
  const [icePhone, setIcePhone] = useState("");
  const [bloodType, setBloodType] = useState("");
  const [allergies, setAllergies] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextUrl = `/join/${joinCode}`;

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setAuthed(false); return; }
      setAuthed(true);
      setDisplayName(session.user.user_metadata?.full_name || session.user.email?.split("@")[0] || "");
      const res = await authFetch(`/api/events/join?code=${encodeURIComponent(joinCode)}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setLoadErr(d.error ?? "This event could not be found. Check the link and try again.");
        return;
      }
      const d: EventInfo = await res.json();
      setEvent(d);
      if (d.rider_classes?.length === 1) setRiderClass(d.rider_classes[0]);
    })();
  }, [supabase, joinCode]);

  const hasMedical = useMemo(
    () => !!(iceName.trim() || icePhone.trim() || bloodType.trim() || allergies.trim()),
    [iceName, icePhone, bloodType, allergies]
  );

  async function submit() {
    if (hasMedical && !consent) { setError("Please check the consent box to share your emergency info, or clear those fields."); return; }
    setBusy(true); setError(null);
    try {
      const res = await authFetch("/api/events/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: joinCode,
          display_name: displayName.trim() || undefined,
          rider_number: riderNumber.trim() || undefined,
          rider_class: riderClass.trim() || undefined,
          ice_name: iceName.trim() || undefined,
          ice_phone: icePhone.trim() || undefined,
          blood_type: bloodType.trim() || undefined,
          allergies: allergies.trim() || undefined,
          ice_consent: consent && hasMedical,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? "Could not register. Please try again."); return; }
      if (d.requires_payment && d.url) { window.location.href = d.url; return; }
      setDone(true);
    } finally { setBusy(false); }
  }

  const wrap: React.CSSProperties = { minHeight: "100vh", background: "#0A0A0A", color: "#fff", display: "flex", flexDirection: "column" };
  const card: React.CSSProperties = { background: theme.surface, border: `1px solid ${theme.hairline}`, borderRadius: 8, padding: 22 };
  const label: React.CSSProperties = { display: "block", fontSize: text.xs, fontWeight: 700, letterSpacing: 1, color: "#7E93A0", textTransform: "uppercase", marginBottom: 6 };
  const input: React.CSSProperties = { width: "100%", padding: "10px 12px", background: "#0A0A0A", color: "#fff", border: `1px solid ${theme.hairline}`, fontSize: text.md, outline: "none", boxSizing: "border-box" };

  const Header = (
    <nav style={{ background: theme.surface, padding: "0 20px", height: 56, display: "flex", alignItems: "center" }}>
      <Link href="/" style={{ color: "#fff", fontWeight: 700, fontSize: text.lg, letterSpacing: 1, textTransform: "uppercase", textDecoration: "none" }}>Waypoint</Link>
    </nav>
  );

  // ── Signed out → send them to sign up / log in and return here ──
  if (authed === false) {
    return (
      <div style={wrap}>
        {Header}
        <div style={{ maxWidth: 440, margin: "40px auto", padding: "0 20px", width: "100%" }}>
          <div style={card}>
            <p style={{ fontSize: text.xs, fontWeight: 700, letterSpacing: 1.5, color: "#7E93A0", textTransform: "uppercase", margin: "0 0 8px" }}>Event registration</p>
            <h1 style={{ fontSize: text.xxl, fontWeight: 800, margin: "0 0 10px" }}>Register to ride</h1>
            <p style={{ color: "#7E93A0", fontSize: text.base, lineHeight: 1.6, margin: "0 0 20px" }}>
              Create a free Waypoint account (or log in) to register for this event. You&rsquo;ll get your own live
              tracking, an emergency info card, and one-tap join for future rides. Join code: <strong style={{ color: "#fff" }}>{joinCode}</strong>
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href={`/auth/signup?next=${encodeURIComponent(nextUrl)}`} style={{ background: theme.accent, color: theme.accentInk, padding: "11px 20px", fontSize: text.xs, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", textDecoration: "none" }}>Create account</Link>
              <Link href={`/auth/login?next=${encodeURIComponent(nextUrl)}`} style={{ background: "transparent", color: "#C8D4DC", border: `1px solid ${theme.hairline}`, padding: "11px 20px", fontSize: text.xs, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", textDecoration: "none" }}>Log in</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (authed === null) {
    return <div style={wrap}>{Header}<p style={{ color: "#7E93A0", padding: 40, textAlign: "center" }}>Loading…</p></div>;
  }

  if (loadErr) {
    return <div style={wrap}>{Header}<div style={{ maxWidth: 440, margin: "40px auto", padding: "0 20px", width: "100%" }}><div style={card}><p style={{ color: theme.danger, margin: 0 }}>{loadErr}</p></div></div></div>;
  }

  if (done) {
    return (
      <div style={wrap}>
        {Header}
        <div style={{ maxWidth: 440, margin: "40px auto", padding: "0 20px", width: "100%" }}>
          <div style={card}>
            <h1 style={{ fontSize: text.xxl, fontWeight: 800, margin: "0 0 10px", color: theme.accent }}>You&rsquo;re registered ✓</h1>
            <p style={{ color: "#7E93A0", fontSize: text.base, lineHeight: 1.6, margin: "0 0 20px" }}>
              You&rsquo;re on the roster for <strong style={{ color: "#fff" }}>{event?.name}</strong>. Set up your tracking device or phone from your dashboard.
            </p>
            <Link href="/dashboard" style={{ background: theme.accent, color: theme.accentInk, padding: "11px 20px", fontSize: text.xs, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", textDecoration: "none" }}>Go to dashboard</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      {Header}
      <div style={{ maxWidth: 480, margin: "32px auto", padding: "0 20px", width: "100%", display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <p style={{ fontSize: text.xs, fontWeight: 700, letterSpacing: 1.5, color: "#7E93A0", textTransform: "uppercase", margin: "0 0 6px" }}>Register for</p>
          <h1 style={{ fontSize: text.xxl, fontWeight: 800, margin: 0 }}>{event?.name ?? "Event"}</h1>
        </div>

        {error && <div style={{ color: theme.danger, fontSize: text.base }}>{error}</div>}

        <div style={card}>
          <div style={{ marginBottom: 16 }}>
            <label style={label}>Your name</label>
            <input style={input} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 120px" }}>
              <label style={label}>Rider number</label>
              <input style={input} value={riderNumber} onChange={(e) => setRiderNumber(e.target.value)} placeholder="e.g. 42" />
            </div>
            <div style={{ flex: "1 1 160px" }}>
              <label style={label}>Class</label>
              {event?.rider_classes?.length ? (
                <select style={input} value={riderClass} onChange={(e) => setRiderClass(e.target.value)}>
                  <option value="">Select…</option>
                  {event.rider_classes.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              ) : (
                <input style={input} value={riderClass} onChange={(e) => setRiderClass(e.target.value)} placeholder="Optional" />
              )}
            </div>
          </div>
          <p style={{ fontSize: text.xs, color: "#7E93A0", margin: "0 0 4px" }}>The organizer can correct your number or class later if needed.</p>
        </div>

        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: text.md, marginBottom: 4 }}>Emergency info (optional)</div>
          <p style={{ color: "#7E93A0", fontSize: text.sm, margin: "0 0 16px", lineHeight: 1.5 }}>
            Shared only with the event organizer and emergency responders — never shown on the public map.
          </p>
          <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 160px" }}><label style={label}>Emergency contact</label><input style={input} value={iceName} onChange={(e) => setIceName(e.target.value)} placeholder="Name" /></div>
            <div style={{ flex: "1 1 140px" }}><label style={label}>Contact phone</label><input style={input} value={icePhone} onChange={(e) => setIcePhone(e.target.value)} placeholder="Phone" /></div>
          </div>
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 100px" }}><label style={label}>Blood type</label><input style={input} value={bloodType} onChange={(e) => setBloodType(e.target.value)} placeholder="e.g. O+" /></div>
            <div style={{ flex: "1 1 200px" }}><label style={label}>Allergies</label><input style={input} value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="e.g. penicillin" /></div>
          </div>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: text.base, color: "#C8D4DC", cursor: "pointer" }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3 }} />
            <span>I consent to sharing this emergency and medical information with the event organizer and emergency responders for the purpose of this event.</span>
          </label>
        </div>

        <button onClick={submit} disabled={busy}
          style={{ background: theme.accent, color: theme.accentInk, border: "none", padding: "13px 22px", fontSize: text.md, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}>
          {busy ? "Registering…" : "Register"}
        </button>
        <p style={{ fontSize: text.sm, color: "#7E93A0", lineHeight: 1.6, margin: 0, textAlign: "center" }}>
          By registering, you agree to Waypoint&rsquo;s{" "}
          <Link href="/terms" style={{ color: "#C8D4DC", textDecoration: "underline" }}>Terms of Service</Link>{" "}
          and{" "}
          <Link href="/privacy" style={{ color: "#C8D4DC", textDecoration: "underline" }}>Privacy Policy</Link>. This tracking tool is for recreation and is not a replacement for a dedicated emergency locator beacon.
        </p>
        <div style={{ height: 20 }} />
      </div>
    </div>
  );
}
