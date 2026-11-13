"use client";

import Link from "next/link";
import { ArrowRight, ChevronDown, Lightbulb, Search, X } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { helpText, type HelpCategory, type HelpGuide } from "@/i18n/help";
import { searchGuides } from "@/lib/help-search";
import { cn } from "@/lib/utils";

const t = helpText;
const GUIDES: readonly HelpGuide[] = t.guides;
const CATEGORIES = Object.keys(t.categories) as HelpCategory[];

/** Searchable, step-by-step guides; `#id` in the address opens one (the checklist links to them). */
export function HelpGuide() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<HelpCategory | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const deferred = useDeferredValue(query);
  const results = useMemo(() => searchGuides(deferred, category), [deferred, category]);

  // Open (and scroll to) the guide named in the address, also when a checklist link changes it.
  useEffect(() => {
    const openFromHash = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!GUIDES.some((g) => g.id === id)) return;
      setQuery("");
      setCategory(null);
      setOpenId(id);
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }));
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, []);

  // A narrow search opens its results straight away.
  const autoOpen = deferred.trim().length > 1 && results.length <= 2;

  return (
    <section aria-label={t.searchLabel} className="space-y-4">
      <div className="relative max-w-xl">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.searchPlaceholder}
          aria-label={t.searchLabel}
          className="h-11 pr-10 pl-9 text-base"
        />
        {query && (
          <Button type="button" variant="ghost" size="icon-sm" className="absolute top-1/2 right-1.5 -translate-y-1/2" onClick={() => setQuery("")} aria-label={t.clear}>
            <X aria-hidden />
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label={t.searchLabel}>
        {[null, ...CATEGORIES].map((c) => (
          <button
            key={c ?? "all"}
            type="button"
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors duration-200 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              category === c ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:border-rose/50 hover:text-foreground",
            )}
          >
            {c ? t.categories[c] : t.allTopics}
          </button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {t.results(results.length)}
      </p>

      {results.length === 0 ? (
        <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{t.noResults}</p>
      ) : (
        <ul className="space-y-2">
          {results.map((guide) => (
            <li key={guide.id}>
              <GuideCard guide={guide} open={autoOpen || openId === guide.id} onToggle={(open) => setOpenId(open ? guide.id : null)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function GuideCard({ guide, open, onToggle }: { guide: HelpGuide; open: boolean; onToggle: (open: boolean) => void }) {
  return (
    <details
      id={guide.id}
      open={open}
      onToggle={(e) => {
        if (e.currentTarget.open !== open) onToggle(e.currentTarget.open);
      }}
      className="group scroll-mt-20 rounded-md border bg-card transition-colors duration-200 open:border-rose/40"
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-md px-4 py-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{guide.title}</span>
          <span className="block text-xs text-muted-foreground">{t.categories[guide.category]}</span>
        </span>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <div className="space-y-4 border-t px-4 pt-4 pb-5">
        <ol className="space-y-3" aria-label={t.stepsLabel}>
          {guide.steps.map((step, i) => (
            <li key={step} className="flex gap-3 text-sm">
              <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full bg-rose/15 text-xs font-medium text-rose-deep tabular-nums">
                {i + 1}
              </span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
        {guide.tips?.length ? (
          <div className="rounded-md bg-muted/40 p-3 text-sm">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Lightbulb aria-hidden className="size-3.5 text-rose-deep" /> {t.tipsLabel}
            </p>
            <ul className="space-y-1.5">
              {guide.tips.map((tip) => (
                <li key={tip.text}>
                  {tip.text}
                  {tip.untested && (
                    <Badge variant="outline" className="ml-2 align-middle text-muted-foreground">
                      {t.untested}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {guide.link && (
          <Button asChild size="sm">
            <Link href={guide.link.href}>
              {guide.link.label} <ArrowRight aria-hidden />
            </Link>
          </Button>
        )}
      </div>
    </details>
  );
}
