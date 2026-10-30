import { describe, expect, it } from "vitest";
import { isPhoneNumber } from "./student-profile";

describe("isPhoneNumber", () => {
  it("accepts local and international numbers written the usual ways", () => {
    for (const value of ["+355 69 123 4567", "00355691234567", "0691234567", "(04) 222-333", "069.123.4567", "+1 (212) 555-0100"]) {
      expect(isPhoneNumber(value), value).toBe(true);
    }
  });

  it("rejects numbers that are too short or too long, and anything that isn't a number", () => {
    for (const value of ["12345", "+355 69 123 4567 891 23", "1234567890123456", "069 123 abc", "++355691234567", "355+691234567", "+"]) {
      expect(isPhoneNumber(value), value).toBe(false);
    }
  });
});
