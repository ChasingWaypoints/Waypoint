/**
 * deviceIdentity.ts
 *
 * The phone's own credential, and the 6-char code a human uses to link it.
 *
 * Why not just use the app's login: a rider at a start line, in gloves, on
 * borrowed signal, should not have to create an account to become a dot on the
 * map. So the device generates a 32-byte token on first launch, keeps it in the
 * keychain, and the server stores only its SHA-256. Everything the beacon does
 * is authorised by that token.
 *
 * The claim code is NOT a credential — it is a short, unambiguous handle the
 * rider (or an organizer) types once at waypointtracking.com to attach this
 * phone to a Waypoint account. Knowing someone's code lets you claim an
 * unclaimed device and nothing else.
 */

import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { supabase } from "./supabase";

const TOKEN_KEY = "waypoint_device_token";
/** Mirror of the claim code, for offline display. Not sensitive. */
const CODE_KEY = "waypoint_claim_code";

export type BeaconState = {
  ok: boolean;
  claim_code?: string;
  claimed?: boolean;
  owner_name?: string;
  active_event_id?: string | null;
  active_event_name?: string | null;
  participant_linked?: boolean;
  error?: string;
};

export type BeaconEvent = {
  event_id: string;
  name: string;
  status: string | null;
  starts_at: string | null;
  ends_at: string | null;
  participant_id: string;
  rider_number: string | null;
};

/**
 * SecureStore is unavailable on web and can fail on a device with no passcode
 * on some OS versions. AsyncStorage is the fallback: less protected, but a
 * beacon that cannot store its token is a beacon that does not work at all.
 */
async function readToken(): Promise<string | null> {
  try {
    if (Platform.OS !== "web") {
      const v = await SecureStore.getItemAsync(TOKEN_KEY);
      if (v) return v;
    }
  } catch {
    // fall through
  }
  return AsyncStorage.getItem(TOKEN_KEY);
}

async function writeToken(token: string): Promise<void> {
  try {
    if (Platform.OS !== "web") {
      await SecureStore.setItemAsync(TOKEN_KEY, token, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
      });
      return;
    }
  } catch {
    // fall through
  }
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

/** 32 random bytes, hex. Guessing this is not a threat model worth modelling. */
async function mintToken(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function getDeviceToken(): Promise<string> {
  const existing = await readToken();
  if (existing) return existing;
  const token = await mintToken();
  await writeToken(token);
  return token;
}

/**
 * Called on every launch. Idempotent server-side, so a retry after a failed
 * first launch returns the same code rather than orphaning a beacon.
 */
export async function registerDevice(): Promise<string | null> {
  const token = await getDeviceToken();
  const version =
    (Constants.expoConfig?.version as string | undefined) ?? "unknown";

  const { data, error } = await supabase.rpc("register_device_beacon", {
    p_token: token,
    p_platform: Platform.OS === "ios" ? "ios" : "android",
    p_app_version: version,
  });

  if (error) {
    console.warn("[identity] register failed:", error.message);
    // Fall back to whatever code we showed last time, so the Setup screen is
    // still useful on a plane.
    return AsyncStorage.getItem(CODE_KEY);
  }

  const code = (data as any)?.claim_code as string | undefined;
  if (code) await AsyncStorage.setItem(CODE_KEY, code);
  return code ?? null;
}

export async function getCachedClaimCode(): Promise<string | null> {
  return AsyncStorage.getItem(CODE_KEY);
}

export async function fetchBeaconState(): Promise<BeaconState> {
  const token = await getDeviceToken();
  const { data, error } = await supabase.rpc("beacon_state", { p_token: token });
  if (error) return { ok: false, error: error.message };
  return (data as BeaconState) ?? { ok: false, error: "empty_response" };
}

export async function fetchBeaconEvents(): Promise<BeaconEvent[]> {
  const token = await getDeviceToken();
  const { data, error } = await supabase.rpc("beacon_events", { p_token: token });
  if (error) {
    console.warn("[identity] events failed:", error.message);
    return [];
  }
  return (data as BeaconEvent[]) ?? [];
}

export async function setBeaconEvent(eventId: string | null) {
  const token = await getDeviceToken();
  const { data, error } = await supabase.rpc("beacon_set_event", {
    p_token: token,
    p_event_id: eventId,
  });
  if (error) return { ok: false, error: error.message };
  return data as { ok: boolean; error?: string; participant_id?: string };
}

/** Settings → delete device data. The server row is orphaned, not deleted. */
export async function forgetDevice(): Promise<void> {
  try {
    if (Platform.OS !== "web") await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // ignore
  }
  await AsyncStorage.multiRemove([TOKEN_KEY, CODE_KEY]);
}

export const CLAIM_URL_BASE = "https://waypointtracking.com/claim";

export function claimUrlFor(code: string): string {
  return `${CLAIM_URL_BASE}?code=${encodeURIComponent(code)}`;
}
