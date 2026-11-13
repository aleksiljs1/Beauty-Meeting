import { describe, expect, it } from "vitest";
import { helpText } from "@/i18n/help";
import { searchGuides } from "./help-search";

describe("help search", () => {
  it("finds guides without the Albanian letters and with several words", () => {
    expect(searchGuides("pagese").map((g) => g.id)[0]).toBe("pagesa");
    expect(searchGuides("ftese whatsapp").map((g) => g.id)).toEqual(["ftesa"]);
    expect(searchGuides("NIS KLASËN").map((g) => g.id)[0]).toBe("nis-klasen");
  });

  it("filters by topic and returns everything for an empty search", () => {
    expect(searchGuides("").length).toBe(helpText.guides.length);
    expect(searchGuides("", "payments").every((g) => g.category === "payments")).toBe(true);
    expect(searchGuides("xyzxyz")).toEqual([]);
  });

  it("has unique guide ids and links only to admin pages", () => {
    const ids = helpText.guides.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const guide of helpText.guides) if (guide.link) expect(guide.link.href.startsWith("/admin")).toBe(true);
  });
});
