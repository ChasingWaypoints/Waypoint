"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { theme, font, text } from "../../lib/theme";

/**
 * InfoTip — a small "ⓘ" / "?" affordance that reveals a short explanation on
 * click (and on hover for pointer devices). This is the durable, always-on
 * layer of our in-product guidance: it never interrupts anyone, it is there
 * for the returning user as much as the new one, and it costs nothing to leave
 * in place. Use it beside any control whose purpose is not obvious at a glance
 * (roster CSV columns, Google Earth Pro feeds, privacy zones, share options).
 *
 * Deliberately dependency-free and self-contained: it renders a fixed-position
 * bubble anchored to the trigger so it is never clipped by an overflow:hidden
 * parent, and it closes on outside-click, Escape, scroll or resize.
 */

type Props = {
  /** The explanation. Keep it to a sentence or two — a tooltip, not a manual. */
  children: React.ReactNode;
  /** Optional bold lead-in shown above the body (e.g. the control's name). */
  title?: string;
  /** "i" (default) or "?" glyph. */
  glyph?: "i" | "?";
  /** Diameter of the trigger dot in px. */
  size?: number;
  /** Max width of the bubble in px. */
  width?: number;
  /** Accessible label for the trigger button. */
  label?: string;
  /** Extra style for the trigger, e.g. margin. */
  style?: React.CSSProperties;
};

export function InfoTip({
  children,
  title,
  glyph = "i",
  size = 16,
  width = 240,
  label,
  style,
}: Props) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; caret: number } | null>(null);
  const id = useId();

  const show = open || hovered;

  // Position the bubble under the trigger, clamped to the viewport so it never
  // hangs off the edge on a phone. Recomputed whenever it opens.
  useLayoutEffect(() => {
    if (!show || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const margin = 8;
    const half = width / 2;
    let left = r.left + r.width / 2 - half;
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
    const anchorX = r.left + r.width / 2;
    const caret = Math.max(12, Math.min(width - 12, anchorX - left));
    setPos({ top: r.bottom + 8, left, caret });
  }, [show, width]);

  // Dismiss on outside interaction.
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (
        btnRef.current?.contains(e.target as Node) ||
        bubbleRef.current?.contains(e.target as Node)
      )
        return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", () => setOpen(false), true);
    window.addEventListener("resize", () => setOpen(false));
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", () => setOpen(false), true);
      window.removeEventListener("resize", () => setOpen(false));
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={label ?? "More information"}
        aria-expanded={show}
        aria-describedby={show ? id : undefined}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen((v) => !v);
        }}
        onPointerEnter={() => {
          // Hover preview only for fine pointers (mouse), never touch.
          if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) setHovered(true);
        }}
        onPointerLeave={() => setHovered(false)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: size,
          height: size,
          minWidth: size,
          borderRadius: "50%",
          border: `1px solid ${theme.hairline}`,
          background: show ? theme.surfaceHi : "transparent",
          color: show ? theme.ink : theme.muted,
          font: `700 ${Math.round(size * 0.66)}px ${glyph === "i" ? "Georgia, serif" : font.sans}`,
          fontStyle: glyph === "i" ? "italic" : "normal",
          lineHeight: 1,
          cursor: "pointer",
          padding: 0,
          verticalAlign: "middle",
          transition: "background .12s, color .12s",
          ...style,
        }}
      >
        {glyph}
      </button>

      {show && pos && (
        <div
          ref={bubbleRef}
          id={id}
          role="tooltip"
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            width,
            zIndex: 9999,
            background: theme.surface,
            border: `1px solid ${theme.hairline}`,
            borderRadius: 8,
            boxShadow: "0 10px 30px rgba(0,0,0,.55)",
            padding: "10px 12px",
            font: `${text.sm}px/1.5 ${font.sans}`,
            color: theme.body,
          }}
        >
          <span
            style={{
              position: "absolute",
              top: -6,
              left: pos.caret - 6,
              width: 11,
              height: 11,
              background: theme.surface,
              borderLeft: `1px solid ${theme.hairline}`,
              borderTop: `1px solid ${theme.hairline}`,
              transform: "rotate(45deg)",
            }}
          />
          {title && (
            <div style={{ font: `800 ${text.sm}px ${font.sans}`, color: theme.ink, marginBottom: 3 }}>
              {title}
            </div>
          )}
          {children}
        </div>
      )}
    </>
  );
}

export default InfoTip;
