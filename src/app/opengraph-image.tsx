import { ImageResponse } from "next/og";
import { publicSite } from "@/i18n/public";
import { SHOW_BRAND_NAME } from "@/lib/brand";
import { getPublicSettings } from "@/server/queries/public";

// Default social preview for every page. Colors follow globals.css (dark background, gold accent).
export const alt = "Sallon bukurie dhe akademi estetike";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const colors = { background: "#17120f", foreground: "#eee5da", muted: "#c5ae94", gold: "#d8af50" };

async function loadText(): Promise<{ name: string | null; tagline: string | null }> {
  try {
    const settings = await getPublicSettings();
    const tagline = settings.tagline && settings.tagline.length > 160 ? `${settings.tagline.slice(0, 157).trimEnd()}…` : settings.tagline;
    return { name: SHOW_BRAND_NAME ? settings.name : null, tagline };
  } catch {
    return { name: null, tagline: null };
  }
}

export default async function OpengraphImage() {
  const { name, tagline } = await loadText();
  const eyebrow = publicSite.home.eyebrow;
  const headline = name ?? alt;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px 96px",
          background: `radial-gradient(circle at 85% 15%, rgba(216, 175, 80, 0.18), transparent 55%), ${colors.background}`,
          color: colors.foreground,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 64, height: 2, background: colors.gold }} />
          <div style={{ fontSize: 24, letterSpacing: 6, textTransform: "uppercase", color: colors.gold }}>{eyebrow}</div>
        </div>
        <div style={{ marginTop: 36, fontSize: name ? 88 : 72, lineHeight: 1.1, maxWidth: 1000 }}>{headline}</div>
        {tagline && <div style={{ marginTop: 28, fontSize: 32, lineHeight: 1.4, color: colors.muted, maxWidth: 940 }}>{tagline}</div>}
        <div style={{ position: "absolute", left: 96, right: 96, bottom: 64, height: 1, background: "rgba(216, 175, 80, 0.35)" }} />
      </div>
    ),
    { ...size },
  );
}
