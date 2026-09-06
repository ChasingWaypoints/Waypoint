"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { authFetch } from "@/lib/authFetch";
import { theme, text } from "../../../../lib/theme";

interface OrgData {
  active: boolean;
  subscription: { status: string; current_period_end: string | null; entrant_pool: number; entrants_used: number } | null;
  branding: { org_name: string | null; logo_url: string | null; accent_color: string | null; site_url: string | null } | null;
}

const ACCEPTED = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024;

export default function OrgSettingsPage() {
  const supabase = getSupabaseClient();
  const [data, setData] = useState<OrgData | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [orgName, setOrgName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [accent, setAccent] = useState("#CCFF00");
  const [siteUrl, setSiteUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUserId(session?.user.id ?? null);
      const res = await authFetch("/api/org");
      if (res.ok) {
        const d: OrgData = await res.json();
        setData(d);
        if (d.branding) {
          setOrgName(d.branding.org_name ?? "");
          setLogoUrl(d.branding.logo_url ?? null);
          setAccent(d.branding.accent_color ?? "#CCFF00");
          setSiteUrl(d.branding.site_url ?? "");
        }
      }
      setLoading(false);
    })();
  }, [supabase]);

  async function uploadLogo(file: File) {
    if (!ACCEPTED.includes(file.type)) { setError("Use a PNG, JPG, SVG or WebP image."); return; }
    if (file.size > MAX_BYTES) { setError(`That image is ${(file.size / 1024 / 1024).toFixed(1)} MB — max is 2 MB.`); return; }
    if (!userId) return;
    setError(null); setBusy(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
      const path = `org/${userId}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("event-branding")
        .upload(path, file, { upsert: true, cacheControl: "3600", contentType: file.type });
      if (upErr) { setError(`Upload failed: ${upErr.message}`); return; }
      setLogoUrl(supabase.storage.from("event-branding").getPublicUrl(path).data.publicUrl);
    } finally { setBusy(false); }
  }

  async function save() {
    setBusy(true); setError(null);
    try {
      const res = await authFetch("/api/org", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_name: orgName.trim() || null, logo_url: logoUrl, accent_color: accent, site_url: siteUrl.trim() || null }),
      });
      if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500); }
      else { const d = await res.json().catch(() => ({})); setError(d.error ?? "Could not save."); }
    } finally { setBusy(false); }
  }

  const card: React.CSSProperties = { background: theme.surface, border: `1px solid ${theme.hairline}`, borderRadius: 8, padding: 20 };
  const label: React.CSSProperties = { display: "block", fontSize: text.xs, fontWeight: 700, letterSpacing: 1, color: "#7E93A0", textTransform: "uppercase", marginBottom: 8 };
  const input: React.CSSProperties = { width: "100%", padding: "10px 12px", background: "#0A0A0A", color: "#fff", border: `1px solid ${theme.hairline}`, fontSize: text.md, outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ minHeight: "100vh", background: "#0A0A0A", color: "#fff" }}>
      <nav style={{ background: theme.surface, padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/" style={{ color: "#fff", fontWeight: 700, fontSize: text.lg, letterSpacing: 1, textTransform: "uppercase", textDecoration: "none" }}>Waypoint</Link>
        <Link href="/dashboard" style={{ color: "#7E93A0", fontSize: text.sm, textDecoration: "none" }}>← Dashboard</Link>
      </nav>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: 24, display: "flex", flexDirection: "column", gap: 24 }}>
        <h1 style={{ fontSize: text.xxl, fontWeight: 800, margin: 0 }}>Organization &amp; White-Label</h1>

        {loading ? (
          <p style={{ color: "#7E93A0" }}>Loading…</p>
        ) : !data?.active ? (
          <div style={card}>
            <div style={{ fontWeight: 700, fontSize: text.md, marginBottom: 8 }}>Organization plan required</div>
            <p style={{ color: "#7E93A0", fontSize: text.base, lineHeight: 1.6, margin: "0 0 14px" }}>
              White-label branding is part of the Waypoint Organization plan ($3,500/year): your logo and colors on
              every public event page, an embeddable tracker for your website, and a shared 1,500-entrant pool.
            </p>
            <Link href="/dashboard" style={{ color: theme.accent, fontWeight: 700, fontSize: text.base, textDecoration: "none" }}>
              Go to the dashboard to subscribe →
            </Link>
          </div>
        ) : (
          <>
            {/* Plan status */}
            <div style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ display: "inline-block", background: "#26330A", border: "1px solid #4A5A25", color: "#CCFF00", padding: "3px 10px", borderRadius: 999, fontSize: text.xxs, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>
                  Organization plan · active
                </div>
                <div style={{ fontSize: text.sm, color: "#7E93A0", marginTop: 8 }}>
                  {(data.subscription?.entrants_used ?? 0)} / {data.subscription?.entrant_pool ?? 1500} entrants used
                  {data.subscription?.current_period_end ? ` · renews ${new Date(data.subscription.current_period_end).toLocaleDateString()}` : ""}
                </div>
              </div>
            </div>

            {error && <div style={{ color: theme.danger, fontSize: text.base }}>{error}</div>}

            {/* Branding */}
            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: text.md, marginBottom: 4 }}>White-label branding</div>
              <p style={{ color: "#7E93A0", fontSize: text.sm, margin: "0 0 18px", lineHeight: 1.5 }}>
                Applied to every public event page and embed owned by your organization.
              </p>

              <div style={{ marginBottom: 18 }}>
                <label style={label}>Organization name</label>
                <input style={input} value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="e.g. Baja Adventure Riders" />
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={label}>Logo</label>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                  {logoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt="Org logo" style={{ height: 44, maxWidth: 180, objectFit: "contain", background: "#0C1E29", padding: 6, borderRadius: 4 }} />
                  )}
                  <input ref={fileInput} type="file" accept=".png,.jpg,.jpeg,.svg,.webp" disabled={busy}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); }}
                    style={{ fontSize: text.base }} />
                  {logoUrl && <button onClick={() => setLogoUrl(null)} style={{ background: "transparent", border: `1px solid ${theme.hairline}`, color: "#C8D4DC", padding: "6px 12px", fontSize: text.xs, cursor: "pointer" }}>Remove</button>}
                </div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={label}>Accent color</label>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input type="color" value={accent} onChange={(e) => setAccent(e.target.value.toUpperCase())}
                    style={{ width: 44, height: 36, background: "#0A0A0A", border: `1px solid ${theme.hairline}`, cursor: "pointer" }} />
                  <input style={{ ...input, width: 120 }} value={accent}
                    onChange={(e) => { const v = e.target.value.toUpperCase(); setAccent(v.startsWith("#") ? v : "#" + v); }} maxLength={7} />
                  <span style={{ fontSize: text.sm, color: "#7E93A0" }}>Used on the public map header + highlights.</span>
                </div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={label}>Website (credit linkback)</label>
                <input style={input} value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} placeholder="https://your-org.com" />
              </div>

              {/* Live preview of the public header */}
              <div style={{ marginTop: 8 }}>
                <label style={label}>Preview</label>
                <div style={{ background: "#0C1E29", border: `1px solid ${theme.hairline}`, borderTop: `3px solid ${accent}`, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                  {logoUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={logoUrl} alt="" style={{ height: 34, maxWidth: 140, objectFit: "contain" }} />
                    : <div style={{ fontWeight: 800, color: "#fff" }}>{orgName || "Your Org"}</div>}
                  <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: accent, display: "inline-block" }} />
                    <span style={{ fontSize: text.xxs, fontWeight: 700, letterSpacing: 1, color: "#7E93A0", textTransform: "uppercase" }}>Live · powered by Waypoint</span>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 18 }}>
                <button onClick={save} disabled={busy}
                  style={{ background: theme.accent, color: theme.accentInk, border: "none", padding: "10px 20px", fontSize: text.xs, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}>
                  {busy ? "Saving…" : saved ? "Saved ✓" : "Save branding"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
