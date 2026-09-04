"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { authFetch } from "../lib/authFetch";
import { getSupabaseClient } from "@/lib/supabase/client";

const supabase = getSupabaseClient();

interface Sponsor {
  name: string;
  logo_url: string;
  url: string;
  headline: boolean;
}

// Upload specs — surfaced in the UI next to every file control.
const ACCEPTED = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const SPEC = "PNG, JPG, SVG or WebP · max 2 MB";
const LOGO_SPEC = "PNG, JPG, SVG or WebP · max 2 MB · transparent PNG/SVG recommended";

const C = {
  surface: "#0C1E29",
  border: "#1E3B4C",
  ink: "#FFFFFF",
  muted: "#7E93A0",
  accent: "#CCFF00",
  danger: "#FF6B6B",
  field: "#0A0A0A",
};

export default function EventBranding({ eventId }: { eventId: string }) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<Sponsor>({ name: "", logo_url: "", url: "", headline: false });
  const logoInput = useRef<HTMLInputElement>(null);
  const spInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await authFetch(`/api/events/${eventId}`);
      if (res.ok) {
        const d = await res.json();
        setLogoUrl(d.event?.logo_url ?? null);
        setSponsors(Array.isArray(d.event?.sponsors) ? d.event.sponsors : []);
      }
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  async function uploadImage(file: File, prefix: string): Promise<string | null> {
    if (!ACCEPTED.includes(file.type)) {
      setError("Please use a PNG, JPG, SVG or WebP image.");
      return null;
    }
    if (file.size > MAX_BYTES) {
      setError(`That image is ${(file.size / 1024 / 1024).toFixed(1)} MB — the max is 2 MB. Please use a smaller file.`);
      return null;
    }
    setError(null);
    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
    const path = `${eventId}/${prefix}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("event-branding")
      .upload(path, file, { upsert: true, cacheControl: "3600", contentType: file.type });
    if (upErr) {
      setError(`Upload failed: ${upErr.message}`);
      return null;
    }
    return supabase.storage.from("event-branding").getPublicUrl(path).data.publicUrl;
  }

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    const res = await authFetch(`/api/events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Could not save. Please try again.");
      return false;
    }
    return true;
  }

  async function onLogoFile(file: File) {
    setBusy("logo");
    try {
      const url = await uploadImage(file, "logo");
      if (url && (await patch({ logo_url: url }))) setLogoUrl(url);
    } finally {
      setBusy(null);
      if (logoInput.current) logoInput.current.value = "";
    }
  }

  async function removeLogo() {
    setBusy("logo");
    try {
      if (await patch({ logo_url: null })) setLogoUrl(null);
    } finally {
      setBusy(null);
    }
  }

  async function onDraftLogoFile(file: File) {
    setBusy("draft");
    try {
      const url = await uploadImage(file, "sponsor");
      if (url) setDraft((d) => ({ ...d, logo_url: url }));
    } finally {
      setBusy(null);
      if (spInput.current) spInput.current.value = "";
    }
  }

  async function addSponsor() {
    if (!draft.logo_url) {
      setError("Upload the sponsor's logo first.");
      return;
    }
    const next = [...sponsors, { ...draft, name: draft.name.trim(), url: draft.url.trim() }];
    if (await patch({ sponsors: next })) {
      setSponsors(next);
      setDraft({ name: "", logo_url: "", url: "", headline: false });
    }
  }

  async function updateSponsor(i: number, patchSp: Partial<Sponsor>) {
    const next = sponsors.map((s, idx) => (idx === i ? { ...s, ...patchSp } : s));
    if (await patch({ sponsors: next })) setSponsors(next);
  }

  async function removeSponsor(i: number) {
    const next = sponsors.filter((_, idx) => idx !== i);
    if (await patch({ sponsors: next })) setSponsors(next);
  }

  const headlineCount = sponsors.filter((s) => s.headline).length;

  if (loading) {
    return <div style={{ color: C.muted, fontSize: 13 }}>Loading branding…</div>;
  }

  return (
    <div>
      <div style={label}>Branding</div>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, padding: 24, display: "flex", flexDirection: "column", gap: 28 }}>
        {error && (
          <div style={{ color: C.danger, fontSize: 13, background: "#2A1214", border: `1px solid #5A2530`, borderRadius: 4, padding: "8px 12px" }}>
            {error}
          </div>
        )}

        <div>
          <div style={subhead}>Event logo</div>
          <p style={help}>
            Shown at the top-left of the public tracking page. {LOGO_SPEC}.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            {logoUrl && (
              <div style={{ background: "#0A0A0A", border: `1px solid ${C.border}`, borderRadius: 4, padding: 8, display: "flex", alignItems: "center", justifyContent: "center", height: 56, minWidth: 80 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl} alt="Event logo" style={{ height: 40, maxWidth: 160, objectFit: "contain", display: "block" }} />
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <input
                ref={logoInput}
                type="file"
                accept={ACCEPTED.join(",")}
                disabled={busy === "logo"}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onLogoFile(f);
                }}
                style={{ fontSize: 13, color: C.ink }}
              />
              <span style={spec}>{LOGO_SPEC}</span>
            </div>
            {logoUrl && (
              <button onClick={removeLogo} disabled={busy === "logo"} style={ghostBtn}>
                Remove
              </button>
            )}
            {busy === "logo" && <span style={{ color: C.muted, fontSize: 12 }}>Uploading…</span>}
          </div>
        </div>

        <div>
          <div style={subhead}>Sponsors</div>
          <p style={help}>
            Add sponsor logos for the public page. Mark up to two as{" "}
            <strong style={{ color: C.ink }}>Headline</strong> to place them in the header; the rest run
            in a &ldquo;Presented by&rdquo; strip across the bottom of the map. {SPEC}.
          </p>

          {sponsors.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
              {sponsors.map((sp, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, background: "#0A0A0A", border: `1px solid ${C.border}`, borderRadius: 4, padding: "8px 12px" }}>
                  <div style={{ width: 64, height: 32, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={sp.logo_url} alt={sp.name} style={{ maxHeight: 32, maxWidth: 64, objectFit: "contain" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: C.ink, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {sp.name || <span style={{ color: C.muted }}>(no name)</span>}
                    </div>
                    {sp.url && <div style={{ color: C.muted, fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sp.url}</div>}
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.muted, cursor: "pointer", flexShrink: 0 }}>
                    <input
                      type="checkbox"
                      checked={sp.headline}
                      disabled={!sp.headline && headlineCount >= 2}
                      onChange={(e) => updateSponsor(i, { headline: e.target.checked })}
                    />
                    Headline
                  </label>
                  <button onClick={() => removeSponsor(i)} style={ghostBtn}>Remove</button>
                </div>
              ))}
            </div>
          )}

          <div style={{ border: `1px dashed ${C.border}`, borderRadius: 4, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.ink, letterSpacing: 0.5, textTransform: "uppercase" }}>Add a sponsor</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ width: 64, height: 34, display: "flex", alignItems: "center", justifyContent: "center", background: "#0A0A0A", border: `1px solid ${C.border}`, borderRadius: 4, flexShrink: 0 }}>
                {draft.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={draft.logo_url} alt="" style={{ maxHeight: 30, maxWidth: 60, objectFit: "contain" }} />
                ) : (
                  <span style={{ color: C.muted, fontSize: 10 }}>logo</span>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <input
                  ref={spInput}
                  type="file"
                  accept={ACCEPTED.join(",")}
                  disabled={busy === "draft"}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onDraftLogoFile(f);
                  }}
                  style={{ fontSize: 13, color: C.ink }}
                />
                <span style={spec}>{SPEC}</span>
              </div>
              {busy === "draft" && <span style={{ color: C.muted, fontSize: 12 }}>Uploading…</span>}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Sponsor name"
                style={{ ...field, flex: "1 1 180px" }}
              />
              <input
                type="url"
                value={draft.url}
                onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
                placeholder="Link (optional) — https://…"
                style={{ ...field, flex: "1 1 220px" }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.muted, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={draft.headline}
                  disabled={!draft.headline && headlineCount >= 2}
                  onChange={(e) => setDraft((d) => ({ ...d, headline: e.target.checked }))}
                />
                Headline (header) {headlineCount >= 2 && !draft.headline && <span style={{ color: C.muted }}>· 2 max</span>}
              </label>
              <button onClick={addSponsor} disabled={!draft.logo_url} style={{ ...primaryBtn, opacity: draft.logo_url ? 1 : 0.5, cursor: draft.logo_url ? "pointer" : "default" }}>
                Add sponsor
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const label: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase",
  color: "#7E93A0", margin: "0 0 10px",
};
const subhead: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: "#FFFFFF", marginBottom: 4 };
const help: React.CSSProperties = { fontSize: 13, color: "#7E93A0", margin: "0 0 14px", lineHeight: 1.6 };
const spec: React.CSSProperties = { fontSize: 11, color: "#54697A" };
const field: React.CSSProperties = {
  padding: "9px 12px", border: "1px solid #1E3B4C", background: "#0A0A0A",
  fontSize: 13, color: "#FFFFFF", outline: "none", borderRadius: 4,
};
const ghostBtn: React.CSSProperties = {
  background: "transparent", border: "1px solid #5A2530", color: "#FF6B6B",
  padding: "5px 12px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
  textTransform: "uppercase", cursor: "pointer", borderRadius: 4, flexShrink: 0,
};
const primaryBtn: React.CSSProperties = {
  background: "#CCFF00", color: "#0C1E29", border: "none",
  padding: "9px 18px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
  textTransform: "uppercase", borderRadius: 4,
};
