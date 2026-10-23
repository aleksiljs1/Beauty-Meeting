import { describe, expect, it } from "vitest";
import { isZoomMeetingUrl } from "./zoom-url";

describe("isZoomMeetingUrl", () => {
  it("accepts https links on Zoom domains", () => {
    expect(isZoomMeetingUrl("https://us05web.zoom.us/j/81234567890?pwd=AbCdEf.1")).toBe(true);
    expect(isZoomMeetingUrl("https://zoom.us/s/81234567890?zak=token")).toBe(true);
    expect(isZoomMeetingUrl("https://app.zoom.com/j/81234567890")).toBe(true);
  });

  it("refuses anything else", () => {
    for (const value of [
      "http://us05web.zoom.us/j/1",
      "https://zoom.us.evil.example/j/1",
      "https://evilzoom.us/j/1",
      "https://user:pass@zoom.us/j/1",
      "https://zoom.us:8443/j/1",
      "javascript:alert(1)",
      "zoommtg://zoom.us/join?confno=1",
      "",
      "not a url",
    ]) {
      expect(isZoomMeetingUrl(value), value).toBe(false);
    }
  });
});
