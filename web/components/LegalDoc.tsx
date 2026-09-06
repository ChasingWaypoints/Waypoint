import Link from "next/link";
import { theme, text } from "../lib/theme";

/**
 * Renders one of our legal documents (Terms, Privacy) from its markdown
 * source into the Waypoint dark theme. Deliberately small: it handles only
 * the constructs these drafts actually use — ##/### headings, a leading >
 * callout, - bullet lists (one level of nesting), --- rules, blank-line
 * paragraphs, and inline **bold**, *italic*, and `code`. Keeping the source
 * as markdown means the site pages never drift from the counsel drafts.
 */

function Inline({ raw }: { raw: string }) {
  // Split on **bold**, `code`, *italic* while keeping delimiters.
  const parts = raw.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**")) {
          return <strong key={i} style={{ color: theme.ink, fontWeight: 700 }}>{p.slice(2, -2)}</strong>;
        }
        if (p.startsWith("`") && p.endsWith("`")) {
          return (
            <code key={i} style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "0.9em", background: theme.surfaceHi, color: theme.body, padding: "1px 5px", borderRadius: 3 }}>
              {p.slice(1, -1)}
            </code>
          );
        }
        if (p.startsWith("*") && p.endsWith("*")) {
          return <em key={i}>{p.slice(1, -1)}</em>;
        }
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

interface Block { type: "h1" | "h2" | "h3" | "p" | "ul" | "quote" | "hr"; lines: string[] }

function parse(md: string): Block[] {
  const src = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < src.length) {
    const line = src[i];
    const t = line.trim();
    if (t === "") { i++; continue; }
    if (t === "---") { blocks.push({ type: "hr", lines: [] }); i++; continue; }
    if (t.startsWith("> ") || t === ">") {
      const lines: string[] = [];
      while (i < src.length && (src[i].trim().startsWith(">"))) {
        lines.push(src[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ type: "quote", lines });
      continue;
    }
    if (t.startsWith("### ")) { blocks.push({ type: "h3", lines: [t.slice(4)] }); i++; continue; }
    if (t.startsWith("## ")) { blocks.push({ type: "h2", lines: [t.slice(3)] }); i++; continue; }
    if (t.startsWith("# ")) { blocks.push({ type: "h1", lines: [t.slice(2)] }); i++; continue; }
    if (t.startsWith("- ")) {
      const lines: string[] = [];
      while (i < src.length && src[i].trim().startsWith("- ")) {
        // fold soft-wrapped continuation lines into the current bullet
        let item = src[i].trim().slice(2);
        i++;
        while (i < src.length && src[i].trim() !== "" && !src[i].trim().startsWith("- ") && !src[i].startsWith("#") && !src[i].trim().startsWith(">")) {
          item += " " + src[i].trim();
          i++;
        }
        lines.push(item);
      }
      blocks.push({ type: "ul", lines });
      continue;
    }
    // paragraph: gather until blank / structural line
    const lines: string[] = [];
    while (i < src.length && src[i].trim() !== "" && !src[i].trim().startsWith("#") && !src[i].trim().startsWith("- ") && !src[i].trim().startsWith(">") && src[i].trim() !== "---") {
      lines.push(src[i].trim());
      i++;
    }
    blocks.push({ type: "p", lines });
  }
  return blocks;
}

export default function LegalDoc({ markdown }: { markdown: string }) {
  const blocks = parse(markdown);
  return (
    <div style={{ minHeight: "100vh", background: theme.canvas, color: theme.body }}>
      <nav style={{ background: theme.surface, padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${theme.hairline}` }}>
        <Link href="/" style={{ color: theme.ink, fontWeight: 700, fontSize: text.lg, letterSpacing: 1, textTransform: "uppercase", textDecoration: "none" }}>Waypoint</Link>
        <div style={{ display: "flex", gap: 18 }}>
          <Link href="/terms" style={{ color: theme.muted, fontSize: text.sm, textDecoration: "none" }}>Terms</Link>
          <Link href="/privacy" style={{ color: theme.muted, fontSize: text.sm, textDecoration: "none" }}>Privacy</Link>
        </div>
      </nav>

      <article style={{ maxWidth: 760, margin: "0 auto", padding: "40px 24px 80px", fontSize: text.md, lineHeight: 1.7 }}>
        {blocks.map((b, i) => {
          switch (b.type) {
            case "h1":
              return <h1 key={i} style={{ fontSize: 30, fontWeight: 800, color: theme.ink, letterSpacing: "-0.3px", margin: "0 0 20px", lineHeight: 1.25 }}><Inline raw={b.lines[0]} /></h1>;
            case "h2":
              return <h2 key={i} style={{ fontSize: text.xl, fontWeight: 700, color: theme.ink, margin: "34px 0 10px", paddingTop: 4, borderTop: `1px solid ${theme.hairlineSoft}`, paddingBottom: 2 }}><span style={{ display: "inline-block", paddingTop: 14 }}><Inline raw={b.lines[0]} /></span></h2>;
            case "h3":
              return <h3 key={i} style={{ fontSize: text.md, fontWeight: 700, color: theme.body, textTransform: "uppercase", letterSpacing: 0.5, margin: "24px 0 8px" }}><Inline raw={b.lines[0]} /></h3>;
            case "hr":
              return <hr key={i} style={{ border: "none", borderTop: `1px solid ${theme.hairline}`, margin: "28px 0" }} />;
            case "quote":
              return (
                <blockquote key={i} style={{ background: theme.surface, border: `1px solid ${theme.hairline}`, borderLeft: `3px solid ${theme.warn}`, borderRadius: 4, padding: "14px 18px", margin: "0 0 24px", color: theme.body, fontSize: text.base }}>
                  {b.lines.map((l, j) => <p key={j} style={{ margin: j === 0 ? 0 : "8px 0 0" }}><Inline raw={l} /></p>)}
                </blockquote>
              );
            case "ul":
              return (
                <ul key={i} style={{ margin: "0 0 16px", paddingLeft: 22, display: "flex", flexDirection: "column", gap: 8 }}>
                  {b.lines.map((l, j) => <li key={j} style={{ lineHeight: 1.6 }}><Inline raw={l} /></li>)}
                </ul>
              );
            default:
              return <p key={i} style={{ margin: "0 0 16px" }}>{b.lines.map((l, j) => <span key={j}><Inline raw={l} />{j < b.lines.length - 1 ? " " : ""}</span>)}</p>;
          }
        })}
      </article>
    </div>
  );
}
