import { describe, expect, it } from "vitest";
import { pageItems } from "./pagination";

describe("pageItems", () => {
  it("keeps the first, last and nearby pages, with gaps for the rest", () => {
    expect(pageItems(21, 50)).toEqual([1, "gap", 20, 21, 22, "gap", 50]);
  });

  it("shows a single skipped page instead of a gap", () => {
    expect(pageItems(4, 10)).toEqual([1, 2, 3, 4, 5, "gap", 10]);
    expect(pageItems(7, 10)).toEqual([1, "gap", 6, 7, 8, 9, 10]);
  });

  it("handles the edges and short lists", () => {
    expect(pageItems(1, 50)).toEqual([1, 2, "gap", 50]);
    expect(pageItems(50, 50)).toEqual([1, "gap", 49, 50]);
    expect(pageItems(2, 3)).toEqual([1, 2, 3]);
    expect(pageItems(1, 1)).toEqual([1]);
  });
});
