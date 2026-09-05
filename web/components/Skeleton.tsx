/**
 * Lightweight skeleton loaders. A shimmering placeholder that mirrors the
 * shape of the content that's about to arrive reads as faster and calmer than
 * a "Loading…" string or a spinner.
 */

export function Skeleton({
  width = "100%",
  height = 12,
  radius = 6,
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
  style?: React.CSSProperties;
}) {
  return (
    <div className="wp-skel" style={{ width, height, borderRadius: radius, ...style }} aria-hidden />
  );
}

/** A stack of card-shaped rows, matching the dashboard/roster list layout. */
export function SkeletonRows({
  rows = 3,
  height = 64,
  gap = 1,
  rowStyle,
}: {
  rows?: number;
  height?: number;
  gap?: number;
  rowStyle?: React.CSSProperties;
}) {
  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap, background: "#1E3B4C", border: "1px solid #1E3B4C" }}
      role="status"
      aria-label="Loading"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{ background: "#0C1E29", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, ...rowStyle }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <Skeleton width={`${45 + ((i * 13) % 30)}%`} height={14} />
            <Skeleton width={`${30 + ((i * 17) % 25)}%`} height={10} style={{ marginTop: 8 }} />
          </div>
          <Skeleton width={84} height={28} radius={4} />
        </div>
      ))}
    </div>
  );
}
