import { NextRequest } from "next/server";

// Point temperature/conditions for one lat/lng, proxied so the OpenWeather
// key stays server-side. Used to fill the live temp readout in a rider popup.
export const runtime = "edge";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  const key = process.env.OPENWEATHER_API_KEY;

  if (
    !key ||
    !Number.isFinite(lat) || lat < -90 || lat > 90 ||
    !Number.isFinite(lng) || lng < -180 || lng > 180
  ) {
    return new Response(JSON.stringify({ ok: false }), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "public, max-age=60" },
    });
  }

  const url =
    `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&units=imperial&appid=${key}`;
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return json({ ok: false }, 60);
    const j = (await r.json()) as {
      main?: { temp?: number; feels_like?: number };
      weather?: { description?: string }[];
      wind?: { speed?: number };
    };
    const tempF = j.main?.temp ?? null;
    return json(
      {
        ok: true,
        tempF,
        tempC: tempF == null ? null : (tempF - 32) * (5 / 9),
        feelsF: j.main?.feels_like ?? null,
        description: j.weather?.[0]?.description ?? null,
        windMph: j.wind?.speed ?? null,
      },
      600
    );
  } catch {
    return json({ ok: false }, 60);
  }
}

function json(body: unknown, maxAge: number) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": `public, s-maxage=${maxAge}, max-age=${Math.min(maxAge, 300)}`,
    },
  });
}
