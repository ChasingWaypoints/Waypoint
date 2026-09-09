"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";

const supabase = getSupabaseClient();
const WEB_BASE = "https://app.chasingwaypoints.com";

const EXPIRY_OPTIONS = [
  { label: "Never",   hours: null },
  { label: "24 h",   hours: 24 },
  { label: "7 days", hours: 24 * 7 },
  { label: "30 days", hours: 24 * 30 },
] as const;

interface TripDetail {
  id: string;
  name: string;
  description: string | null;
  status: string;
  is_public: boolean;
  share_token: string | null;
  share_expires_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  device_id: string | null;
}

function duration(trip: TripDetail): string {
  if (!trip.started_at) return "—";
  const end  = trip.ended_at ? new Date(trip.ended_at) : new Date();
  const mins = Math.round((end.getTime() - new Date(trip.started_at).getTime()) / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${h}h ${m}m`;
}

export default function TripEditPage() {
  const { id }    = useParams<{ id: string }>();
  const router    = useRouter();

  const [trip, setTrip]               = useState<TripDetail | null>(null);
  const [pointCount, setPointCount]   = useState(0);
  const [name, setName]               = useState("");
  const [description, setDesc]        = useState("");
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [saveMsg, setSaveMsg]         = useState("");
  const [ending, setEnding]           = useState(false);

  // Sharing
  const [isPublic, setIsPublic]         = useState(false);
  const [shareToken, setShareToken]     = useState<string | null>(null);
  const [expiryHours, setExpiryHours]   = useState<number | null>(null);
  const [enablingShare, setEnablingShare] = useState(false);
  const [copied, setCopied]             = useState(false);

  useEffect(() => { load(); }, [id]);

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push("/auth/login"); return; }

    const [tripRes, countRes] = await Promise.all([
      supabase
        .from("trips")
        .select("id, name, description, status, is_public, share_token, share_expires_at, started_at, ended_at, created_at, device_id")
        .eq("id", id)
        .eq("user_id", session.user.id)
        .single(),
      supabase
        .from("track_points")
        .select("*", { count: "exact", head: true })
        .eq("trip_id", id),
    ]);

    if (!tripRes.data) { router.push("/dashboard"); return; }
    setTrip(tripRes.data);
    setName(tripRes.data.name);
    setDesc(tripRes.data.description ?? "");
    setIsPublic(tripRes.data.is_public);
    setShareToken(tripRes.data.share_token);
    setPointCount(countRes.count ?? 0);
    setLoading(false);
  }

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    await fetch(`/api/trips/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: name.trim(), description: description.trim() || null }),
    });
    setSaveMsg("Saved");
    setTimeout(() => setSaveMsg(""), 2000);
    setSaving(false);
  }

  async function endTrip() {
    if (!confirm("Mark this trip as completed?")) return;
    setEnding(true);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    await fetch(`/api/trips/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: "completed" }),
    });
    setTrip((t) => t ? { ...t, status: "completed", ended_at: new Date().toISOString() } : t);
    setEnding(false);
  }

  async function enableSharing() {
    setEnablingShare(true);
    const { nanoid } = await import("nanoid");
    const token   = shareToken ?? nanoid(12);
    const expires = expiryHours ? new Date(Date.now() + expiryHours * 3600_000).toISOString() : null;
    await supabase.from("trips").update({ is_public: true, share_token: token, share_expires_at: expires }).eq("id", id);
    setShareToken(token);
    setIsPublic(true);
    setEnablingShare(false);
  }

  async function disableSharing() {
    await supabase.from("trips").update({ is_public: false }).eq("id", id);
    setIsPublic(false);
  }

  function copyLink(url: string) {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const shareUrl = shareToken ? `${WEB_BASE}/share/${shareToken}` : null;
  const kmlUrl   = shareToken ? `${WEB_BASE}/api/trips/${id}/track.kml?token=${shareToken}` : null;
  const gpxUrl   = shareToken ? `${WEB_BASE}/api/trips/${id}/track.gpx?token=${shareToken}` : null;

  const S = {
    page:     { minHeight: "100vh", background: "#f7f7f7", fontFamily: "system-ui, sans-serif" } as React.CSSProperties,
    nav:      { background: "#3E5F44", padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 } as React.CSSProperties,
    body:     { maxWidth: 720, margin: "0 auto", padding: "40px 24px", width: "100%" } as React.CSSProperties,
    card:     { background: "#fff", border: "1px solid #e6e6e6", marginBottom: 24 } as React.CSSProperties,
    cardHead: { borderBottom: "1px solid #e6e6e6", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" } as React.CSSProperties,
    label:    { fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "#9a9a9a", textTransform: "uppercase" as const, marginBottom: 6, display: "block" },
    input:    { width: "100%", border: "1px solid #e6e6e6", padding: "10px 14px", fontSize: 14, color: "#1a2118", outline: "none", boxSizing: "border-box" as const },
    textarea: { width: "100%", border: "1px solid #e6e6e6", padding: "10px 14px", fontSize: 14, color: "#1a2118", outline: "none", resize: "vertical" as const, minHeight: 80, boxSizing: "border-box" as const, fontFamily: "system-ui, sans-serif" },
    btnPrimary: { background: "#3E5F44", color: "#fff", border: "none", padding: "10px 22px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" as const, cursor: "pointer" },
    btnYellow:  { background: "#FAA634", color: "#fff", border: "none", padding: "10px 22px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" as const, cursor: "pointer" },
    btnGhost:   { background: "transparent", color: "#3E5F44", border: "1px solid #e6e6e6", padding: "10px 22px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" as const, cursor: "pointer" },
    btnDanger:  { background: "transparent", color: "#dc2626", border: "1px solid #fecaca", padding: "10px 22px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" as const, cursor: "pointer" },
  };

  if (loading) return (
    <div style={S.page}>
      <nav style={S.nav}>
        <Link href="/dashboard" style={{ color: "#fff", fontWeight: 700, fontSize: 15, letterSpacing: 1, textTransform: "uppercase", textDecoration: "none" }}>← Dashboard</Link>
      </nav>
      <div style={{ ...S.body, textAlign: "center", paddingTop: 80, color: "#9a9a9a" }}>Loading…</div>
    </div>
  );
  if (!trip) return null;

  const isActive = trip.status === "active";

  return (
    <div style={S.page}>

      {/* Nav */}
      <nav style={S.nav}>
        <Link href="/dashboard" style={{ color: "#DDD6B9", fontWeight: 700, fontSize: 13, letterSpacing: 1, textTransform: "uppercase", textDecoration: "none" }}>
          ← Dashboard
        </Link>
        <span style={{ color: "#fff", fontWeight: 700, fontSize: 14, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{trip.name}</span>
        <div style={{ width: 100 }} />
      </nav>

      <div style={S.body}>

        {/* ── Active banner ── */}
        {isActive && (
          <div style={{ background: "#3E5F44", padding: "16px 24px", marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
              <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>Trip is active — tracking live</span>
            </div>
            <button onClick={endTrip} disabled={ending} style={{ ...S.btnDanger, borderColor: "#fca5a5", color: "#fff", background: "#dc2626" }}>
              {ending ? "Ending…" : "End Trip"}
            </button>
          </div>
        )}

        {/* ── Details ── */}
        <div style={S.card}>
          <div style={S.cardHead}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#3E5F44", textTransform: "uppercase", letterSpacing: 1 }}>Details</span>
            {saveMsg && <span style={{ fontSize: 12, color: "#22c55e", fontWeight: 700 }}>✓ {saveMsg}</span>}
          </div>
          <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={S.label}>Trip Name</label>
              <input style={S.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sacramento to Tahoe" />
            </div>
            <div>
              <label style={S.label}>Notes (optional)</label>
              <textarea style={S.textarea} value={description} onChange={(e) => setDesc(e.target.value)} placeholder="Route notes, conditions, highlights…" />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={save} disabled={saving} style={S.btnPrimary}>
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>

        {/* ── Stats ── */}
        <div style={S.card}>
          <div style={S.cardHead}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#3E5F44", textTransform: "uppercase", letterSpacing: 1 }}>Stats</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
            {[
              ["Points recorded", String(pointCount)],
              ["Duration",        duration(trip)],
              ["Status",          trip.status.toUpperCase()],
              ["Started",         trip.started_at ? new Date(trip.started_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—"],
            ].map(([label, value], i) => (
              <div key={label} style={{ padding: "14px 24px", borderTop: "1px solid #e6e6e6", borderRight: i % 2 === 0 ? "1px solid #e6e6e6" : "none" }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "#9a9a9a", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2118" }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Sharing ── */}
        <div style={S.card}>
          <div style={S.cardHead}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#3E5F44", textTransform: "uppercase", letterSpacing: 1 }}>Share</span>
          </div>
          <div style={{ padding: "20px 24px" }}>
            {!isPublic ? (
              <div>
                <p style={{ fontSize: 13, color: "#6b7e6d", fontWeight: 300, marginTop: 0, marginBottom: 20, lineHeight: 1.6 }}>
                  Sharing is off. Enable it to get a public link anyone can use to follow your trip on a live map.
                </p>

                <label style={S.label}>Link Expires</label>
                <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                  {EXPIRY_OPTIONS.map((opt) => (
                    <button
                      key={String(opt.hours)}
                      onClick={() => setExpiryHours(opt.hours ?? null)}
                      style={{
                        flex: 1, padding: "8px 0", border: "1px solid",
                        borderColor: expiryHours === (opt.hours ?? null) ? "#FAA634" : "#e6e6e6",
                        background:  expiryHours === (opt.hours ?? null) ? "#FFF7EC" : "#fff",
                        color:       expiryHours === (opt.hours ?? null) ? "#FAA634" : "#6b6b6b",
                        fontWeight: 700, fontSize: 11, cursor: "pointer",
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <button onClick={enableSharing} disabled={enablingShare} style={S.btnYellow}>
                  {enablingShare ? "Generating…" : "Enable Sharing"}
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Share URL */}
                <div>
                  <label style={S.label}>Live Map Link</label>
                  <div style={{ display: "flex", border: "1px solid #e6e6e6" }}>
                    <span style={{ flex: 1, padding: "10px 14px", fontSize: 12, color: "#3a3a3a", fontWeight: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {shareUrl}
                    </span>
                    <button onClick={() => shareUrl && copyLink(shareUrl)} style={{ ...S.btnYellow, background: copied ? "#22c55e" : "#FAA634" }}>
                      {copied ? "COPIED" : "COPY"}
                    </button>
                  </div>
                </div>

                {/* Open link + story */}
                <div style={{ display: "flex", gap: 8 }}>
                  <a href={shareUrl!} target="_blank" rel="noopener noreferrer" style={{ ...S.btnPrimary, textDecoration: "none", display: "inline-block" }}>
                    Live Map ↗
                  </a>
                  <a href={`${shareUrl}/story`} target="_blank" rel="noopener noreferrer" style={{ ...S.btnGhost, textDecoration: "none", display: "inline-block" }}>
                    Story ↗
                  </a>
                </div>

                {/* KML / GPX */}
                <div>
                  <label style={S.label}>Export</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <a href={kmlUrl!} download style={{ ...S.btnGhost, textDecoration: "none", display: "inline-block" }}>
                      KML — Google Earth
                    </a>
                    <a href={gpxUrl!} download style={{ ...S.btnGhost, textDecoration: "none", display: "inline-block" }}>
                      GPX — Garmin / Gaia
                    </a>
                  </div>
                </div>

                <button onClick={disableSharing} style={S.btnDanger}>Disable Sharing</button>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
