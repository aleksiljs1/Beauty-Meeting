import { describe, expect, it } from "vitest";
import { mailtoHref, paragraphs, parseOpeningHours, safeExternalUrl, slugify, telHref, whatsappHref } from "./public-content";

describe("public content helpers", () => {
  it("slugifies Albanian titles", () => {
    expect(slugify("Kursi profesional i estetikës")).toBe("kursi-profesional-i-estetikes");
    expect(slugify("  Çehre & Lëkurë!  ")).toBe("cehre-lekure");
    expect(slugify("---")).toBe("");
  });

  it("builds contact links only from usable values", () => {
    expect(whatsappHref("+355 69 123 4567")).toBe("https://wa.me/355691234567");
    expect(whatsappHref("00355 69 123 4567")).toBe("https://wa.me/355691234567");
    expect(whatsappHref("")).toBeNull();
    expect(whatsappHref("[+355 6X XXX XXXX]")).toBeNull();
    expect(telHref("+355 69 123 4567")).toBe("tel:+355691234567");
    expect(telHref("[+355 6X XXX XXXX]")).toBeNull();
    expect(mailtoHref("info@akademia.al")).toBe("mailto:info@akademia.al");
    expect(mailtoHref("[info@akademia.al]")).toBeNull();
  });

  it("allows only http(s) external links", () => {
    expect(safeExternalUrl("https://maps.google.com/?q=Tirana")).toBe("https://maps.google.com/?q=Tirana");
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("nope")).toBeNull();
  });

  it("parses opening hours defensively", () => {
    expect(parseOpeningHours([{ days: "E hënë", hours: "09:00" }, { days: 1 }, null, { days: " ", hours: "" }])).toEqual([
      { days: "E hënë", hours: "09:00" },
    ]);
    expect(parseOpeningHours("x")).toEqual([]);
  });

  it("splits paragraphs", () => {
    expect(paragraphs("A\n\n  B\nC\n\n\n")).toEqual(["A", "B\nC"]);
  });
});
