import { describe, expect, it } from "vitest";
import { postLoginDestination, safeNextPath } from "./safe-next";

describe("safeNextPath", () => {
  it("accepts same-origin relative paths, keeping query and hash", () => {
    expect(safeNextPath("/portal")).toBe("/portal");
    expect(safeNextPath("/ftese/abcDEF_123-xyz")).toBe("/ftese/abcDEF_123-xyz");
    expect(safeNextPath("/portal/mesimet?filter=live#top")).toBe("/portal/mesimet?filter=live#top");
  });

  it("rejects anything that could leave the site", () => {
    for (const value of [
      "//evil.com",
      "///evil.com",
      "/\\evil.com",
      "\\\\evil.com",
      "https://evil.com",
      "http:/evil.com",
      "javascript:alert(1)",
      "evil.com",
      "portal",
      "/\tevil",
      "/\n/evil.com",
      "/a\\b",
      "",
      " ",
    ]) {
      expect(safeNextPath(value), value).toBeNull();
    }
  });

  it("rejects non-strings and overly long values", () => {
    expect(safeNextPath(undefined)).toBeNull();
    expect(safeNextPath(["/portal"])).toBeNull();
    expect(safeNextPath(`/${"a".repeat(600)}`)).toBeNull();
  });

  it("normalizes dot segments without escaping the origin", () => {
    expect(safeNextPath("/portal/../admin")).toBe("/admin");
    expect(safeNextPath("/../../etc")).toBe("/etc");
  });
});

describe("postLoginDestination", () => {
  it("defaults to the role's home", () => {
    expect(postLoginDestination("student", null)).toBe("/portal");
    expect(postLoginDestination("admin", undefined)).toBe("/admin");
    expect(postLoginDestination("student", "//evil.com")).toBe("/portal");
  });

  it("follows a valid next for the user's own area", () => {
    expect(postLoginDestination("student", "/ftese/token123")).toBe("/ftese/token123");
    expect(postLoginDestination("student", "/portal/mesimet")).toBe("/portal/mesimet");
    expect(postLoginDestination("admin", "/admin/mesimet")).toBe("/admin/mesimet");
  });

  it("does not cross role areas or loop back to auth pages", () => {
    expect(postLoginDestination("student", "/admin")).toBe("/portal");
    expect(postLoginDestination("student", "/admin/studentet")).toBe("/portal");
    expect(postLoginDestination("admin", "/portal/mesimet")).toBe("/admin");
    expect(postLoginDestination("student", "/hyr?next=/x")).toBe("/portal");
    expect(postLoginDestination("student", "/fjalekalimi/i-ri")).toBe("/portal");
    // A path that merely starts with the same letters is not the admin area.
    expect(postLoginDestination("student", "/administrata")).toBe("/administrata");
  });
});
