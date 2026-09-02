"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, use } from "react";

interface ICE {
  name: string | null;
  waypoint_id: string | null;
  blood_type: string | null;
  date_of_birth: string | null;
  phone: string | null;
  country: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
}

const C = {
  canvas: "#0A0A0A",
  surface: "#0C1E29",
  hairline: "#1E3B4C",
  accent: "#FFFE15",
  ink: "#FFFFFF",
  body: "#C8D4DC",
  muted: "#7E93A0",
  danger: "#FF3B30",
  dangerSurface: "#2A1214",
  lime: "#CCFF00",
};

function ageFrom(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  const n = new Date();
  let a = n.getFullYear() - d.getFullYear();
  const m = n.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && n.getDate() < d.getDate())) a--;
  return a >= 0 && a < 130 ? a : null;
}

function telHref(p: string | null): string | null {
  if (!p) return null;
  const cleaned = p.replace(/[^\d+]/g, "");
  return cleaned ? `tel:${cleaned}` : null;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, padding: "12px 0", borderBottom: `1px solid ${C.hairline}` }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: C.muted, textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontSize: 16, color: C.ink, textAlign: "right", fontWeight: 600 }}>{children}</span>
    </div>
  );
}

export default function ICEPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<ICE | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");

  useEffect(() => {
    fetch(`/api/ice/${token}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: ICE) => { setData(d); setState("ok"); })
      .catch(() => setState("missing"));
  }, [token]);

  const wrap: React.CSSProperties = {
    minHeight: "100vh",
    background: C.canvas,
    color: C.body,
    fontFamily: "system-ui, -apple-system, sans-serif",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "0 16px 40px",
  };
  const card: React.CSSProperties = {
    width: "100%",
    maxWidth: 460,
    marginTop: 20,
  };

  if (state === "loading") {
    return <div style={{ ...wrap, justifyContent: "center" }}><p style={{ color: C.muted }}>Loading…</p></div>;
  }
  if (state === "missing" || !data) {
    return (
      <div style={{ ...wrap, justifyContent: "center", textAlign: "center" }}>
        <div style={{ maxWidth: 380 }}>
          <p style={{ color: C.accent, fontWeight: 800, letterSpacing: 2, fontSize: 13, textTransform: "uppercase", margin: "0 0 12px" }}>Waypoint</p>
          <h1 style={{ color: C.ink, fontSize: 20, margin: "0 0 8px" }}>Card not found</h1>
          <p style={{ color: C.muted, fontSize: 14 }}>This emergency card link is invalid or has been revoked.</p>
        </div>
      </div>
    );
  }

  const age = ageFrom(data.date_of_birth);
  const ecTel = telHref(data.emergency_contact_phone);
  const selfTel = telHref(data.phone);
  const hasEC = data.emergency_contact_name || data.emergency_contact_phone;

  return (
    <div style={wrap}>
      <div style={card}>
        {/* Brand */}
        <div style={{ textAlign: "center", padding: "8px 0 16px" }}>
          <span style={{ color: C.accent, fontWeight: 800, letterSpacing: 3, fontSize: 15, textTransform: "uppercase" }}>Waypoint</span>
        </div>

        {/* Emergency banner */}
        <div style={{ background: C.dangerSurface, border: `1px solid ${C.danger}`, borderRadius: 8, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 22 }}>⚠️</span>
          <span style={{ color: C.danger, fontWeight: 800, letterSpacing: 1.5, fontSize: 14, textTransform: "uppercase" }}>In Case of Emergency</span>
        </div>

        {/* Identity */}
        <div style={{ background: C.surface, border: `1px solid ${C.hairline}`, borderRadius: 10, padding: 20, marginBottom: 14 }}>
          <h1 style={{ color: C.ink, fontSize: 26, fontWeight: 800, margin: "0 0 4px" }}>{data.name || "Waypoint Rider"}</h1>
          {data.waypoint_id && (
            <p style={{ margin: 0, fontSize: 13, color: C.muted }}>
              Waypoint ID{" "}
              <code style={{ color: C.lime, fontWeight: 700, letterSpacing: 2, fontFamily: "ui-monospace, monospace", fontSize: 15 }}>{data.waypoint_id}</code>
            </p>
          )}

          {/* Blood type — most safety-critical, made prominent */}
          {data.blood_type && (
            <div style={{ marginTop: 16, background: C.dangerSurface, border: `1px solid ${C.danger}`, borderRadius: 8, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: C.danger, textTransform: "uppercase" }}>Blood Type</span>
              <span style={{ fontSize: 28, fontWeight: 800, color: C.ink }}>{data.blood_type}</span>
            </div>
          )}

          <div style={{ marginTop: 8 }}>
            {age !== null && <Row label="Age">{age}</Row>}
            {data.country && <Row label="Country">{data.country}</Row>}
            {selfTel ? (
              <Row label="Phone"><a href={selfTel} style={{ color: C.accent, textDecoration: "none" }}>{data.phone}</a></Row>
            ) : data.phone ? <Row label="Phone">{data.phone}</Row> : null}
          </div>
        </div>

        {/* Emergency contact */}
        {hasEC && (
          <div style={{ background: C.surface, border: `1px solid ${C.hairline}`, borderRadius: 10, padding: 20 }}>
            <p style={{ margin: "0 0 12px", fontSize: 11, fontWeight: 700, letterSpacing: 1, color: C.danger, textTransform: "uppercase" }}>Emergency Contact</p>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.ink }}>
              {data.emergency_contact_name || "Contact"}
              {data.emergency_contact_relation && <span style={{ fontSize: 14, fontWeight: 400, color: C.muted }}> · {data.emergency_contact_relation}</span>}
            </p>
            {ecTel && (
              <a href={ecTel} style={{ display: "block", marginTop: 14, background: C.danger, color: "#fff", textAlign: "center", padding: "14px", borderRadius: 8, fontSize: 16, fontWeight: 800, textDecoration: "none", letterSpacing: 0.5 }}>
                📞 Call {data.emergency_contact_name || "contact"}
              </a>
            )}
            {!ecTel && data.emergency_contact_phone && (
              <p style={{ marginTop: 10, fontSize: 16, color: C.ink }}>{data.emergency_contact_phone}</p>
            )}
          </div>
        )}

        <p style={{ textAlign: "center", color: C.muted, fontSize: 11, marginTop: 24, lineHeight: 1.6 }}>
          Shared by the rider via Waypoint · chasingwaypoints.com<br />
          A division of RallyTrak
        </p>
      </div>
    </div>
  );
}
