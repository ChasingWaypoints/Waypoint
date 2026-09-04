"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";

const supabase = getSupabaseClient();

interface Trip {
  id: string; name: string; status: string;
  is_public: boolean; share_token: string | null;
  started_at: string | null; created_at: string;
}

interface Event {
  id: string; name: string; status: string;
  join_code: string; my_role: string; created_at: string; rider_count?: number;
}

const TRIP_STATUS_COLOR: Record<string, string> = {
  active: "#CCFF00", planning: "#FFFE15", completed: "#7E93A0", archived: "#7E93A0",
};
const EVENT_STATUS_COLOR: Record<string, string> = {
  active: "#CCFF00", completed: "#7E93A0", cancelled: "#FF3B30",
};

function Nav({ email, onSignOut, isAdmin }: { email: string; onSignOut: () => void; isAdmin?: boolean }) {
  return (
    <nav style={{ background: "#0C1E29", padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
      <Link href="/" style={{ color: "#fff", fontWeight: 700, fontSize: 15, letterSpacing: 1, textTransform: "uppercase", textDecoration: "none" }}>
        Waypoint
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ color: "#7E93A0", fontSize: 13 }}>{email}</span>
        {isAdmin && (
          <Link
            href="/dashboard/admin"
            style={{ background: "transparent", border: "1px solid #CCFF00", color: "#CCFF00", padding: "6px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", textDecoration: "none" }}
          >
            Admin
          </Link>
        )}
        <Link
          href="/dashboard/profile"
          style={{ background: "transparent", border: "1px solid #3a4550", color: "#C8D4DC", padding: "6px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", textDecoration: "none" }}
        >
          Profile
        </Link>
        <button
          onClick={onSignOut}
          style={{ background: "transparent", border: "1px solid #3a4550", color: "#C8D4DC", padding: "6px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer" }}
        >
          Sign Out
        </button>
      </div>
    </nav>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [userEmail, setUserEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasSub, setHasSub] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) { window.location.href = "/auth/login"; return; }
      setUserEmail(session.user.email ?? "");
      supabase.rpc("am_i_super_admin").then(({ data }) => setIsAdmin(data === true));
      supabase.rpc("user_has_subscription", { p_user_id: session.user.id }).then(({ data }) => setHasSub(data === true));

      const token = session.access_token;

      // Load trips and events in parallel
      const [tripsRes, eventsRes] = await Promise.all([
        supabase
          .from("trips")
          .select("id, name, status, is_public, share_token, started_at, created_at")
          .eq("user_id", session.user.id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
        fetch("/api/events", { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (tripsRes.data) setTrips(tripsRes.data);
      if (eventsRes.ok) setEvents(await eventsRes.json());
      setLoading(false);
    });
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
  }

  async function joinEvent() {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setJoining(true);
    setJoinError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch("/api/events/join", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setJoinError(data.error ?? "Could not join. Check the code and try again.");
        return;
      }
      router.push(`/dashboard/events/${data.event_id}`);
    } catch {
      setJoinError("Something went wrong. Please try again.");
    } finally {
      setJoining(false);
    }
  }

  async function startSubscribe(plan: "annual" | "quarterly") {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/billing/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
      body: JSON.stringify({ plan }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.url) window.location.href = data.url;
    else alert(data.error ?? "Could not start checkout. Please try again.");
  }

  async function deleteTrip(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This removes the trip and its track history. This cannot be undone.`)) return;
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    const res = await fetch(`/api/trips/${id}`, {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      setTrips((prev) => prev.filter((t) => t.id !== id));
    } else {
      alert("Could not delete that trip. Please try again.");
    }
  }

  const activeEvents = events.filter((e) => e.status === "active");
  const pastEvents = events.filter((e) => e.status !== "active");

  return (
    <div style={{ minHeight: "100vh", background: "#0A0A0A", fontFamily: "system-ui, sans-serif", display: "flex", flexDirection: "column" }}>
      <Nav email={userEmail} onSignOut={signOut} isAdmin={isAdmin} />

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 24px", width: "100%" }}>

        {/* ── Events ── */}
        <div style={{ marginBottom: 56 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#7E93A0", textTransform: "uppercase", margin: "0 0 4px" }}>Group Rides</p>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: "#FFFFFF", margin: 0 }}>Events</h2>
            </div>
            <Link
              href="/dashboard/events/create"
              style={{ background: "#CCFF00", color: "#0C1E29", padding: "10px 20px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", textDecoration: "none" }}
            >
              + Create Event
            </Link>
          </div>

          {/* Join with a code — the rider workflow */}
          <div style={{ background: "#0C1E29", border: "1px solid #1E3B4C", padding: "16px 20px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 240px", minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#FFFFFF" }}>Join a ride or event</div>
              <div style={{ fontSize: 12, color: "#7E93A0", marginTop: 2, lineHeight: 1.5 }}>
                Got a join code from an organizer? Enter it to hop on their live map.
              </div>
            </div>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === "Enter") joinEvent(); }}
              placeholder="CODE"
              maxLength={12}
              style={{ width: 130, padding: "9px 12px", border: "1px solid #1E3B4C", background: "#0A0A0A", color: "#FFFFFF", fontSize: 15, fontWeight: 700, letterSpacing: 2, textAlign: "center", outline: "none", textTransform: "uppercase" }}
            />
            <button
              onClick={joinEvent}
              disabled={joining || !joinCode.trim()}
              style={{ background: joinCode.trim() ? "#CCFF00" : "#1E3B4C", color: joinCode.trim() ? "#0C1E29" : "#7E93A0", border: "none", padding: "10px 20px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", cursor: joining || !joinCode.trim() ? "default" : "pointer" }}
            >
              {joining ? "Joining…" : "Join"}
            </button>
            {joinError && <div style={{ flexBasis: "100%", color: "#FF6B6B", fontSize: 12 }}>{joinError}</div>}
          </div>

          {loading ? (
            <div style={{ background: "#0C1E29", border: "1px solid #1E3B4C", padding: "32px", textAlign: "center", color: "#7E93A0", fontSize: 13 }}>Loading...</div>
          ) : events.length === 0 ? (
            <div style={{ background: "#0C1E29", border: "1px solid #1E3B4C", padding: "40px 32px", textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🏁</div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "#FFFFFF", margin: "0 0 8px" }}>No events yet</h3>
              <p style={{ fontSize: 13, color: "#7E93A0", margin: "0 0 20px", fontWeight: 300 }}>
                Create a group event and share a join code with your riders.
              </p>
              <Link
                href="/dashboard/events/create"
                style={{ background: "#CCFF00", color: "#0C1E29", padding: "10px 20px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", textDecoration: "none", display: "inline-block" }}
              >
                Create Your First Event
              </Link>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 1, background: "#1E3B4C", border: "1px solid #1E3B4C" }}>
              {[...activeEvents, ...pastEvents].map((ev) => (
                <div key={ev.id} style={{ background: "#0C1E29", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: EVENT_STATUS_COLOR[ev.status] ?? "#7E93A0", display: "inline-block" }} />
                      <h3 style={{ fontSize: 15, fontWeight: 700, color: "#FFFFFF", margin: 0 }}>{ev.name}</h3>
                      {(() => {
                        const isEvent = (ev.rider_count ?? 0) > 10;
                        return (
                          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: isEvent ? "#CCFF00" : "#7E93A0", border: `1px solid ${isEvent ? "#CCFF00" : "#3a4550"}`, borderRadius: 10, padding: "1px 8px" }}>
                            {isEvent ? "Event" : "Ride"}
                          </span>
                        );
                      })()}
                    </div>
                    <p style={{ fontSize: 12, color: "#7E93A0", margin: 0 }}>
                      {(ev.rider_count ?? 0) <= 10 ? (
                        <>Join code: <strong style={{ color: "#FFFFFF", letterSpacing: 1 }}>{ev.join_code}</strong></>
                      ) : (
                        <>{ev.rider_count} riders</>
                      )}
                      {" · "}
                      <span style={{ fontWeight: 700, color: EVENT_STATUS_COLOR[ev.status] ?? "#7E93A0", textTransform: "uppercase", letterSpacing: 0.5, fontSize: 11 }}>{ev.status}</span>
                      {" · "}
                      {ev.my_role === "organizer" ? "You are organizer" : "Participant"}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {ev.my_role === "organizer" && (
                      <Link
                        href={`/dashboard/events/${ev.id}/track`}
                        style={{ background: "#CCFF00", color: "#0C1E29", padding: "8px 16px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", textDecoration: "none" }}
                      >
                        Tracking
                      </Link>
                    )}
                    <Link
                      href={`/dashboard/events/${ev.id}`}
                      style={{ background: "#CCFF00", color: "#0C1E29", padding: "8px 16px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", textDecoration: "none" }}
                    >
                      Manage →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {hasSub === false && (
          <div style={{ background: "#0C1E29", border: "1px solid #1E3B4C", padding: "18px 20px", marginBottom: 40, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 260px", minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#FFFFFF" }}>Waypoint Personal</div>
              <div style={{ fontSize: 12, color: "#7E93A0", marginTop: 2, lineHeight: 1.5 }}>
                Your own live tracking and a shareable map for family &amp; friends.
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => startSubscribe("annual")} style={{ background: "#CCFF00", color: "#0C1E29", border: "none", padding: "9px 16px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer" }}>$24 / year</button>
              <button onClick={() => startSubscribe("quarterly")} style={{ background: "transparent", color: "#C8D4DC", border: "1px solid #3a4550", padding: "9px 16px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer" }}>$15 / 3 mo</button>
            </div>
          </div>
        )}

        {/* ── Trips ── */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#7E93A0", textTransform: "uppercase", margin: "0 0 4px" }}>Your Trips</p>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: "#FFFFFF", margin: 0 }}>Track History</h2>
            </div>
            <div style={{ background: "#0C1E29", border: "1px solid #1E3B4C", padding: "10px 16px", maxWidth: 320, fontSize: 12, color: "#7E93A0", lineHeight: 1.5 }}>
              Personal trips are recorded from the mobile app. For an event, use <strong style={{ color: "#CCFF00" }}>Create Event</strong> above.
            </div>
          </div>

          {loading ? (
            <div style={{ background: "#0C1E29", border: "1px solid #1E3B4C", padding: "32px", textAlign: "center", color: "#7E93A0", fontSize: 13 }}>Loading...</div>
          ) : trips.length === 0 ? (
            <div style={{ background: "#0C1E29", border: "1px solid #1E3B4C", padding: "40px 32px", textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🗺️</div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "#FFFFFF", margin: "0 0 8px" }}>No trips yet</h3>
              <p style={{ fontSize: 13, color: "#7E93A0", margin: 0, fontWeight: 300 }}>
                Start your first trip in the Waypoint mobile app — it'll appear here automatically.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 1, background: "#1E3B4C", border: "1px solid #1E3B4C" }}>
              {trips.map((trip) => (
                <div key={trip.id} style={{ background: "#0C1E29", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: TRIP_STATUS_COLOR[trip.status] ?? "#7E93A0", display: "inline-block" }} />
                      <h3 style={{ fontSize: 15, fontWeight: 700, color: "#FFFFFF", margin: 0 }}>{trip.name}</h3>
                    </div>
                    <p style={{ fontSize: 12, color: "#7E93A0", margin: 0 }}>
                      {new Date(trip.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      {" · "}
                      <span style={{ fontWeight: 700, color: TRIP_STATUS_COLOR[trip.status] ?? "#7E93A0", textTransform: "uppercase", letterSpacing: 0.5, fontSize: 11 }}>{trip.status}</span>
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {trip.is_public && trip.share_token ? (
                      <>
                        <a href={`/share/${trip.share_token}`} target="_blank" rel="noopener noreferrer"
                          style={{ background: "#CCFF00", color: "#0C1E29", padding: "8px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", textDecoration: "none" }}>
                          Live Map ↗
                        </a>
                        <a href={`/share/${trip.share_token}/story`} target="_blank" rel="noopener noreferrer"
                          style={{ background: "transparent", color: "#FFFFFF", border: "1px solid #1E3B4C", padding: "8px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", textDecoration: "none" }}>
                          Story ↗
                        </a>
                      </>
                    ) : (
                      <span style={{ border: "1px solid #1E3B4C", color: "#7E93A0", padding: "8px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>
                        Private
                      </span>
                    )}
                    <button
                      onClick={() => deleteTrip(trip.id, trip.name)}
                      title="Delete trip and its track history"
                      style={{ background: "transparent", color: "#7E93A0", border: "1px solid #1E3B4C", padding: "8px 12px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer" }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
