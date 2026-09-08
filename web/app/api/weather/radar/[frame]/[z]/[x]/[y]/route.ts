import { NextRequest } from "next/server";

// Radar timelapse tiles (RainViewer). `frame` is one of the keys returned by
// /api/weather/radar-frames. Proxied + CDN-cached so the browser never hits
// RainViewer directly and each frame's tiles are held briefly.
export const runtime = "edge";

const HOST = "https://tilecache.rainviewer.com";
// size / color(2 = Universal Blue) / options(1_1 = smooth + snow).
const TILE = (frame: string, z: string, x: string, y: string) =>
  `${HOST}/v2/radar/${frame}/256/${z}/${x}/${y}/2/1_1.png`;

// 1x1 transparent PNG fallback so the map degrades to "no overlay" on failure.
const BLANK = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0)
);
function blank(maxAge = 60) {
  return new Response(BLANK, {
    status: 200,
    headers: { "content-type": "image/png", "cache-control": `public, max-age=${maxAge}` },
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ frame: string; z: string; x: string; y: string }> | { frame: string; z: string; x: string; y: string } }
) {
  const { frame, z, x, y } = await Promise.resolve(params);

  // Strict validation — no SSRF via the path params.
  if (
    !/^[A-Za-z0-9_]+$/.test(frame) ||
    !/^\d{1,2}$/.test(z) || !/^\d{1,7}$/.test(x) || !/^\d{1,7}$/.test(y)
  ) {
    return blank(60);
  }

  try {
    const upstream = await fetch(TILE(frame, z, x, y), { cache: "no-store" });
    if (!upstream.ok) return blank(60);
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "content-type": "image/png",
        "cache-control": "public, s-maxage=600, max-age=600, stale-while-revalidate=1200",
      },
    });
  } catch {
    return blank(60);
  }
}
