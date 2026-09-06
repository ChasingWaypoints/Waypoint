"use client";
import { text } from "../../../lib/theme";
export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";

const supabase = getSupabaseClient();

export default function LoginPage() {
  const router = useRouter();
  const [nextUrl, setNextUrl] = useState("/dashboard");
  useEffect(() => { const n = new URLSearchParams(window.location.search).get("next"); if (n && n.startsWith("/")) setNextUrl(n); }, []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
      } else {
        window.location.href = nextUrl.startsWith("/") ? nextUrl : "/dashboard";
      }
    } catch (err) {
      console.error("[login] threw:", err);
      setError(err instanceof Error ? err.message : "Login failed — check console");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", backgroundImage: "linear-gradient(180deg, rgba(10,10,10,0.72), rgba(10,10,10,0.9)), url(/hero.jpg)", backgroundSize: "cover", backgroundPosition: "center", backgroundAttachment: "fixed", display: "flex", flexDirection: "column", fontFamily: "system-ui, sans-serif" }}>
      {/* Nav */}
      <nav style={{ background: "#0C1E29", padding: "0 24px", height: 56, display: "flex", alignItems: "center" }}>
        <Link href="/" style={{ color: "#fff", fontWeight: 700, fontSize: text.lg, letterSpacing: 1, textTransform: "uppercase", textDecoration: "none" }}>
          Waypoint
        </Link>
      </nav>

      {/* Form */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ background: "#0C1E29", border: "1px solid #1E3B4C", padding: 40, width: "100%", maxWidth: 400 }}>
          <p style={{ fontSize: text.xs, fontWeight: 700, letterSpacing: 1.5, color: "#7E93A0", textTransform: "uppercase", margin: "0 0 8px" }}>
            Waypoint
          </p>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#FFFFFF", margin: "0 0 32px" }}>Sign In</h1>

          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ fontSize: text.xs, fontWeight: 700, letterSpacing: 1.5, color: "#7E93A0", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                style={{ width: "100%", border: "1px solid #1E3B4C", padding: "12px 14px", fontSize: text.lg, outline: "none", borderRadius: 0, boxSizing: "border-box", fontFamily: "inherit" }}
              />
            </div>

            <div>
              <label style={{ fontSize: text.xs, fontWeight: 700, letterSpacing: 1.5, color: "#7E93A0", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{ width: "100%", border: "1px solid #1E3B4C", padding: "12px 14px", fontSize: text.lg, outline: "none", borderRadius: 0, boxSizing: "border-box", fontFamily: "inherit" }}
              />
            </div>

            {error && (
              <p style={{ color: "#FF3B30", fontSize: text.base, margin: 0 }}>{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{ background: "#CCFF00", color: "#0C1E29", border: "none", padding: "14px", fontWeight: 700, fontSize: text.base, letterSpacing: 0.8, textTransform: "uppercase", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1, borderRadius: 0, fontFamily: "inherit" }}
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <p style={{ fontSize: text.base, color: "#7E93A0", textAlign: "center", margin: "24px 0 0" }}>
            No account?{" "}
            <Link href="/auth/signup" style={{ color: "#FFFE15", fontWeight: 700, textDecoration: "none" }}>
              Create one free
            </Link>
          </p>
          <p style={{ fontSize: text.sm, color: "#54697A", textAlign: "center", margin: "14px 0 0" }}>
            <Link href="/terms" style={{ color: "#7E93A0", textDecoration: "none" }}>Terms</Link>
            {"  ·  "}
            <Link href="/privacy" style={{ color: "#7E93A0", textDecoration: "none" }}>Privacy</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
