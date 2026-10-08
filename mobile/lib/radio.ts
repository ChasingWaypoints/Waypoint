/**
 * radio.ts — Waypoint Comms (live push-to-talk) for the app.
 *
 * Same backend as the web radio: waypointtracking.com/api/comms/*, LiveKit for
 * the audio, Postgres refereeing who may talk. Two ways in:
 *
 *   rider  — the phone's beacon device token. Joining an event in the app (or
 *            claiming a roster row) is all it takes; no code to type.
 *   staff  — a staff or race-control code + name (redeemed once). The personal
 *            radio token it returns is kept in SecureStore and wins over the
 *            device token, so a marshal's phone talks as that marshal.
 *
 * Nothing is queued: no signal means no talking. The app never raises an SOS.
 */

import { Platform, PermissionsAndroid } from "react-native";
import * as SecureStore from "expo-secure-store";
import { getDeviceToken } from "./deviceIdentity";

export const COMMS_BASE = "https://waypointtracking.com";

// LiveKit's WebRTC globals must exist before any Room is created. Native only.
if (Platform.OS !== "web") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { registerGlobals } = require("@livekit/react-native");
  registerGlobals();
}

export type RadioChannelKind = "race_control" | "staff" | "all_riders" | "class";
export type RadioChannel = {
  id: string;
  kind: RadioChannelKind;
  name: string;
  rider_class: string | null;
  can_talk: boolean;
};
export type RadioJoin = {
  url: string;
  token: string;
  room: string;
  identity: string;
  label: string;
  role: string;
  event_id: string;
  event_name: string;
  channels: RadioChannel[];
};
export type StaffRadio = { token: string; event_name: string; label: string; role: "staff" | "control" };
export type Instruction = { transmission_id: string; speaker: string; started_at: string; age_s: number } | null;

const STAFF_KEY = "waypoint.radio.staff";

export async function getStaffRadio(): Promise<StaffRadio | null> {
  try {
    const raw = await SecureStore.getItemAsync(STAFF_KEY);
    return raw ? (JSON.parse(raw) as StaffRadio) : null;
  } catch {
    return null;
  }
}

export async function forgetStaffRadio(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(STAFF_KEY);
  } catch {
    // nothing stored
  }
}

/** The token this phone talks with: a staff code's token if redeemed, else the beacon's. */
export async function radioToken(): Promise<string> {
  const staff = await getStaffRadio();
  return staff?.token ?? (await getDeviceToken());
}

async function post<T>(path: string, body: object): Promise<{ status: number; data: T }> {
  const res = await fetch(`${COMMS_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let data: T;
  try {
    data = (await res.json()) as T;
  } catch {
    data = {} as T;
  }
  return { status: res.status, data };
}

/** "unavailable" carries the server's reason: comms_disabled, invalid_token, event_closed… */
export async function fetchRadioJoin(): Promise<RadioJoin | { unavailable: string }> {
  const token = await radioToken();
  const { status, data } = await post<RadioJoin & { error?: string }>("/api/comms/token", { token });
  if (status === 200) return data;
  return { unavailable: data.error ?? `http_${status}` };
}

export type FloorResult = {
  ok?: boolean;
  granted?: boolean;
  reason?: string | null;
  holder?: string | null;
  error?: string;
  transmission_id?: string | null;
};

export async function requestFloor(channelId: string, priority: boolean): Promise<FloorResult> {
  const token = await radioToken();
  try {
    const { data } = await post<FloorResult>("/api/comms/floor", {
      token, action: "request", channel_id: channelId, priority,
    });
    return data;
  } catch {
    return { error: "network" };
  }
}

export async function releaseFloor(transmissionId: string): Promise<void> {
  const token = await radioToken();
  try {
    await post("/api/comms/floor", { token, action: "release", transmission_id: transmissionId });
  } catch {
    // The server times the hold out after 30 s anyway.
  }
}

export async function fetchInstruction(): Promise<Instruction> {
  const token = await radioToken();
  try {
    const { data } = await post<{ instruction?: Instruction }>("/api/comms/instruction", { token });
    return data.instruction ?? null;
  } catch {
    return null;
  }
}

export const REDEEM_ERRORS: Record<string, string> = {
  unknown_code: "That code doesn't match an event. Check it with the organizer.",
  bad_code: "Codes are 6 letters and numbers.",
  bad_name: "Enter your name (2–40 characters).",
  comms_disabled: "Radio isn't turned on for this event.",
  event_closed: "This event has ended.",
  event_full: "This event's radio is full. Ask the organizer.",
};

export async function redeemStaffCode(code: string, name: string): Promise<StaffRadio | { error: string }> {
  try {
    const { status, data } = await post<StaffRadio & { error?: string }>("/api/comms/redeem", { code, name });
    if (status !== 200 || !data.token) {
      return { error: REDEEM_ERRORS[data.error ?? ""] ?? "Could not join. Try again." };
    }
    const staff: StaffRadio = { token: data.token, event_name: data.event_name, label: data.label, role: data.role };
    await SecureStore.setItemAsync(STAFF_KEY, JSON.stringify(staff), {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
    return staff;
  } catch {
    return { error: "No connection. Try again when you have signal." };
  }
}

/** Android asks at runtime; iOS prompts on first mic use from the Info.plist string. */
export async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
    title: "Microphone for the event radio",
    message: "Waypoint uses the microphone only while you hold the talk button.",
    buttonPositive: "Allow",
  });
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export function ago(seconds: number): string {
  if (seconds < 60) return "just now";
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ${m % 60} min ago`;
}
