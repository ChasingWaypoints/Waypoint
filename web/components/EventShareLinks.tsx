"use client";

import { useState } from "react";
import { authFetch } from "../lib/authFetch";
import { theme, font, btnPrimary, btnGhost, card as cardStyle, input as inputStyle } from "../lib/theme";

/**
 * The three ways an organizer hands out an event: the embeddable map for
 * their own site, the Google Earth Pro network link for their recovery
 * team, and a named-credential generator for individual viewers.
 */
export default function EventShareLinks({
  eventId,
  shareToken,
  origin,
}: {
  eventId: string;
  shareToken: string;
  origin: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [credName, setCredName] = useState("");
  const [creds, setCreds] = useState<{ id: string; display_name: string; gep_token: string }[]>([]);
  const [busy, setBusy] = useState(false);

  const embedUrl = `${origin}/embed/${shareToken}`;
  const embedCode = `<iframe src="${embedUrl}" width="100%" height="600" style="border:0" allow="fullscreen"></iframe>`;

  async function copy(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  async function createCredential() {
    if (!credName.trim()) return;
    setBusy(true);
    try {
      const res = await authFetch(`/api/events/${eventId}/gep-credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: credName.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        const cred = data.credential ?? data;
        if (cred?.gep_token) setCreds((c) => [...c, cred]);
        setCredName("");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ font: `14px ${font.sans}`, color: theme.body }}>
      <h2 style={{ font: `700 20px ${font.sans}`, color: theme.ink, margin: "0 0 14px" }}>
        Share this event
      </h2>

      {/* Embed */}
      <div style={card}>
        <div style={cardTitle}>Embed on your event website</div>
        <p style={cardText}>
          Paste this into your own site. The map stays live and updates on its own — you
          never have to touch it again once the event starts.
        </p>
        <code style={codeBox}>{embedCode}</code>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button onClick={() => copy(embedCode, "embed")} style={primaryBtn}>
            {copied === "embed" ? "Copied" : "Copy embed code"}
          </button>
          <a href={embedUrl} target="_blank" rel="noreferrer" style={linkBtn}>
            Preview
          </a>
        </div>
      </div>

      {/* Google Earth Pro */}
      <div style={card}>
        <div style={cardTitle}>Google Earth Pro — recovery and safety team</div>
        <p style={cardText}>
          Each person gets their own link. They open it once in Google Earth Pro and it
          refreshes every 30 seconds by itself. Every access is logged, so if a link is
          passed around you can see exactly whose it was.
        </p>

        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input
            value={credName}
            onChange={(e) => setCredName(e.target.value)}
            placeholder="Name of the viewer, e.g. Darren Smith"
            style={input}
            onKeyDown={(e) => e.key === "Enter" && createCredential()}
          />
          <button onClick={createCredential} disabled={busy || !credName.trim()} style={primaryBtn}>
            {busy ? "Creating…" : "Create link"}
          </button>
        </div>

        {creds.length > 0 && (
          <ul style={{ margin: "14px 0 0", padding: 0, listStyle: "none" }}>
            {creds.map((c) => {
              const url = `${origin}/api/events/${eventId}/gep/${c.gep_token}/network-link.kml`;
              return (
                <li
                  key={c.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 0",
                    borderTop: `1px solid ${theme.hairlineSoft}`,
                  }}
                >
                  <strong style={{ minWidth: 140, color: theme.ink }}>{c.display_name}</strong>
                  <a href={url} style={{ color: theme.accent, fontSize: 13 }}>
                    Download .kml
                  </a>
                  <button onClick={() => copy(url, c.id)} style={{ ...linkBtn, padding: "4px 10px" }}>
                    {copied === c.id ? "Copied" : "Copy link"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

const card = cardStyle;
const cardTitle: React.CSSProperties = { fontWeight: 700, color: theme.ink, marginBottom: 6 };
const cardText: React.CSSProperties = { margin: "0 0 10px", color: theme.muted, fontSize: 13 };
const codeBox: React.CSSProperties = {
  display: "block",
  background: theme.canvas,
  border: `1px solid ${theme.hairline}`,
  borderRadius: 4,
  padding: 10,
  font: `12px/1.5 ${font.mono}`,
  color: theme.track,
  wordBreak: "break-all",
};
const input: React.CSSProperties = { ...inputStyle, flex: 1 };
const primaryBtn = btnPrimary;
const linkBtn: React.CSSProperties = { ...btnGhost, textDecoration: "none", display: "inline-block" };
