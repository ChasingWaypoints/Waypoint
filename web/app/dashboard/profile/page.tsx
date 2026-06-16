"use client";
export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";

const supabase = getSupabaseClient();

// ── Types ────────────────────────────────────────────────────────────────────

interface Device {
  id: string;
  name: string;
  type: "garmin" | "spot" | "zoleo";
  is_active: boolean;
  last_polled_at: string | null;
  poll_error: string | null;
  feed_url?: string;
}

type DeviceType = "garmin" | "spot" | "zoleo";

const DEVICE_META: Record<DeviceType, { label: string; icon: string; placeholder: string; fieldLabel: string; hint: string; steps: string[] }> = {
  garmin: {
    label: "Garmin inReach",
    icon: "🛰️",
    placeholder: "share.garmin.com/p/AbCdEfGh",
    fieldLabel: "MapShare URL",
    hint: "Find this in Garmin Explore → your device → MapShare.",
    steps: [
      "Open Garmin Explore (explore.garmin.com) and sign in.",
      "Go to your device → MapShare → Enable MapShare.",
      "Copy your MapShare link: share.garmin.com/p/XYZ",
      "Paste it below.",
    ],
  },
  spot: {
    label: "SPOT Tracker",
    icon: "📡",
    placeholder: "0ZrtAbCdEfGhIjKl",
    fieldLabel: "SPOT Feed ID",
    hint: "Find this at findmespot.com → My Account → your device → Shared Page tab.",
    steps: [
      "Sign in at findmespot.com → My Account.",
      "Select your device → open the Shared Page tab.",
      'Enable the shared page. Your Feed ID appears in the URL: sharepoint.findmespot.com/shared/?type=0&deviceId=XXXXXXXX',
      "Copy that ID and paste it below.",
    ],
  },
  zoleo: {
    label: "ZOLEO",
    icon: "🔵",
    placeholder: "zoleo.com/tracking/AbCdEfGhIjKl",
    fieldLabel: "ZOLEO Tracking Link",
    hint: "Open the ZOLEO app → person icon → Share My Location → copy link.",
    steps: [
      "Open the ZOLEO app and sign in.",
      "Tap the person icon → Share My Location.",
      "Enable sharing and copy your tracking link.",
      "Paste the full link below.",
    ],
  },
};

