"use client";
import { text } from "../../../lib/theme";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import LiveEventMap from "../../../components/LiveEventMap";
import { SpectatorGuide } from "../../../components/onboarding/SpectatorGuide";

/**
 * Public spectator page for a group event.
 *
 * Thin wrapper around LiveEventMap so it shares the exact same map as the
 * organizer's tracking page and the embed — Esri satellite by default with
 * the full layer switcher, live entrant markers, status colours and trails.
 * Addressed by the event's public share token.
 */
export default function EventPage() {
  const { token } = useParams<{ token: string }>();
  const [name, setName] = useState<string>("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [sponsors, setSponsors] = useState<{ name?: string; logo_url: string; url?: string; headline?: boolean }[]>([]);
  const [whitelabel, setWhitelabel] = useState(false);
  const [orgLogo, setOrgLogo] = useState<string | null>(null);
  const [orgSite, setOrgSite] = useState<string | null>(null);
  const [accent, setAccent] = useState<string>("#CCFF00");
  const isMobile = useIsMobile(768);

  // On phones there is no room for headline sponsors up top; roll every
  // sponsor (headline first) into the scrollable bottom strip instead so a
  // headline sponsor is never dropped on mobile.
  const stripSponsors = isMobile
    ? [...sponsors.filter((sp) => sp.headline), ...sponsors.filter((sp) => !sp.headline)]
    : sponsors.filter((sp) => !sp.headline);

  // Pull the event name for the header/title; the map loads its own data.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/events/live/${token}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.event) {
          if (d.event.name) {
            setName(d.event.name);
            document.title = `${d.event.name} — Live Tracking — Waypoint`;
          }
          setLogoUrl(d.event.logo_url ?? null);
          setSponsors(Array.isArray(d.event.sponsors) ? d.event.sponsors : []);
          setWhitelabel(!!d.event.whitelabel);
          const org = d.event.org || null;
          setOrgLogo(org?.org_logo_url ?? null);
          setOrgSite(org?.site_url ?? null);
          if (org?.accent_color && /^#[0-9a-fA-F]{6}$/.test(org.accent_color)) setAccent(org.accent_color);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "#0A0A0A" }}>
      <div
        className="wp-event-header"
        style={{
          background: "#0C1E29",
          borderTop: whitelabel ? `3px solid ${accent}` : undefined,
          borderBottom: "1px solid #1E3B4C",
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexShrink: 0,
        }}
      >
        {/* Brand logo — org logo (white-label) takes precedence over the event logo. */}
        {(() => {
          const brandLogo = (whitelabel && orgLogo) ? orgLogo : logoUrl;
          if (!brandLogo) return null;
          // eslint-disable-next-line @next/next/no-img-element
          const img = <img src={brandLogo} alt="" className="wp-event-logo" style={{ width: "auto", maxWidth: "min(48vw, 280px)", objectFit: "contain", display: "block" }} />;
          const wrapStyle = { flex: "0 0 auto", display: "flex", alignItems: "center" } as const;
          return (whitelabel && orgLogo && orgSite)
            ? <a className="wp-event-logo-wrap" href={orgSite} target="_blank" rel="noopener noreferrer" style={wrapStyle}>{img}</a>
            : <span className="wp-event-logo-wrap" style={wrapStyle}>{img}</span>;
        })()}
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <span style={{ color: "#fff", fontWeight: 800, fontSize: text.lg, lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {name || "Live Event"}
          </span>
          <span style={{ color: "#7E93A0", fontSize: text.xs, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: accent, display: "inline-block" }} />
            {whitelabel ? (
              <>Live · powered by{" "}
                <a href={process.env.NEXT_PUBLIC_SITE_URL ?? "https://app.chasingwaypoints.com"} target="_blank" rel="noopener noreferrer" style={{ color: "#7E93A0", textDecoration: "underline" }}>Waypoint</a>
              </>
            ) : "Live · Waypoint"}
          </span>
        </div>

        {/* Headline sponsors — right side of the header (hidden on phones;
            they still appear in the bottom "Presented by" strip). */}
        <div className="wp-header-sponsors" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16 }}>
          {sponsors.filter((sp) => sp.headline).map((sp, i) => (
            <SponsorLogo key={i} sp={sp} height={64} />
          ))}
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <LiveEventMap shareToken={token} />
        <SpectatorGuide variant="event" />
      </div>

      {stripSponsors.length > 0 && (
        <div
          className="wp-actionbar"
          style={{
            background: "#0C1E29",
            borderTop: "1px solid #1E3B4C",
            minHeight: isMobile ? 64 : 76,
            padding: "8px 20px",
            paddingLeft: "max(20px, env(safe-area-inset-left))",
            paddingRight: "max(20px, env(safe-area-inset-right))",
            paddingBottom: "calc(8px + env(safe-area-inset-bottom, 0px))",
            boxSizing: "border-box",
            display: "flex",
            alignItems: "center",
            gap: isMobile ? 20 : 18,
            flexShrink: 0,
            overflowX: "auto",
          }}
        >
          <span style={{ color: "#7E93A0", fontSize: text.xxs, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", flexShrink: 0 }}>
            Presented&nbsp;by
          </span>
          {stripSponsors.map((sp, i) => (
            <SponsorLogo key={i} sp={sp} height={isMobile ? 44 : 56} />
          ))}
        </div>
      )}
    </div>
  );
}

function SponsorLogo({
  sp,
  height,
}: {
  sp: { name?: string; logo_url: string; url?: string };
  height: number;
}) {
  // eslint-disable-next-line @next/next/no-img-element
  const img = (
    <img
      src={sp.logo_url}
      alt={sp.name ?? ""}
      title={sp.name ?? ""}
      style={{ height, width: "auto", maxWidth: 220, objectFit: "contain", flexShrink: 0, display: "block" }}
    />
  );
  return sp.url ? (
    <a href={sp.url} target="_blank" rel="noopener noreferrer sponsored" style={{ display: "block", flexShrink: 0 }}>
      {img}
    </a>
  ) : (
    img
  );
}

function useIsMobile(bp = 768): boolean {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${bp}px)`);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [bp]);
  return m;
}
