import { NextRequest } from "next/server";

// Weather tiles are proxied so the OpenWeather API key never reaches the
// browser, and so Vercel's CDN caches each tile (they only change ~every
// 10 min) instead of hammering the free-tier quota per pan/zoom.
export const runtime = "edge";

// Friendly slug -> OpenWeather Weather Maps 1.0 layer id.
const LAYER: Record<string, string> = {
  precipitation: "precipitation_new",
  temp: "temp_new",
};

// 1x1 transparent PNG — returned when the key is missing or upstream fails,
// so the map degrades to "no overlay" instead of throwing tile errors.
const BLANK = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0)
);

function blank(maxAge = 300) {
  return new Response(BLANK, {
    status: 200,
    headers: { "content-type": "image/png", "cache-control": `public, max-age=${maxAge}` },
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ kind: string; z: string; x: string; y: string }> | { kind: string; z: string; x: string; y: string } }
) {
  const { kind, z, x, y } = await Promise.resolve(params);
  const layer = LAYER[kind];
  const key = process.env.OPENWEATHER_API_KEY;

  // Reject anything that isn't a plain tile coordinate (no SSRF via params).
  if (!layer || !key || !/^\d{1,2}$/.test(z) || !/^\d{1,7}$/.test(x) || !/^\d{1,7}$/.test(y)) {
    return blank(60);
  }

  const url = `https://tile.openweathermap.org/map/${layer}/${z}/${x}/${y}.png?appid=${key}`;
  try {
    const upstream = await fetch(url, { cache: "no-store" });
    if (!upstream.ok) return blank(60);
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "content-type": "image/png",
        // CDN holds each tile 10 min; serve stale while refreshing for another 20.
        "cache-control": "public, s-maxage=600, max-age=600, stale-while-revalidate=1200",
      },
    });
  } catch {
    return blank(60);
  }
}
