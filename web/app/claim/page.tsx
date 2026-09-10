"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { theme, font, text, btnPrimary, input } from "../../lib/theme";
import { LogoMark } from "@/components/LogoMark";

/**
 * Claim a phone beacon.
 *
 * The mobile app generates a 6-char code on first launch and shows it with a QR
 * that deep-links here. A signed-in rider enters (or arrives with) the code and
 * the phone is attached to their Waypoint account — once, forever, no password
 * typed on the phone.
 *
 * The code is not a credential. It only claims a device that nobody owns yet;
 * claim_device_beacon refuses a device already attached to someone else.
 */

type Status = "idle" | "working" | "done" | "error";

function ClaimInner() {
  const supabase = getSupabaseClient();
  const params = useSearchParams();
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    const fromUrl = (params.get("code") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (fromUrl) setCode(fromUrl.slice(0, 6));
  }, [params]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setAuthed(!!session?.user));
  }, [supabase]);

  const claim = useCallback(async () => {
    if (code.length !== 6) {
      setStatus("error");
      setMessage("That code should be 6 characters.");
      return;
    }
    setStatus("working");
    setMessage("");

    const { data, error } = await supabase.rpc("claim_device_beacon", {
      p_claim_code: code,
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    const r = data as { ok: boolean; error?: string };
    if (r?.ok) {
      setStatus("done");
      return;
    }

    setStatus("error");
    setMessage(
      r?.error === "unknown_code"
        ? "No device with that code. Check the app's Phone Beacon screen and try again."
        : r?.error === "already_claimed"
        ? "That phone is already linked to a different Waypoint account."
        : r?.error === "not_authenticated"
        ? "Sign in first, then claim."
        : "Could not claim that device."
    );
  }, [code, supabase]);

  const wrap: React.CSSProperties = {
    minHeight: "100vh",
    background: theme.canvas,
    color: theme.body,
    font: `${text.base}px ${font.sans}`,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  };

  const panelStyle: React.CSSProperties = {
    background: theme.surface,
    border: `1px solid ${theme.hairline}`,
    borderRadius: 12,
    padding: 28,
    width: "100%",
    maxWidth: 420,
    boxSizing: "border-box",
  };

  return (
    <div style={wrap}>
      <nav
        style={{
          width: "100%",
          background: theme.surface,
          borderBottom: `1px solid ${theme.hairline}`,
          padding: "0 16px",
          height: 52,
          display: "flex",
          alignItems: "center",
        }}
      >
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
          <LogoMark />
          <span style={{ color: theme.ink, fontWeight: 700 }}>Waypoint</span>
        </Link>
      </nav>

      <div style={{ padding: "48px 16px", width: "100%", display: "flex", justifyContent: "center" }}>
        <div style={panelStyle}>
          {status === "done" ? (
            <>
              <h1 style={{ color: theme.ink, fontSize: 20, margin: "0 0 8px" }}>Phone linked</h1>
              <p style={{ color: theme.muted, margin: "0 0 24px", lineHeight: 1.6 }}>
                Go back to the app, open <strong style={{ color: theme.body }}>Settings → Use This
                Phone as a Beacon</strong>, and pick the event you want it to feed. Then start
                tracking from the Track tab.
              </p>
              <Link href="/dashboard" style={{ ...btnPrimary, display: "inline-block", textDecoration: "none" }}>
                Go to dashboard
              </Link>
            </>
          ) : (
            <>
              <h1 style={{ color: theme.ink, fontSize: 20, margin: "0 0 8px" }}>Link a phone</h1>
              <p style={{ color: theme.muted, margin: "0 0 24px", lineHeight: 1.6 }}>
                Open Waypoint on the phone, go to Settings → Use This Phone as a Beacon, and enter
                the 6-character code it shows.
              </p>

              {authed === false && (
                <p
                  style={{
                    background: theme.surfaceHi,
                    border: `1px solid ${theme.hairline}`,
                    borderRadius: 8,
                    padding: 12,
                    margin: "0 0 16px",
                    color: theme.body,
                  }}
                >
                  You need to{" "}
                  <Link href={`/auth/login?next=${encodeURIComponent(`/claim?code=${code}`)}`} style={{ color: theme.accent }}>
                    sign in
                  </Link>{" "}
                  before you can link a phone.
                </p>
              )}

              <input
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))
                }
                onKeyDown={(e) => e.key === "Enter" && claim()}
                placeholder="ABC123"
                inputMode="text"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                style={{
                  ...input,
                  width: "100%",
                  boxSizing: "border-box",
                  fontSize: 28,
                  letterSpacing: 8,
                  textAlign: "center",
                  fontFamily: font.mono,
                  padding: "14px 12px",
                }}
              />

              <button
                onClick={claim}
                disabled={status === "working" || authed === false}
                style={{
                  ...btnPrimary,
                  width: "100%",
                  marginTop: 16,
                  padding: "12px 16px",
                  opacity: status === "working" || authed === false ? 0.5 : 1,
                  cursor: status === "working" || authed === false ? "default" : "pointer",
                }}
              >
                {status === "working" ? "Linking…" : "Link this phone"}
              </button>

              {message && (
                <p style={{ color: theme.danger, marginTop: 14, marginBottom: 0, lineHeight: 1.5 }}>
                  {message}
                </p>
              )}

              <p style={{ color: theme.faint, fontSize: text.sm, marginTop: 24, marginBottom: 0, lineHeight: 1.6 }}>
                Linking only attaches the phone to your account. It does not start sharing your
                position — that happens when you start tracking in the app, for the event you choose.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ClaimPage() {
  return (
    <Suspense fallback={null}>
      <ClaimInner />
    </Suspense>
  );
}
