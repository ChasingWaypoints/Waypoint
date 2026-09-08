import { NextResponse } from "next/server";

// Radar timelapse frame index (RainViewer public API — free, no key). Returns
// the recent past frames plus short-range nowcast so the client can animate a
// loop. Proxied so the browser only talks to our origin, and cached ~2 min
// (RainViewer regenerates roughly every 10 min).
export const runtime = "edge";

type Frame = { time: number; key: string };

function json(body: unknown, maxAge: number) {
  return NextResponse.json(body, {
    headers: { "cache-control": `public, s-maxage=${maxAge}, max-age=${maxAge}, stale-while-revalidate=600` },
  });
}

export async function GET() {
  try {
    const r = await fetch("https://api.rainviewer.com/public/weather-maps.json", { cache: "no-store" });
    if (!r.ok) return json({ frames: [] as Frame[] }, 60);
    const j = (await r.json()) as {
      radar?: { past?: { time: number; path: string }[]; nowcast?: { time: number; path: string }[] };
    };
    // The tile-path token is the trailing segment of `path` (e.g. "/v2/radar/1699999999").
    const toFrame = (f: { time: number; path: string }): Frame | null => {
      const key = f.path.split("/").filter(Boolean).pop() ?? "";
      return /^[A-Za-z0-9_]+$/.test(key) ? { time: f.time, key } : null;
    };
    const past = (j.radar?.past ?? []).map(toFrame).filter(Boolean) as Frame[];
    const nowcast = (j.radar?.nowcast ?? []).map(toFrame).filter(Boolean) as Frame[];
    return json({ frames: [...past, ...nowcast] }, 120);
  } catch {
    return json({ frames: [] as Frame[] }, 60);
  }
}
