import { helpText, type HelpCategory, type HelpGuide } from "@/i18n/help";

const GUIDES: readonly HelpGuide[] = helpText.guides;

/** Lower case without accents, so "ë", "ç" and their plain letters match ("pagese" finds "pagesë"). */
export const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const searchable = GUIDES.map((guide) => ({
  guide,
  title: fold(guide.title),
  rest: fold([...guide.keywords, ...guide.steps, ...(guide.tips ?? []).map((tip) => tip.text), helpText.categories[guide.category]].join(" ")),
}));

/** Guides matching every word of the query (in any field), title matches first; all guides when empty. */
export function searchGuides(query: string, category: HelpCategory | null = null): HelpGuide[] {
  const words = fold(query).split(/\s+/).filter((w) => w.length > 1);
  return searchable
    .filter((s) => !category || s.guide.category === category)
    .map((s) => ({ ...s, score: words.every((w) => s.title.includes(w) || s.rest.includes(w)) ? words.filter((w) => s.title.includes(w)).length + 1 : 0 }))
    .filter((s) => !words.length || s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.guide);
}
