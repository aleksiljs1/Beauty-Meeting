import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import "./globals.css";

// Self-hosted at build time by next/font (no runtime requests to Google). latin-ext covers ë and ç.
const display = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const body = Manrope({
  variable: "--font-body",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Beauty Academy", template: "%s · Beauty Academy" },
  description: "Sallon bukurie dhe akademi estetike.",
};

export const viewport: Viewport = {
  themeColor: "#17120f",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="sq" className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
