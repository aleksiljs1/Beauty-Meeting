import { describe, expect, it } from "vitest";
import { parseNotification } from "./server";

describe("parseNotification", () => {
  it("accepts feed messages with user ids", () => {
    expect(parseNotification(JSON.stringify({ type: "feed", users: ["a", "b"] }))).toEqual(["a", "b"]);
  });

  it("accepts resync broadcasts", () => {
    expect(parseNotification(JSON.stringify({ type: "resync" }))).toBe("all");
  });

  it("ignores malformed or hostile payloads", () => {
    expect(parseNotification("not json")).toBeNull();
    expect(parseNotification(JSON.stringify({ type: "feed", users: "a" }))).toBeNull();
    expect(parseNotification(JSON.stringify({ type: "feed", users: [1, null, "x".repeat(200)] }))).toBeNull();
    expect(parseNotification(JSON.stringify({ type: "other", users: ["a"] }))).toBeNull();
    expect(parseNotification(undefined)).toBeNull();
  });
});
