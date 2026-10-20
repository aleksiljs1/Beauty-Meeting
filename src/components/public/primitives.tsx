import Image from "next/image";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { publicSite } from "@/i18n/public";
import { cn } from "@/lib/utils";
import type { PublicGalleryItem } from "@/server/queries/public";

/** Layout primitives for the public site (Server Components). */

export function Container({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-6xl px-5 sm:px-8", className)} {...props} />;
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-xs font-medium tracking-[0.18em] text-rose-deep uppercase", className)}>{children}</p>;
}

export function SectionHeading({
  eyebrow,
  title,
  intro,
  id,
  action,
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
  id?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-10 flex flex-col gap-6 sm:mb-12 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        {eyebrow && <Eyebrow className="mb-3">{eyebrow}</Eyebrow>}
        <h2 id={id} className="text-3xl leading-tight sm:text-4xl">
          {title}
        </h2>
        {intro && <p className="mt-4 text-base leading-relaxed text-muted-foreground">{intro}</p>}
      </div>
      {action}
    </div>
  );
}

/** Title block at the top of inner pages. */
export function PageHeader({ eyebrow, title, intro, children }: { eyebrow?: string; title: string; intro?: string | null; children?: ReactNode }) {
  return (
    <header className="border-b border-border/70">
      <Container className="py-14 sm:py-20">
        {eyebrow && <Eyebrow className="mb-4">{eyebrow}</Eyebrow>}
        <h1 className="max-w-3xl text-4xl leading-[1.1] sm:text-5xl">{title}</h1>
        {intro && <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">{intro}</p>}
        {children}
      </Container>
    </header>
  );
}

const buttonBase =
  "inline-flex h-11 items-center justify-center gap-2 rounded-md px-6 text-sm font-medium tracking-wide transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none [&_svg]:size-4 [&_svg]:shrink-0";
const buttonVariants = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/85",
  outline: "border border-foreground/25 text-foreground hover:border-foreground/60 hover:bg-background/60",
} as const;

export function LinkButton({
  href,
  variant = "primary",
  className,
  external,
  children,
}: {
  href: string;
  variant?: keyof typeof buttonVariants;
  className?: string;
  external?: boolean;
  children: ReactNode;
}) {
  const classes = cn(buttonBase, buttonVariants[variant], className);
  // tel:, mailto: and external links are plain anchors; internal routes use Link.
  if (external || !href.startsWith("/")) {
    const newTab = href.startsWith("http");
    return (
      <a href={href} className={classes} {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={classes}>
      {children}
    </Link>
  );
}

/** Quiet text link with an arrow, for "see all" actions. */
export function ArrowLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-2 self-start rounded-sm text-sm font-medium text-foreground underline decoration-rose/60 underline-offset-[6px] hover:decoration-rose-deep focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:self-auto"
    >
      {children}
      <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
        →
      </span>
    </Link>
  );
}

/**
 * Gallery image through the optimizer (`/_next/image` fetches our own `/media/gallery/<id>`
 * route, so visitors get resized WebP/AVIF instead of the original upload). Rendered with
 * `fill` inside a fixed aspect-ratio box, so missing dimensions never cause layout shift.
 */
export function GalleryImage({
  item,
  sizes,
  className,
  preload,
  aspect,
}: {
  item: Pick<PublicGalleryItem, "src" | "alt">;
  sizes: string;
  className?: string;
  preload?: boolean;
  /** CSS aspect-ratio, e.g. "4 / 5"; otherwise set one through className. */
  aspect?: string;
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-md bg-sand", className)} style={aspect ? { aspectRatio: aspect } : undefined}>
      <Image src={item.src} alt={item.alt} fill sizes={sizes} preload={preload} className="object-cover" />
    </div>
  );
}

/** Shown where photos would be while the gallery is still empty — no broken images. */
export function ImagePlaceholder({ monogram, className, label = true }: { monogram?: string; className?: string; label?: boolean }) {
  return (
    <div className={cn("relative flex items-center justify-center overflow-hidden rounded-md border border-border/70 bg-sand", className)}>
      <div aria-hidden className="absolute inset-4 rounded-sm border border-background/70" />
      <div className="relative flex flex-col items-center gap-3 px-6 text-center">
        {monogram && (
          <span aria-hidden className="font-heading text-7xl leading-none text-rose-deep/70 sm:text-8xl">
            {monogram}
          </span>
        )}
        {label && <span className="text-xs tracking-[0.16em] text-muted-foreground uppercase">{publicSite.imagePlaceholder}</span>}
      </div>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed border-border bg-card/50 px-6 py-10 text-center text-muted-foreground">{children}</p>;
}

export function monogramOf(name: string) {
  return name.trim().charAt(0).toUpperCase() || "B";
}
