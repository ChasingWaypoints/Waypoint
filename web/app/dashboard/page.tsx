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
  join_code: string; my_role: string; created_at: string;
}

const TRIP_STATUS_COLOR: Record<string, string> = {
  active: "#22c55e", planning: "#1c69d4", completed: "#6b6b6b", archived: "#9a9a9a",
};
const EVENT_STATUS_COLOR: Record<string, string> = {
  active: "#22c55e", completed: "#6b6b6b", cancelled: "#cc3300",
};

function Nav({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  return (
    <nav style={{ background: "#1a2129", padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
      <Link href="/" style={{ color: "#fff", fontWeight: 700, fontSize: 15, letterSpacing: 1, textTransform: "uppercase", textDecoration: "none" }}>
        Waypoint
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ color: "#8a9ab0", fontSize: 13 }}>{email}</span>
        <Link
          href="/dashboard/profile"
          style={{ background: "transparent", border: "1px solid #3a4550", color: "#bbbbbb", padding: "6px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", textDecoration: "none" }}
        >
          Profile
        </Link>
        <button
          onClick={onSignOut}
          style={{ background: "transparent", border: "1px solid #3a4550", color: "#bbbbbb", padding: "6px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer" }}
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

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) { window.location.href = "/auth/login"; return; }
      setUserEmail(session.user.email ?? "");

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

  const activeEvents = events.filter((e) => e.status === "active");
  const pastEvents = events.filter((e) => e.status !== "active");

  return (
    <div style={{ minHeight: "100vh", background: "#f7f7f7", fontFamily: "system-ui, sans-serif", display: "flex", flexDirection: "column" }}>
      <Nav email={userEmail} onSignOut={signOut} />

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 24px", width: "100%" }}>

        {/* ── Events ── */}
        <div style={{ marginBottom: 56 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#9a9a9a", textTransform: "uppercase", margin: "0 0 4px" }}>Group Rides</p>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1a2129", margin: 0 }}>Events</h2>
            </div>
            <Link
              href="/dashboard/events/create"
              style={{ background: "#1c69d4", color: "#fff", padding: "10px 20px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", textDecoration: "none" }}
            >
              + Create Event
            </Link>
          </div>

          {loading ? (
            <div style={{ background: "#fff", border: "1px solid #e6e6e6", padding: "32px", textAlign: "center", color: "#9a9a9a", fontSize: 13 }}>Loading...</div>
          ) : events.length === 0 ? (
            <div style={{ background: "#fff", border: "1px solid #e6e6e6", padding: "40px 32px", textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🏁</div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1a2129", margin: "0 0 8px" }}>No events yet</h3>
              <p style={{ fontSize: 13, color: "#6b6b6b", margin: "0 0 20px", fontWeight: 300 }}>
                Create a group event and share a join code with your riders.
              </p>
              <Link
                href="/dashboard/events/create"
                style={{ background: "#1c69d4", color: "#fff", padding: "10px 20px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", textDecoration: "none", display: "inline-block" }}
              >
                Create Your First Event
              </Link>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 1, background: "#e6e6e6", border: "1px solid #e6e6e6" }}>
              {[...activeEvents, ...pastEvents].map((ev) => (
                <div key={ev.id} style={{ background: "#fff", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: EVENT_STATUS_COLOR[ev.status] ?? "#9a9a9a", display: "inline-block" }} />
                      <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1a2129", margin: 0 }}>{ev.name}</h3>
                    </div>
                    <p style={{ fontSize: 12, color: "#9a9a9a", margin: 0 }}>
                      Join code: <strong style={{ color: "#1a2129", letterSpacing: 1 }}>{ev.join_code}</strong>
                      {" · "}
                      <span style={{ fontWeight: 700, color: EVENT_STATUS_COLOR[ev.status] ?? "#9a9a9a", textTransform: "uppercase", letterSpacing: 0.5, fontSize: 11 }}>{ev.status}</span>
                      {" · "}
                      {ev.my_role === "organizer" ? "You are organizer" : "Participant"}
                    </p>
                  </div>
                  <Link
                    href={`/dashboard/events/${ev.id}`}
                    style={{ background: "#1a2129", color: "#fff", padding: "8px 16px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", textDecoration: "none" }}
                  >
                    Manage →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Trips ── */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#9a9a9a", textTransform: "uppercase", margin: "0 0 4px" }}>Your Trips</p>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1a2129", margin: 0 }}>Track History</h2>
            </div>
            <div style={{ background: "#e8f0fb", border: "1px solid #c7d9f5", padding: "10px 16px", maxWidth: 300, fontSize: 12, color: "#4a6fa8", lineHeight: 1.5 }}>
              <strong style={{ color: "#1c69d4" }}>📱 Use the Mobile App</strong> to start trips and track live.
            </div>
          </div>

          {loading ? (
            <div style={{ background: "#fff", border: "1px solid #e6e6e6", padding: "32px", textAlign: "center", color: "#9a9a9a", fontSize: 13 }}>Loading...</div>
          ) : trips.length === 0 ? (
            <div style={{ background: "#fff", border: "1px solid #e6e6e6", padding: "40px 32px", textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🗺️</div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1a2129", margin: "0 0 8px" }}>No trips yet</h3>
              <p style={{ fontSize: 13, color: "#6b6b6b", margin: 0, fontWeight: 300 }}>
                Start your first trip in the Waypoint mobile app — it'll appear here automatically.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 1, background: "#e6e6e6", border: "1px solid #e6e6e6" }}>
              {trips.map((trip) => (
                <div key={trip.id} style={{ background: "#fff", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: TRIP_STATUS_COLOR[trip.status] ?? "#9a9a9a", display: "inline-block" }} />
                      <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1a2129", margin: 0 }}>{trip.name}</h3>
                    </div>
                    <p style={{ fontSize: 12, color: "#9a9a9a", margin: 0 }}>
                      {new Date(trip.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      {" · "}
                      <span style={{ fontWeight: 700, color: TRIP_STATUS_COLOR[trip.status] ?? "#9a9a9a", textTransform: "uppercase", letterSpacing: 0.5, fontSize: 11 }}>{trip.status}</span>
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {trip.is_public && trip.share_token ? (
                      <>
                        <a href={`/share/${trip.share_token}`} target="_blank" rel="noopener noreferrer"
                          style={{ background: "#1c69d4", color: "#fff", padding: "8px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", textDecoration: "none" }}>
                          Live Map ↗
                        </a>
                        <a href={`/share/${trip.share_token}/story`} target="_blank" rel="noopener noreferrer"
                          style={{ background: "transparent", color: "#1a2129", border: "1px solid #e6e6e6", padding: "8px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", textDecoration: "none" }}>
                          Story ↗
                        </a>
                      </>
                    ) : (
                      <span style={{ border: "1px solid #e6e6e6", color: "#9a9a9a", padding: "8px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>
                        Private
                      </span>
                    )}
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
