"use client";
export const dynamic = "force-dynamic";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";

const supabase = getSupabaseClient();

export default function CreateEventPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [riderClasses, setRiderClasses] = useState<string[]>([]);
  const [classInput, setClassInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const classInputRef = useRef<HTMLInputElement>(null);

  function addClass() {
    const val = classInput.trim();
    if (!val || riderClasses.includes(val)) { setClassInput(""); return; }
    setRiderClasses((prev) => [...prev, val]);
    setClassInput("");
    classInputRef.current?.focus();
  }

  function removeClass(cls: string) {
    setRiderClasses((prev) => prev.filter((c) => c !== cls));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError("");

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push("/auth/login"); return; }

    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        name: name.trim(),
        description: description.trim() || undefined,
        rider_classes: riderClasses,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      setError(err.error ?? "Failed to create event");
      setSubmitting(false);
      return;
    }

    const event = await res.json();
    router.push(`/dashboard/events/${event.id}`);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f7f7f7", fontFamily: "system-ui, sans-serif" }}>
      <nav style={{ background: "#1a2129", padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/dashboard" style={{ color: "#fff", fontWeight: 700, fontSize: 15, letterSpacing: 1, textTransform: "uppercase", textDecoration: "none" }}>
          Waypoint
        </Link>
        <Link href="/dashboard" style={{ color: "#8a9ab0", fontSize: 12, textDecoration: "none" }}>
          ← Back to Dashboard
        </Link>
      </nav>

      <div style={{ maxWidth: 520, margin: "60px auto", padding: "0 24px" }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#9a9a9a", textTransform: "uppercase", margin: "0 0 6px" }}>Group Rides</p>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: "#1a2129", margin: "0 0 32px" }}>Create Event</h1>

        <form onSubmit={handleSubmit} style={{ background: "#fff", border: "1px solid #e6e6e6", padding: 32 }}>

          {/* Name */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#6b6b6b", textTransform: "uppercase", marginBottom: 8 }}>
              Event Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Baja 500 Recon Ride"
              required
              autoFocus
              style={{ width: "100%", padding: "12px 14px", border: "1px solid #d4d4d4", fontSize: 15, color: "#1a2129", outline: "none", boxSizing: "border-box" }}
            />
          </div>

          {/* Description */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#6b6b6b", textTransform: "uppercase", marginBottom: 8 }}>
              Description <span style={{ fontWeight: 300, textTransform: "none", letterSpacing: 0 }}>(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Route details, meeting point, start time..."
              rows={3}
              style={{ width: "100%", padding: "12px 14px", border: "1px solid #d4d4d4", fontSize: 14, color: "#1a2129", outline: "none", resize: "vertical", fontFamily: "system-ui", boxSizing: "border-box" }}
            />
          </div>

          {/* Classes */}
          <div style={{ marginBottom: 32 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#6b6b6b", textTransform: "uppercase", marginBottom: 8 }}>
              Classes <span style={{ fontWeight: 300, textTransform: "none", letterSpacing: 0 }}>(optional)</span>
            </label>
            <p style={{ fontSize: 12, color: "#9a9a9a", margin: "0 0 10px", lineHeight: 1.5 }}>
              Define the class options riders pick from when joining. Leave empty to skip the class field entirely.
            </p>

            {/* Existing chips */}
            {riderClasses.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                {riderClasses.map((cls) => (
                  <div
                    key={cls}
                    style={{ display: "flex", alignItems: "center", gap: 6, background: "#1c69d4", color: "#fff", padding: "5px 10px 5px 12px", fontSize: 12, fontWeight: 700 }}
                  >
                    {cls}
                    <button
                      type="button"
                      onClick={() => removeClass(cls)}
                      style={{ background: "none", border: "none", color: "#cce0ff", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0 }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add class input */}
            <div style={{ display: "flex", gap: 8 }}>
              <input
                ref={classInputRef}
                type="text"
                value={classInput}
                onChange={(e) => setClassInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addClass(); } }}
                placeholder="e.g. Moto, UTV, Car, Truck…"
                style={{ flex: 1, padding: "10px 14px", border: "1px solid #d4d4d4", fontSize: 14, color: "#1a2129", outline: "none" }}
              />
              <button
                type="button"
                onClick={addClass}
                disabled={!classInput.trim()}
                style={{
                  background: classInput.trim() ? "#1a2129" : "#d4d4d4",
                  color: "#fff", border: "none", padding: "10px 18px",
                  fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
                  textTransform: "uppercase", cursor: classInput.trim() ? "pointer" : "default",
                }}
              >
                Add
              </button>
            </div>
          </div>

          {error && <p style={{ color: "#cc3300", fontSize: 13, marginBottom: 16 }}>{error}</p>}

          <div style={{ display: "flex", gap: 12 }}>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              style={{
                flex: 1, background: name.trim() ? "#1c69d4" : "#d4d4d4",
                color: "#fff", padding: "13px", border: "none",
                fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase",
                cursor: name.trim() && !submitting ? "pointer" : "default",
              }}
            >
              {submitting ? "Creating..." : "Create Event"}
            </button>
            <Link
              href="/dashboard"
              style={{ background: "transparent", color: "#6b6b6b", border: "1px solid #e6e6e6", padding: "13px 20px", fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", textDecoration: "none" }}
            >
              Cancel
            </Link>
          </div>

          <p style={{ fontSize: 12, color: "#9a9a9a", marginTop: 20, lineHeight: 1.6 }}>
            After creating the event, you'll get a 6-character join code to share with your riders.
          </p>
        </form>
      </div>
    </div>
  );
}
