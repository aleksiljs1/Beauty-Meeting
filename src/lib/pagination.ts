/**
 * The page links to show: always the first and last page, the current one with `siblings` on
 * each side, and "gap" (…) for skipped pages. A gap never hides a single page — that page is
 * shown instead. E.g. page 21 of 50 → 1 … 20 21 22 … 50.
 */
export function pageItems(page: number, pageCount: number, siblings = 1): (number | "gap")[] {
  const shown = new Set([1, pageCount]);
  for (let p = page - siblings; p <= page + siblings; p++) if (p >= 1 && p <= pageCount) shown.add(p);

  const items: (number | "gap")[] = [];
  let last = 0;
  for (const p of [...shown].sort((a, b) => a - b)) {
    if (p - last === 2) items.push(last + 1);
    else if (p - last > 2) items.push("gap");
    items.push(p);
    last = p;
  }
  return items;
}
