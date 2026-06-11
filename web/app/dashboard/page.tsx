"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";

const supabase = getSupabaseClient();

interface Trip {
  id: string;
  name: string;
  status: string;
  is_public: boolean;
  share_token: string | null;
  started_at: string | null;
  created_at: string;
}

const STATUS_COLOR: Record<string, string> = {
  active: "#22c55e",
  planning: "#1c69d4",
  completed: "#6b6b6b",
  archived: "#9a9a9a",
};

export default function DashboardPage() {
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [userEmail, setUserEmail] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) { window.location.href = "/auth/login"; return; }
      setUserEmail(session.user.email ?? "");
      supabase
        .from("trips")
        .select("id, name, status, is_public, share_token, started_at, created_at")
        .eq("user_id", session.user.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .then(({ data }) => {
          if (data) setTrips(data);
          setLoading(false);
        });
    });
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f7f7f7", fontFamily: "system-ui, sans-serif" }}>
      {/* Nav */}
      <nav style={{ background: "#1a2129", padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/" style={{ color: "#fff", fontWeight: 700, fontSize: 15, letterSpacing: 1, textTransform: "uppercase", textDecoration: "none" }}>
          Waypoint
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ color: "#8a9ab0", fontSize: 13 }}>{userEmail}</span>
          <button
            onClick={signOut}
            style={{ background: "transparent", border: "1px solid #3a4550", color: "#bbbbbb", padding: "6px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer", borderRadius: 0 }}
          >
            Sign Out
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "40px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#9a9a9a", textTransform: "uppercase", margin: "0 0 4px" }}>Your Trips</p>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: "#1a2129", margin: 0 }}>Dashboard</h1>
          </div>
          <div style={{ background: "#e8f0fb", border: "1px solid #c7d9f5", padding: "12px 20px", maxWidth: 340 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#1c69d4", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: 0.5 }}>📱 Use the Mobile App</p>
            <p style={{ fontSize: 12, color: "#4a6fa8", margin: 0, lineHeight: 1.5 }}>
              Start trips and track live from the Waypoint mobile app. This dashboard lets you view and share completed trips.
            </p>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#9a9a9a", fontSize: 14 }}>Loading trips...</div>
        ) : trips.length === 0 ? (
          <div style={{ background: "#fff", border: "1px solid #e6e6e6", padding: "48px 32px", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🗺️</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1a2129", margin: "0 0 8px" }}>No trips yet</h2>
            <p style={{ fontSize: 14, color: "#6b6b6b", margin: "0 0 0", fontWeight: 300 }}>
              Start your first trip in the Waypoint mobile app and it'll appear here.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 1, background: "#e6e6e6", border: "1px solid #e6e6e6" }}>
            {trips.map((trip) => (
              <div key={trip.id} style={{ background: "#fff", padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_COLOR[trip.status] ?? "#9a9a9a", display: "inline-block", flexShrink: 0 }} />
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1a2129", margin: 0 }}>{trip.name}</h3>
                  </div>
                  <p style={{ fontSize: 12, color: "#9a9a9a", margin: 0 }}>
                    {new Date(trip.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    {" · "}
                    <span style={{ fontWeight: 700, color: STATUS_COLOR[trip.status] ?? "#9a9a9a", textTransform: "uppercase", letterSpacing: 0.5 }}>{trip.status}</span>
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {trip.is_public && trip.share_token && (
                    <a
                      href={`/share/${trip.share_token}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ background: "#1c69d4", color: "#fff", padding: "8px 16px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", textDecoration: "none", borderRadius: 0 }}
                    >
                      View Map ↗
                    </a>
                  )}
                  {!trip.is_public && (
                    <span style={{ border: "1px solid #e6e6e6", color: "#9a9a9a", padding: "8px 16px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>
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
  );
}
