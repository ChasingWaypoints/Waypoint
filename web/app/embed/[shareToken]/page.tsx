import LiveEventMap from "../../../components/LiveEventMap";
import { createAnonClient } from "../../../lib/supabase/admin";

/**
 * Embeddable live map — designed to be dropped into an organizer's own
 * event website via an <iframe>. No chrome or auth. White-label orgs get a
 * branded top strip; every embed carries a "powered by Waypoint" linkback.
 */

export const dynamic = "force-dynamic";

interface OrgBrand { org_name?: string | null; org_logo_url?: string | null; accent_color?: string | null; site_url?: string | null }

export default async function EmbedPage({
  params,
}: {
  params: Promise<{ shareToken: string }>;
}) {
  const { shareToken } = await params;

  let whitelabel = false;
  let org: OrgBrand | null = null;
  let accent = "#CCFF00";
  try {
    const supabase = createAnonClient();
    const { data } = await supabase.rpc("get_event_live_positions", { p_share_token: shareToken });
    const ev = (data as { event?: { whitelabel?: boolean; org?: OrgBrand } } | null)?.event;
    whitelabel = !!ev?.whitelabel;
    org = ev?.org ?? null;
    if (whitelabel && org?.accent_color && /^#[0-9a-fA-F]{6}$/.test(org.accent_color)) accent = org.accent_color;
  } catch {}

  const orgLogo = whitelabel ? org?.org_logo_url ?? null : null;
  const orgSite = whitelabel ? org?.site_url ?? null : null;

  return (
    <main style={{ position: "fixed", inset: 0, margin: 0, padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", background: "#0A0A0A" }}>
      {whitelabel && (orgLogo || org?.org_name) && (
        <div style={{ flexShrink: 0, background: "#0C1E29", borderTop: `3px solid ${accent}`, borderBottom: "1px solid #1E3B4C", height: 44, display: "flex", alignItems: "center", padding: "0 12px", gap: 10 }}>
          {orgLogo ? (
            orgSite
              // eslint-disable-next-line @next/next/no-img-element
              ? <a href={orgSite} target="_blank" rel="noopener noreferrer" style={{ display: "flex" }}><img src={orgLogo} alt="" style={{ height: 28, maxWidth: 160, objectFit: "contain" }} /></a>
              // eslint-disable-next-line @next/next/no-img-element
              : <img src={orgLogo} alt="" style={{ height: 28, maxWidth: 160, objectFit: "contain" }} />
          ) : (
            <span style={{ color: "#fff", fontWeight: 800, fontSize: 14 }}>{org?.org_name}</span>
          )}
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: accent, display: "inline-block" }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "#7E93A0", textTransform: "uppercase" }}>Live</span>
          </span>
        </div>
      )}

      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
        <LiveEventMap shareToken={shareToken} compact />
      </div>

      <div style={{ flexShrink: 0, background: "#0C1E29", borderTop: "1px solid #1E3B4C", height: 26, display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "0 12px" }}>
        <a href={process.env.NEXT_PUBLIC_SITE_URL ?? "https://app.chasingwaypoints.com"} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "#7E93A0", textTransform: "uppercase", textDecoration: "none" }}>
          powered by <span style={{ color: accent }}>Waypoint</span>
        </a>
      </div>
    </main>
  );
}
