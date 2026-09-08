"use client";

import { useState } from "react";
import Link from "next/link";
import { LogoMark } from "@/components/LogoMark";

/**
 * Shared marketing-site nav. One row of links on desktop; on mobile the links
 * collapse behind a hamburger so they never wrap into a messy stack. Used on
 * the landing page, guide, how-it-works and pricing.
 */

const LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/guide", label: "Guide" },
  { href: "/pricing", label: "Pricing" },
  { href: "/auth/login", label: "Sign in" },
];

export function SiteNav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <style>{`
        .wpnav { position: relative; z-index: 30; display: flex; align-items: center;
          justify-content: space-between; padding: 16px 22px;
          border-bottom: 1px solid #1E3B4C; background: #0C1E29; }
        /* Fluid brand: logo + wordmark scale with the viewport (bigger on wide
           screens, comfortably smaller on phones) instead of a fixed size. */
        .wpnav-brand { display: inline-flex; align-items: center; gap: clamp(9px, 1vw, 13px);
          color: #fff; font-weight: 800; letter-spacing: 2px; text-transform: uppercase;
          text-decoration: none; font-size: clamp(20px, 2.2vw, 30px); line-height: 1; }
        .wpnav-brand svg { width: clamp(30px, 3.2vw, 44px); height: clamp(30px, 3.2vw, 44px); }
        .wpnav-links { display: flex; align-items: center; gap: 4px; }
        .wpnav-link { color: #C8D4DC; font-size: 15px; font-weight: 600;
          text-decoration: none; padding: 9px 14px; border-radius: 5px; }
        .wpnav-link:hover { color: #fff; background: #14303F; }
        .wpnav-cta { background: #CCFF00; color: #0C1E29; font-size: 15px; font-weight: 800;
          text-decoration: none; padding: 10px 18px; border-radius: 5px;
          letter-spacing: .3px; margin-left: 6px; white-space: nowrap; }
        .wpnav-burger { display: none; background: transparent; border: 1px solid #24445A;
          border-radius: 7px; width: 46px; height: 42px; cursor: pointer;
          align-items: center; justify-content: center; padding: 0; }
        .wpnav-burger svg { display: block; }
        .wpnav-sheet { display: none; }

        @media (max-width: 780px) {
          .wpnav-links { display: none; }
          .wpnav-burger { display: inline-flex; }
          .wpnav-sheet { display: block; position: absolute; top: 100%; left: 0; right: 0;
            z-index: 40; background: #0C1E29; border-bottom: 1px solid #1E3B4C;
            box-shadow: 0 12px 30px rgba(0,0,0,.45); padding: 8px 14px 16px; }
          .wpnav-sheet a { display: block; color: #E6EDF2; font-size: 17px; font-weight: 600;
            text-decoration: none; padding: 14px 10px; border-bottom: 1px solid #14303F; }
          .wpnav-sheet a.cta { margin-top: 12px; background: #CCFF00; color: #0C1E29;
            font-weight: 800; text-align: center; border-radius: 6px; border-bottom: none; }
        }
      `}</style>

      <nav className="wpnav">
        <Link href="/" className="wpnav-brand" onClick={() => setOpen(false)}>
          <LogoMark size={30} /><span>WAY<span style={{ color: "#CCFF00" }}>POINT</span></span>
        </Link>

        {/* Desktop links */}
        <div className="wpnav-links">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="wpnav-link">{l.label}</Link>
          ))}
          <Link href="/auth/signup" className="wpnav-cta">Get started</Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="wpnav-burger"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
              <line x1="3" y1="7" x2="21" y2="7" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="17" x2="21" y2="17" />
            </svg>
          )}
        </button>

        {/* Mobile sheet */}
        {open && (
          <div className="wpnav-sheet">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)}>{l.label}</Link>
            ))}
            <Link href="/auth/signup" className="cta" onClick={() => setOpen(false)}>Get started</Link>
          </div>
        )}
      </nav>
    </>
  );
}
