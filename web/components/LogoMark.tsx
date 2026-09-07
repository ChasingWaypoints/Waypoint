// Waypoint logo mark — acid-yellow disc, dark outline, "WP" monogram.
// Doubles as the favicon (see app/icon.svg). Colour-fixed so it reads on any
// dark surface; pair it beside the WAYPOINT wordmark.
export function LogoMark({ size = 22, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      style={{ display: "block", flexShrink: 0, ...style }}
    >
      <circle cx="32" cy="32" r="27" fill="#CCFF00" stroke="#0C1E29" strokeWidth="5" />
      <text
        x="32"
        y="34"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Arial, 'Helvetica Neue', Helvetica, sans-serif"
        fontWeight={800}
        fontSize={26}
        letterSpacing={-1}
        fill="#0C1E29"
      >
        WP
      </text>
    </svg>
  );
}
