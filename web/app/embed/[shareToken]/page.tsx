import LiveEventMap from "../../../components/LiveEventMap";

/**
 * Embeddable live map — designed to be dropped into an organizer's own
 * event website:
 *
 *   <iframe src="https://app.chasingwaypoints.com/embed/<shareToken>"
 *           width="100%" height="600" style="border:0"
 *           allow="fullscreen"></iframe>
 *
 * No chrome, no navigation, no auth. Addressed by share token so the
 * organizer can rotate it without touching their site.
 */

export const dynamic = "force-dynamic";

export default async function EmbedPage({
  params,
}: {
  params: Promise<{ shareToken: string }>;
}) {
  const { shareToken } = await params;

  return (
    <main
      style={{
        position: "fixed",
        inset: 0,
        margin: 0,
        padding: 0,
        overflow: "hidden",
      }}
    >
      <LiveEventMap shareToken={shareToken} compact />
    </main>
  );
}
