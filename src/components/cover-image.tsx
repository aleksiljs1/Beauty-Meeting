import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The picture of a course or lesson: its photo when one was chosen, otherwise a designed default
 * cover in the academy's colours (espresso and gold) with a beauty motif, so nothing looks empty.
 * The motif is picked from the title, so a course always gets the same one.
 */
export function CoverImage({
  src,
  alt,
  title,
  sizes,
  preload,
  className,
  children,
}: {
  /** `/media/gallery/<id>` of a published gallery photo, or null for the default cover. */
  src: string | null;
  alt: string;
  /** Picks the default cover's motif. */
  title: string;
  sizes: string;
  preload?: boolean;
  className?: string;
  /** Overlaid content (badges), positioned by the caller. */
  children?: ReactNode;
}) {
  return (
    <div className={cn("relative overflow-hidden bg-sand", className)}>
      {src ? (
        <Image src={src} alt={alt} fill sizes={sizes} preload={preload} className="object-cover" />
      ) : (
        <DefaultCover title={title} />
      )}
      {children}
    </div>
  );
}

const MOTIFS = [
  // Make-up brush
  <g key="brush">
    <path d="M57 98 L63 98 L62 62 L58 62 Z" />
    <path d="M56 62 L64 62 L65 52 L55 52 Z" />
    <path d="M55 52 C50 40 52 26 60 18 C68 26 70 40 65 52" />
    <path d="M60 22 L60 48" opacity="0.5" />
  </g>,
  // Nail polish
  <g key="polish">
    <rect x="53" y="18" width="14" height="26" rx="2" />
    <path d="M50 44 H70 V50 H50 Z" />
    <path d="M46 50 H74 C78 50 80 54 80 58 V92 C80 96 77 99 73 99 H47 C43 99 40 96 40 92 V58 C40 54 42 50 46 50 Z" />
    <path d="M48 64 H72" opacity="0.5" />
  </g>,
  // Lipstick
  <g key="lipstick">
    <rect x="48" y="66" width="24" height="33" rx="2" />
    <path d="M51 66 V54 H69 V66" />
    <path d="M53 54 V36 L67 26 V54" />
    <path d="M48 76 H72" opacity="0.5" />
  </g>,
  // Hand mirror
  <g key="mirror">
    <circle cx="60" cy="44" r="24" />
    <circle cx="60" cy="44" r="19" opacity="0.5" />
    <path d="M56 68 L56 98 C56 100 64 100 64 98 L64 68" />
    <path d="M51 35 C53 31 57 29 61 29" opacity="0.6" />
  </g>,
  // Botanical sprig
  <g key="sprig">
    <path d="M60 100 C60 76 58 52 66 22" />
    <path d="M60 80 C50 78 44 70 44 62 C52 64 58 70 60 80" />
    <path d="M61 64 C70 60 75 52 74 44 C66 48 62 55 61 64" />
    <path d="M62 48 C54 44 51 37 52 30 C59 33 62 40 62 48" />
    <path d="M64 33 C70 30 73 25 72 19 C66 21 64 26 64 33" />
  </g>,
];

function motifFor(title: string) {
  let hash = 0;
  for (const char of title) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return MOTIFS[hash % MOTIFS.length];
}

/** Line-art cover: a soft gold glow, a fine dot pattern and a beauty motif inside a thin frame. */
function DefaultCover({ title }: { title: string }) {
  return (
    <svg aria-hidden viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full">
      <defs>
        <radialGradient id="cover-glow" cx="50%" cy="45%" r="65%">
          <stop offset="0%" stopColor="var(--rose)" stopOpacity="0.22" />
          <stop offset="60%" stopColor="var(--rose)" stopOpacity="0.04" />
          <stop offset="100%" stopColor="var(--rose)" stopOpacity="0" />
        </radialGradient>
        <pattern id="cover-dots" width="16" height="16" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1" fill="var(--rose)" opacity="0.14" />
        </pattern>
      </defs>
      <rect width="400" height="250" fill="var(--card)" />
      <rect width="400" height="250" fill="url(#cover-dots)" />
      <rect width="400" height="250" fill="url(#cover-glow)" />
      <rect x="14" y="14" width="372" height="222" rx="6" fill="none" stroke="var(--rose)" strokeOpacity="0.25" />
      <g transform="translate(140 65) scale(1)" fill="none" stroke="var(--rose-deep)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {motifFor(title)}
      </g>
    </svg>
  );
}
