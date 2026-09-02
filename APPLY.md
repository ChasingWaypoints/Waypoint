# Waypoint — Event Tracking Build (2026-09-02)

Drop-in changes for https://github.com/ChasingWaypoints/Waypoint

## 1. Run the migration FIRST
Open the Supabase SQL editor and run:

    web/supabase/migrations/005_event_entrants.sql

Every statement is guarded, so it is safe to re-run. It does five things:
- makes `event_participants.user_id` nullable, so an entrant no longer
  needs an app account
- adds `device_type`, `feed_url`, `feed_id`, `feed_password` to entrants
- adds `last_lat` / `last_lng` / `last_seen_at` / `poll_error`
- creates `event_track_points` for entrant breadcrumb trails
- adds the SECURITY DEFINER functions the new routes call

> The four earlier migrations live only in Google Drive, not in the repo.
> Copy them into `web/supabase/migrations/` as 001–004 so the schema
> history sits with the code.

## 2. Copy the files in
Unzip over the repo root. New and changed files:

**New**
    web/lib/csv.ts
    web/lib/entrants.ts
    web/lib/geo.ts
    web/lib/mapLayers.ts
    web/lib/theme.ts
    web/components/TrackingMap.tsx
    web/components/LiveEventMap.tsx
    web/components/EntrantManager.tsx
    web/components/EventShareLinks.tsx
    web/app/api/events/[id]/entrants/route.ts
    web/app/api/events/[id]/entrants/batch/route.ts
    web/app/api/events/[id]/entrants/[entrantId]/route.ts
    web/app/api/events/live/[shareToken]/route.ts
    web/app/api/cron/poll-entrants/route.ts
    web/app/embed/[shareToken]/page.tsx
    web/app/embed/[shareToken]/layout.tsx
    web/app/dashboard/events/[id]/track/page.tsx
    web/supabase/migrations/005_event_entrants.sql

**Changed**
    web/app/api/events/[id]/gep/[gepToken]/track.kml/route.ts
    web/next.config.ts
    web/vercel.json

## 3. Vercel
`vercel.json` now declares a cron:

    /api/cron/poll-entrants   every 2 minutes

Optionally set `CRON_SECRET` in Vercel. If it is set the route requires
`Authorization: Bearer <secret>` (Vercel Cron sends this automatically).
If it is not set the route stays open so you can trigger it by hand
while testing.

No new environment variables are otherwise required, and no new npm
dependencies — this adds zero packages.

## 4. Verify
    cd web
    npm install --legacy-peer-deps
    npx tsc --noEmit      # clean
    npx next build        # clean

Then, as an organizer:
1. Create an event
2. Open `/dashboard/events/<id>/track`
3. Entrants tab -> Download template -> fill it in -> upload
4. Watch the preview, then Import
5. Within ~2 minutes the beacons start reporting on the Live map tab
6. Share tab -> copy the embed code, or create a Google Earth Pro link

## Still outstanding
- **Rotate the exposed Mapbox secret token** (`sk.eyJ1...`) flagged in
  your June HANDOFF.md. Still not done.
- KML/KMZ import (GPX import already works via `route-gpx`)
- Stripe / paid tiers
- The landing page still sends people to install Expo Go
