"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";

const supabase = getSupabaseClient();

export default function CreateEventPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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
      body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined }),
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
              style={{
                width: "100%", padding: "12px 14px", border: "1px solid #d4d4d4",
                fontSize: 15, color: "#1a2129", outline: "none", boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: 32 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#6b6b6b", textTransform: "uppercase", marginBottom: 8 }}>
              Description <span style={{ fontWeight: 300, textTransform: "none", letterSpacing: 0 }}>(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Route details, meeting point, start time..."
              rows={4}
              style={{
                width: "100%", padding: "12px 14px", border: "1px solid #d4d4d4",
                fontSize: 14, color: "#1a2129", outline: "none", resize: "vertical",
                fontFamily: "system-ui", boxSizing: "border-box",
              }}
            />
          </div>

          {error && (
            <p style={{ color: "#cc3300", fontSize: 13, marginBottom: 16 }}>{error}</p>
          )}

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
              style={{
                background: "transparent", color: "#6b6b6b", border: "1px solid #e6e6e6",
                padding: "13px 20px", fontSize: 12, fontWeight: 700, letterSpacing: 0.5,
                textTransform: "uppercase", textDecoration: "none",
              }}
            >
              Cancel
            </Link>
          </div>

          <p style={{ fontSize: 12, color: "#9a9a9a", marginTop: 20, lineHeight: 1.6 }}>
            After creating the event, you'll get a 6-character join code to share with your riders. They enter it in the Waypoint app to join.
          </p>
        </form>
      </div>
    </div>
  );
}