const POLL_OPTIONS: Record<DeviceType, { label: string; value: number; note: string }[]> = {
  garmin: [
    { label: "2 min", value: 2, note: "Premium plan" },
    { label: "3 min", value: 3, note: "Recommended" },
    { label: "5 min", value: 5, note: "Standard" },
    { label: "10 min", value: 10, note: "Basic" },
  ],
  spot: [
    { label: "5 min", value: 5, note: "Standard" },
    { label: "10 min", value: 10, note: "Recommended" },
    { label: "30 min", value: 30, note: "Battery saver" },
  ],
  zoleo: [
    { label: "5 min", value: 5, note: "Real-time" },
    { label: "10 min", value: 10, note: "Recommended" },
    { label: "30 min", value: 30, note: "Battery saver" },
  ],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#9a9a9a", textTransform: "uppercase", margin: "0 0 12px" }}>
      {children}
    </p>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#6b6b6b", textTransform: "uppercase", marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const INPUT: React.CSSProperties = {
  width: "100%", padding: "11px 14px", border: "1px solid #d4d4d4",
  fontSize: 14, color: "#1a2129", outline: "none", boxSizing: "border-box",
  fontFamily: "system-ui",
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [memberSince, setMemberSince] = useState("");

  // Profile
  const [displayName, setDisplayName] = useState("");
  const [savedName, setSavedName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // Devices
  const [devices, setDevices] = useState<Device[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string; testing: boolean }>>({});

  // Add device form
  const [addOpen, setAddOpen] = useState(false);
  const [addType, setAddType] = useState<DeviceType>("garmin");
  const [addName, setAddName] = useState("");
  const [addFeedValue, setAddFeedValue] = useState("");
  const [addFeedPassword, setAddFeedPassword] = useState("");
  const [addPoll, setAddPoll] = useState(3);
  const [addError, setAddError] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  const headers = (t: string) => ({ "Content-Type": "application/json", Authorization: `Bearer ${t}` });

  // ── Auth + initial load ──────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push("/auth/login"); return; }
      setToken(session.access_token);
      setUserEmail(session.user.email ?? "");
      setMemberSince(new Date(session.user.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" }));
      const name = session.user.user_metadata?.full_name ?? session.user.user_metadata?.name ?? "";
      setDisplayName(name);
      setSavedName(name);
      loadDevices(session.access_token);
    });
  }, []);

  async function loadDevices(t: string) {
    setDevicesLoading(true);
    const res = await fetch("/api/devices", { headers: { Authorization: `Bearer ${t}` } });
    if (res.ok) setDevices(await res.json());
    setDevicesLoading(false);
  }

  // ── Profile actions ──────────────────────────────────────────────
  async function saveName() {
    if (!displayName.trim() || displayName.trim() === savedName) return;
    setSavingName(true);
    const { error } = await supabase.auth.updateUser({ data: { full_name: displayName.trim() } });
    setSavingName(false);
    if (!error) { setSavedName(displayName.trim()); setNameSaved(true); setTimeout(() => setNameSaved(false), 2500); }
  }

  async function sendPasswordReset() {
    if (!userEmail) return;
    await supabase.auth.resetPasswordForEmail(userEmail);
    setResetSent(true);
  }

  // ── Device actions ───────────────────────────────────────────────
  async function removeDevice(id: string) {
    if (!confirm("Remove this device? Your trip history will be kept.")) return;
    await fetch(`/api/devices/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    setDevices((prev) => prev.filter((d) => d.id !== id));
  }

  async function testDevice(id: string) {
    setTestResults((prev) => ({ ...prev, [id]: { ok: false, message: "", testing: true } }));
    const res = await fetch(`/api/devices/${id}/test`, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    setTestResults((prev) => ({ ...prev, [id]: { ok: json.ok, message: json.message, testing: false } }));
  }

  function openAddForm(type: DeviceType) {
    setAddType(type);
    setAddName(DEVICE_META[type].label);
    setAddFeedValue("");
    setAddFeedPassword("");
    setAddPoll(POLL_OPTIONS[type][1]?.value ?? POLL_OPTIONS[type][0].value);
    setAddError("");
    setAddOpen(true);
  }

  function closeAdd() {
    setAddOpen(false);
    setAddError("");
  }

  async function submitDevice() {
    const meta = DEVICE_META[addType];
    if (!addFeedValue.trim()) { setAddError(`Please enter your ${meta.fieldLabel}.`); return; }
    setAddLoading(true);
    setAddError("");

    // Build the body matching what mobile does
    let body: Record<string, unknown> = {
      name: addName.trim() || meta.label,
      type: addType,
      poll_interval_minutes: addPoll,
    };

    if (addType === "garmin") {
      let url = addFeedValue.trim();
      if (!url.startsWith("http")) url = `https://${url}`;
      if (!url.includes("garmin.com")) { setAddError("Doesn't look like a Garmin MapShare URL."); setAddLoading(false); return; }
      body.feed_url = url;
    } else if (addType === "spot") {
      const id = addFeedValue.trim();
      if (id.length < 6) { setAddError("Feed ID looks too short — double-check it."); setAddLoading(false); return; }
      const feedUrl = `https://api.findmespot.com/spot-main-web/consumer/rest-api/2.0/public/feed/${id}/message.xml${addFeedPassword ? `?feedPassword=${encodeURIComponent(addFeedPassword)}` : ""}`;
      body.feed_url = feedUrl;
      body.feed_id = id;
      if (addFeedPassword) body.feed_password = addFeedPassword;
    } else if (addType === "zoleo") {
      let url = addFeedValue.trim();
      if (!url.startsWith("http")) url = `https://${url}`;
      if (!url.includes("zoleo.com")) { setAddError("Doesn't look like a ZOLEO tracking link."); setAddLoading(false); return; }
      body.feed_url = url;
    }

    const res = await fetch("/api/devices", {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setAddLoading(false);

    if (!res.ok) { setAddError(json.error ?? "Failed to connect device."); return; }
    setDevices((prev) => [json, ...prev]);
    closeAdd();
  }

  // ── Render ───────────────────────────────────────────────────────
  const nameChanged = displayName.trim() !== savedName;

  return (
    <div style={{ minHeight: "100vh", background: "#f7f7f7", fontFamily: "system-ui, sans-serif" }}>

      {/* Nav */}
      <nav style={{ background: "#1a2129", padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/" style={{ color: "#fff", fontWeight: 700, fontSize: 15, letterSpacing: 1, textTransform: "uppercase", textDecoration: "none" }}>
          Waypoint
        </Link>
        <Link href="/dashboard" style={{ color: "#8a9ab0", fontSize: 12, textDecoration: "none" }}>
          ← Dashboard
        </Link>
      </nav>

      <div style={{ maxWidth: 640, margin: "48px auto", padding: "0 24px" }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#9a9a9a", textTransform: "uppercase", margin: "0 0 6px" }}>Account</p>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: "#1a2129", margin: "0 0 36px" }}>Profile &amp; Devices</h1>

        {/* ── Profile ── */}
        <div style={{ marginBottom: 48 }}>
          <SectionLabel>Profile</SectionLabel>
          <div style={{ background: "#fff", border: "1px solid #e6e6e6", padding: 28 }}>
            <Field label="Display Name">
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  style={{ ...INPUT, flex: 1 }}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveName(); }}
                  placeholder="Your name"
                />
                <button
                  onClick={saveName}
                  disabled={!nameChanged || savingName}
                  style={{
                    background: nameChanged ? (nameSaved ? "#22c55e" : "#1c69d4") : "#d4d4d4",
                    color: "#fff", border: "none", padding: "11px 20px",
                    fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase",
                    cursor: nameChanged ? "pointer" : "default",
                    whiteSpace: "nowrap",
                  }}
                >
                  {savingName ? "Saving…" : nameSaved ? "Saved ✓" : "Save"}
                </button>
              </div>
              <p style={{ fontSize: 11, color: "#9a9a9a", margin: "6px 0 0" }}>
                This is how you appear on group event maps.
              </p>
            </Field>

            <Field label="Email">
              <p style={{ fontSize: 14, color: "#6b6b6b", margin: 0, padding: "11px 0" }}>{userEmail}</p>
            </Field>

            <div style={{ borderTop: "1px solid #e6e6e6", paddingTop: 20 }}>
              {resetSent ? (
                <p style={{ fontSize: 13, color: "#22c55e", margin: 0 }}>
                  ✓ Reset email sent to {userEmail}
                </p>
              ) : (
                <button
                  onClick={sendPasswordReset}
                  style={{ background: "transparent", border: "1px solid #e6e6e6", color: "#6b6b6b", padding: "9px 18px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer" }}
                >
                  Send Password Reset Email
                </button>
              )}
            </div>

            <p style={{ fontSize: 11, color: "#c4c4c4", margin: "20px 0 0" }}>Member since {memberSince}</p>
          </div>
        </div>

        {/* ── Devices ── */}
        <div>
          <SectionLabel>Satellite Devices</SectionLabel>

          {/* Add device buttons */}
          {!addOpen && (
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {(["garmin", "spot", "zoleo"] as DeviceType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => openAddForm(t)}
                  style={{
                    flex: 1, background: "#fff", border: "1px solid #d4d4d4",
                    padding: "12px 8px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
                    textTransform: "uppercase", cursor: "pointer", color: "#1a2129",
                  }}
                >
                  {DEVICE_META[t].icon} + {DEVICE_META[t].label}
                </button>
              ))}
            </div>
          )}

          {/* Add device form */}
          {addOpen && (
            <div style={{ background: "#fff", border: "1px solid #1c69d4", padding: 28, marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: "#1a2129", margin: 0 }}>
                  {DEVICE_META[addType].icon} Connect {DEVICE_META[addType].label}
                </p>
                <button onClick={closeAdd} style={{ background: "none", border: "none", color: "#9a9a9a", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>✕</button>
              </div>

              {/* Steps */}
              <div style={{ background: "#f7f7f7", border: "1px solid #e6e6e6", padding: "16px 20px", marginBottom: 24 }}>
                {DEVICE_META[addType].steps.map((step, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, marginBottom: i < DEVICE_META[addType].steps.length - 1 ? 10 : 0 }}>
                    <span style={{ width: 20, height: 20, background: "#1c69d4", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {i + 1}
                    </span>
                    <p style={{ fontSize: 12, color: "#4a4a4a", margin: 0, lineHeight: 1.6 }}>{step}</p>
                  </div>
                ))}
              </div>

              <Field label="Device Name">
                <input style={INPUT} value={addName} onChange={(e) => setAddName(e.target.value)} />
              </Field>

              {/* Poll interval */}
              <Field label="Poll Interval">
                <div style={{ display: "flex", gap: 6 }}>
                  {POLL_OPTIONS[addType].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setAddPoll(opt.value)}
                      style={{
                        flex: 1, padding: "10px 4px", border: "1px solid", borderRadius: 0,
                        borderColor: addPoll === opt.value ? "#1c69d4" : "#e6e6e6",
                        background: addPoll === opt.value ? "#1c69d4" : "#fff",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: addPoll === opt.value ? "#fff" : "#1a2129" }}>{opt.label}</div>
                      <div style={{ fontSize: 10, color: addPoll === opt.value ? "#cce0ff" : "#9a9a9a", marginTop: 2 }}>{opt.note}</div>
                    </button>
                  ))}
                </div>
              </Field>

              <Field label={DEVICE_META[addType].fieldLabel}>
                <input
                  style={INPUT}
                  value={addFeedValue}
                  onChange={(e) => setAddFeedValue(e.target.value)}
                  placeholder={DEVICE_META[addType].placeholder}
                  autoCapitalize="off"
                  autoCorrect="off"
                />
                <p style={{ fontSize: 11, color: "#9a9a9a", margin: "6px 0 0" }}>{DEVICE_META[addType].hint}</p>
              </Field>

              {addType === "spot" && (
                <Field label="Feed Password (optional)">
                  <input
                    style={INPUT}
                    type="password"
                    value={addFeedPassword}
                    onChange={(e) => setAddFeedPassword(e.target.value)}
                    placeholder="Only if you set one in SPOT"
                  />
                </Field>
              )}

              {addError && <p style={{ color: "#cc3300", fontSize: 13, marginBottom: 12 }}>{addError}</p>}

              <button
                onClick={submitDevice}
                disabled={addLoading}
                style={{
                  width: "100%", background: addLoading ? "#d4d4d4" : "#1c69d4", color: "#fff",
                  border: "none", padding: "13px", fontSize: 12, fontWeight: 700,
                  letterSpacing: 0.5, textTransform: "uppercase", cursor: addLoading ? "default" : "pointer",
                }}
              >
                {addLoading ? "Connecting…" : "Connect Device"}
              </button>
            </div>
          )}

          {/* Device list */}
          {devicesLoading ? (
            <div style={{ background: "#fff", border: "1px solid #e6e6e6", padding: "24px", textAlign: "center", color: "#9a9a9a", fontSize: 13 }}>
              Loading devices…
            </div>
          ) : devices.length === 0 ? (
            <div style={{ background: "#fff", border: "1px solid #e6e6e6", padding: "32px", textAlign: "center" }}>
              <p style={{ fontSize: 24, margin: "0 0 8px" }}>📡</p>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#1a2129", margin: "0 0 6px" }}>No satellite devices connected</p>
              <p style={{ fontSize: 12, color: "#9a9a9a", margin: 0 }}>Add a Garmin inReach, SPOT, or ZOLEO above to track your location during trips.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 1, background: "#e6e6e6", border: "1px solid #e6e6e6" }}>
              {devices.map((device) => {
                const meta = DEVICE_META[device.type as DeviceType];
                const test = testResults[device.id];
                return (
                  <div key={device.id} style={{ background: "#fff", padding: "16px 20px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 22 }}>{meta?.icon ?? "📡"}</span>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: "#1a2129", margin: 0 }}>{device.name}</p>
                        <p style={{ fontSize: 11, color: "#9a9a9a", margin: "2px 0 0" }}>
                          {meta?.label ?? device.type}
                          {device.last_polled_at && ` · Last polled ${new Date(device.last_polled_at).toLocaleTimeString()}`}
                        </p>
                        {device.poll_error && (
                          <p style={{ fontSize: 11, color: "#cc3300", margin: "3px 0 0" }}>⚠ {device.poll_error}</p>
                        )}
                        {test && !test.testing && (
                          <p style={{ fontSize: 11, color: test.ok ? "#16a34a" : "#cc3300", margin: "4px 0 0", fontWeight: 600 }}>
                            {test.ok ? "✓" : "✗"} {test.message}
                          </p>
                        )}
                        {test?.testing && (
                          <p style={{ fontSize: 11, color: "#9a9a9a", margin: "4px 0 0" }}>Testing connection…</p>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => testDevice(device.id)}
                          disabled={test?.testing}
                          style={{
                            background: "transparent", border: "1px solid #1c69d4", color: "#1c69d4",
                            padding: "6px 12px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
                            textTransform: "uppercase", cursor: test?.testing ? "default" : "pointer",
                          }}
                        >
                          {test?.testing ? "…" : "Test"}
                        </button>
                        <button
                          onClick={() => removeDevice(device.id)}
                          style={{
                            background: "transparent", border: "1px solid #e6e6e6", color: "#9a9a9a",
                            padding: "6px 12px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
                            textTransform: "uppercase", cursor: "pointer",
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <p style={{ fontSize: 11, color: "#9a9a9a", margin: "12px 0 0", lineHeight: 1.6 }}>
            Waypoint polls your satellite device for location updates during active trips. Use the Test button to confirm your device is on and reporting.
          </p>
        </div>

      </div>
    </div>
  );
}
