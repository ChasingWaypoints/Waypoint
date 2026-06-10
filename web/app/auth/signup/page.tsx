"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSent(true);
    }
  }

  if (sent) {
    return (
      <div style={{ minHeight: "100vh", background: "#f7f7f7", display: "flex", flexDirection: "column", fontFamily: "system-ui, sans-serif" }}>
        <nav style={{ background: "#1a2129", padding: "0 24px", height: 56, display: "flex", alignItems: "center" }}>
          <Link href="/" style={{ color: "#fff", fontWeight: 700, fontSize: 15, letterSpacing: 1, textTransform: "uppercase", textDecoration: "none" }}>Waypoint</Link>
        </nav>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#fff", border: "1px solid #e6e6e6", padding: 40, width: "100%", maxWidth: 400, textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>📬</div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1a2129", margin: "0 0 12px" }}>Check your email</h1>
            <p style={{ fontSize: 14, color: "#6b6b6b", lineHeight: 1.6, margin: "0 0 24px" }}>
              We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account, then sign in.
            </p>
            <Link
              href="/auth/login"
              style={{ display: "inline-block", background: "#1c69d4", color: "#fff", padding: "12px 28px", fontWeight: 700, fontSize: 12, letterSpacing: 0.8, textTransform: "uppercase", textDecoration: "none" }}
            >
              Go to Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f7f7f7", display: "flex", flexDirection: "column", fontFamily: "system-ui, sans-serif" }}>
      {/* Nav */}
      <nav style={{ background: "#1a2129", padding: "0 24px", height: 56, display: "flex", alignItems: "center" }}>
        <Link href="/" style={{ color: "#fff", fontWeight: 700, fontSize: 15, letterSpacing: 1, textTransform: "uppercase", textDecoration: "none" }}>
          Waypoint
        </Link>
      </nav>

      {/* Form */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ background: "#fff", border: "1px solid #e6e6e6", padding: 40, width: "100%", maxWidth: 400 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#9a9a9a", textTransform: "uppercase", margin: "0 0 8px" }}>
            Waypoint
          </p>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1a2129", margin: "0 0 8px" }}>Create Account</h1>
          <p style={{ fontSize: 14, color: "#6b6b6b", margin: "0 0 32px", fontWeight: 300 }}>Free to start. No credit card required.</p>

          <form onSubmit={handleSignup} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#6b6b6b", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                style={{ width: "100%", border: "1px solid #e6e6e6", padding: "12px 14px", fontSize: 15, outline: "none", borderRadius: 0, boxSizing: "border-box", fontFamily: "inherit" }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#6b6b6b", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
                required
                style={{ width: "100%", border: "1px solid #e6e6e6", padding: "12px 14px", fontSize: 15, outline: "none", borderRadius: 0, boxSizing: "border-box", fontFamily: "inherit" }}
              />
            </div>

            {error && (
              <p style={{ color: "#dc2626", fontSize: 13, margin: 0 }}>{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{ background: "#1c69d4", color: "#fff", border: "none", padding: "14px", fontWeight: 700, fontSize: 13, letterSpacing: 0.8, textTransform: "uppercase", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1, borderRadius: 0, fontFamily: "inherit" }}
            >
              {loading ? "Creating account..." : "Create Free Account"}
            </button>
          </form>

          <p style={{ fontSize: 13, color: "#6b6b6b", textAlign: "center", margin: "24px 0 0" }}>
            Already have one?{" "}
            <Link href="/auth/login" style={{ color: "#1c69d4", fontWeight: 700, textDecoration: "none" }}>
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
