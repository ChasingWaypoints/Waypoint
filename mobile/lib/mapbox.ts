/**
 * mapbox.ts
 *
 * One place where the Mapbox access token is set, imported once at app root.
 *
 * It used to live inside components/TripMap.tsx, with a comment in
 * app/events/[id].tsx saying "already initialised in TripMap.tsx — do not call
 * setAccessToken again". But events/[id].tsx does not import TripMap. Open the
 * event screen without having visited a trip map first and setAccessToken had
 * never been called at all — MapView then hits the native SDK with no token and
 * takes the whole app down. Initialisation that depends on an unrelated screen
 * having been visited first is not initialisation.
 */

import Mapbox from "@rnmapbox/maps";

const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "";

/**
 * A real public token is `pk.` followed by a long base64 payload. Anything
 * shorter is a stub, and a stub is worse than nothing: the native SDK accepts
 * it and then crashes on first tile request.
 */
export const hasMapboxToken = token.startsWith("pk.") && token.length > 40;

if (hasMapboxToken) {
  Mapbox.setAccessToken(token);
} else {
  console.warn(
    "[mapbox] No usable EXPO_PUBLIC_MAPBOX_TOKEN — maps will render a placeholder instead of crashing."
  );
}
