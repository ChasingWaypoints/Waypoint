"use client";

/**
 * Radio settings in the event's Admin tab.
 *
 * Two codes instead of 50 links:
 *   Staff code   — say it at the riders' meeting or put the QR on a poster.
 *   Control code — race control only; hidden until revealed.
 * Each person who joins appears below with their name; remove one person
 * without changing the code for everyone. Riders need no code: joining the
 * event in the app puts them on the radio.
 */

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { text } from "../lib/theme";

type Member = { id: string; name: string; role: "staff" | "control"; joined_at: string; revoked: boolean };
type Comms = {
  enabled: boolean;
  staff_code: string | null;
  control_code: string | null;
  can_toggle: boolean;
  members: Member[];
};

const card: React.CSSProperties = { background: "#0C1E29", border: "1px solid #1E3B4C" };
const muted = "#7E93A0";

function SmallBtn({ onClick, children, tone = "#FFFE15", disabled }: { onClick: () => void; children: React.ReactNode; tone?: string; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: "transparent", color: tone, border: `1px solid ${tone}`, padding: "6px 12px",
        fontSize: text.xs, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase",
        cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

export default function CommsAdmin({ eventId, accessToken }: { eventId: string; accessToken: string }) {
  const [comms, setComms] = useState<Comms | null>(null);
  const [hidden, setHidden] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [showControl, setShowControl] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Only rendered client-side (inside the signed-in Admin tab), so window exists.
  const [origin] = useState(() => (typeof window === "undefined" ? "" : window.location.origin));

  const api = useCallback(
    (init?: RequestInit) =>
      fetch(`/api/events/${eventId}/comms`, {
        ...init,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      }),
    [eventId, accessToken]
  );

  const load = useCallback(async () => {
    const res = await api();
    if (res.status === 403 || res.status === 401) { setHidden(true); return; }
    if (res.ok) setComms(await res.json());
  }, [api]);

  useEffect(() => {
    let alive = true;
    api().then(async (res) => {
      if (!alive) return;
      if (res.status === 403 || res.status === 401) { setHidden(true); return; }
      if (res.ok) setComms(await res.json());
    });
    return () => { alive = false; };
  }, [api]);

  const joinUrl = comms?.staff_code && origin ? `${origin}/radio?code=${comms.staff_code}` : null;

  useEffect(() => {
    if (!joinUrl) return;
    let alive = true;
    QRCode.toDataURL(joinUrl, { margin: 1, width: 360, color: { dark: "#0C1E29", light: "#FFFFFF" } })
      .then((url) => { if (alive) setQr(url); })
      .catch(() => {});
    return () => { alive = false; };
  }, [joinUrl]);

  const post = async (body: object) => {
    setBusy(true);
    try {
      await api({ method: "POST", body: JSON.stringify(body) });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const copy = (value: string, key: string) => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  const printPoster = () => {
    if (!qr || !comms?.staff_code) return;
    const w = window.open("", "_blank", "width=600,height=800");
    if (!w) return;
    w.document.write(`<!doctype html><title>Radio</title>
      <body style="font-family:system-ui,sans-serif;text-align:center;padding:40px">
      <h1 style="margin:0 0 8px">Event radio</h1>
      <p style="font-size:20px;margin:0 0 24px">Marshals, sweep &amp; medics: scan to join</p>
      <img src="${qr}" style="width:360px;height:360px" />
      <p style="font-size:18px;margin:24px 0 4px">or go to <b>${origin.replace(/^https?:\/\//, "")}/radio</b></p>
      <p style="font-size:44px;letter-spacing:10px;font-weight:800;margin:0">${comms.staff_code}</p>
      <script>window.onload=()=>window.print()</script></body>`);
    w.document.close();
  };

  if (hidden || !comms) return null;

  if (!comms.enabled) {
    if (!comms.can_toggle) return null;
    return (
      <div>
        <p style={labelStyle}>Radio</p>
        <div style={{ ...card, padding: 20, display: "flex", alignItems: "center", gap: 12 }}>
          <p style={{ flex: 1, margin: 0, fontSize: text.sm, color: muted, lineHeight: 1.6 }}>
            Live push-to-talk for race control, staff and riders. Off for this event.
          </p>
          <SmallBtn onClick={() => post({ action: "toggle", enabled: true })} disabled={busy} tone="#CCFF00">
            Turn on radio
          </SmallBtn>
        </div>
      </div>
    );
  }

  const active = comms.members.filter((m) => !m.revoked);

  return (
    <div>
      <p style={labelStyle}>Radio</p>
      <div style={card}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #1E3B4C" }}>
          <p style={{ fontSize: text.sm, color: muted, margin: 0, lineHeight: 1.6 }}>
            Riders are on the radio automatically when they join the event in the app.
            Staff join at <b style={{ color: "#fff" }}>{origin.replace(/^https?:\/\//, "")}/radio</b> with the staff code;
            race control uses the control code. Everyone shows by name when they talk.
          </p>
        </div>

        {/* Staff code */}
        <div style={{ padding: 20, borderBottom: "1px solid #1E3B4C", display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- local data: URL QR */}
          {qr && <img src={qr} alt="QR code to join the radio as staff" width={132} height={132} style={{ background: "#fff", padding: 6 }} />}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: text.xxs, fontWeight: 700, letterSpacing: 1.5, color: muted, textTransform: "uppercase" }}>Staff code</div>
            <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: 6, color: "#FFFE15", fontFamily: "monospace", margin: "4px 0 12px" }}>
              {comms.staff_code}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {joinUrl && <SmallBtn onClick={() => copy(joinUrl, "link")}>{copied === "link" ? "Copied!" : "Copy join link"}</SmallBtn>}
              <SmallBtn onClick={printPoster}>Print poster</SmallBtn>
              <SmallBtn
                tone={muted}
                disabled={busy}
                onClick={() => {
                  if (confirm("Make a new staff code? The old one stops working for new sign-ups; people already on the radio stay on.")) {
                    post({ action: "regenerate", kind: "staff" });
                  }
                }}
              >
                New code
              </SmallBtn>
            </div>
          </div>
        </div>

        {/* Control code */}
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #1E3B4C", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: text.xxs, fontWeight: 700, letterSpacing: 1.5, color: muted, textTransform: "uppercase" }}>Race control code</div>
            <div style={{ fontSize: text.xl, fontWeight: 800, letterSpacing: 4, color: "#FF3B30", fontFamily: "monospace", marginTop: 2 }}>
              {showControl ? comms.control_code : "••••••"}
            </div>
            <div style={{ fontSize: text.xs, color: muted, marginTop: 2 }}>Can all-call and cut in on every channel. Core team only.</div>
          </div>
          <SmallBtn tone={muted} onClick={() => setShowControl((s) => !s)}>{showControl ? "Hide" : "Show"}</SmallBtn>
          {showControl && comms.control_code && (
            <SmallBtn tone={muted} onClick={() => copy(comms.control_code!, "control")}>{copied === "control" ? "Copied!" : "Copy"}</SmallBtn>
          )}
          <SmallBtn
            tone={muted}
            disabled={busy}
            onClick={() => {
              if (confirm("Make a new race control code? The old one stops working for new sign-ups.")) {
                post({ action: "regenerate", kind: "control" });
              }
            }}
          >
            New code
          </SmallBtn>
        </div>

        {/* Members */}
        <div style={{ padding: "12px 20px" }}>
          <div style={{ fontSize: text.xxs, fontWeight: 700, letterSpacing: 1.5, color: muted, textTransform: "uppercase", marginBottom: 8 }}>
            On the radio by code · {active.length}
          </div>
          {active.length === 0 && <div style={{ fontSize: text.sm, color: muted }}>Nobody has joined with a code yet.</div>}
          {active.map((m) => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: "1px solid #152D3B" }}>
              <span style={{ flex: 1, color: "#fff", fontSize: text.md, fontWeight: 600 }}>{m.name}</span>
              <span style={{ fontSize: text.xxs, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: m.role === "control" ? "#FF3B30" : "#CCFF00" }}>
                {m.role === "control" ? "Race control" : "Staff"}
              </span>
              <SmallBtn
                tone="#FF3B30"
                disabled={busy}
                onClick={() => {
                  if (confirm(`Remove ${m.name} from the radio? They're disconnected now and can't rejoin with this device.`)) {
                    post({ action: "revoke", member_id: m.id });
                  }
                }}
              >
                Remove
              </SmallBtn>
            </div>
          ))}
        </div>

        {comms.can_toggle && (
          <div style={{ padding: "10px 20px", borderTop: "1px solid #1E3B4C" }}>
            <button
              onClick={() => { if (confirm("Turn the radio off for this event?")) post({ action: "toggle", enabled: false }); }}
              style={{ background: "none", border: "none", color: muted, fontSize: text.xs, cursor: "pointer", padding: 0 }}
            >
              Turn radio off
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: text.xxs, fontWeight: 700, letterSpacing: 1.5, color: "#7E93A0", textTransform: "uppercase", margin: "0 0 10px",
};
