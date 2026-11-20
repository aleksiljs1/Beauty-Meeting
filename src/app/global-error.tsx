"use client";

import { useEffect } from "react";
import { publicSite } from "@/i18n/public";

const t = publicSite.error;

// Replaces the root layout, so globals.css and the fonts may not be loaded: inline styles only,
// with the theme colors from globals.css (--background, --foreground, --muted-foreground, --rose).
const colors = { background: "#17120f", foreground: "#eee5da", muted: "#c5ae94", gold: "#d8af50", buttonText: "#21180f" };

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="sq">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          background: colors.background,
          color: colors.foreground,
          fontFamily: "Georgia, 'Times New Roman', serif",
        }}
      >
        <title>{t.title}</title>
        <main role="alert" style={{ width: "100%", maxWidth: 640, margin: "0 auto", padding: "64px 20px", boxSizing: "border-box" }}>
          <p
            style={{
              margin: 0,
              fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: colors.gold,
            }}
          >
            {t.eyebrow}
          </p>
          <h1 style={{ margin: "16px 0 0", fontSize: "clamp(2rem, 8vw, 3rem)", fontWeight: 500, lineHeight: 1.15 }}>{t.title}</h1>
          <p
            style={{
              margin: "20px 0 0",
              fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
              fontSize: 17,
              lineHeight: 1.6,
              color: colors.muted,
            }}
          >
            {t.body}
          </p>
          <div style={{ marginTop: 36, display: "flex", flexWrap: "wrap", gap: 12, fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
            <button
              type="button"
              onClick={() => retry()}
              style={{
                minHeight: 44,
                padding: "0 24px",
                border: 0,
                borderRadius: 8,
                background: colors.foreground,
                color: colors.buttonText,
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {t.retry}
            </button>
            {/* A full page load on purpose: the app shell itself failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                minHeight: 44,
                padding: "0 24px",
                border: `1px solid ${colors.muted}55`,
                borderRadius: 8,
                color: colors.foreground,
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              {t.home}
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
