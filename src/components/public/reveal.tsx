"use client";

import { useEffect, useRef, type ReactNode } from "react";

type RevealTag = "div" | "li" | "section";

/**
 * Fades its content in with a small rise when it first scrolls into view (styles in globals.css).
 * Progressive enhancement: the server HTML is fully visible (no JS, crawlers, print). After
 * hydration, only elements that are still below the fold are hidden, so nothing on screen ever
 * blinks. Skipped entirely for reduced motion or without IntersectionObserver.
 */
export function Reveal({
  as: Tag = "div",
  delay = 0,
  className,
  children,
}: {
  as?: RevealTag;
  /** Stagger delay in ms, e.g. `index * 80`. */
  delay?: number;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Already (partly) on screen: leave it as rendered.
    if (el.getBoundingClientRect().top < window.innerHeight * 0.95) return;

    el.dataset.reveal = "hidden";
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          el.dataset.reveal = "shown";
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      delete el.dataset.reveal;
    };
  }, []);

  return (
    <Tag
      ref={ref as React.Ref<never>}
      className={className}
      style={delay ? ({ "--reveal-delay": `${delay}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </Tag>
  );
}
