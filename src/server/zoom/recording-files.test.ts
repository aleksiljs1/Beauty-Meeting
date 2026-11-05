import { describe, expect, it } from "vitest";
import { matchParticipant, pickRecordingFiles } from "./recording-files";

const file = (id: string, type: string, layout: string, start: string, end: string) => ({
  id,
  file_type: type,
  recording_type: layout,
  recording_start: start,
  recording_end: end,
  file_size: 1000,
  status: "completed",
  download_url: `https://zoom.us/rec/download/${id}`,
});

describe("Zoom recording files to import", () => {
  it("keeps one video per segment in the best view, in time order", () => {
    const picked = pickRecordingFiles([
      file("b-speaker", "MP4", "active_speaker", "2026-11-05T17:40:00Z", "2026-11-05T18:00:00Z"),
      file("a-gallery", "MP4", "gallery_view", "2026-11-05T17:00:00Z", "2026-11-05T17:30:00Z"),
      file("a-screen", "MP4", "shared_screen_with_speaker_view", "2026-11-05T17:00:00Z", "2026-11-05T17:30:00Z"),
      file("a-audio", "M4A", "audio_only", "2026-11-05T17:00:00Z", "2026-11-05T17:30:00Z"),
      file("a-chat", "CHAT", "chat_file", "2026-11-05T17:00:00Z", "2026-11-05T17:30:00Z"),
    ]);
    expect(picked.map((p) => [p.id, p.layout, p.durationSeconds])).toEqual([
      ["a-screen", "shared_screen_with_speaker_view", 1800],
      ["b-speaker", "active_speaker", 1200],
    ]);
  });

  it("skips files Zoom is still processing or that have no download link", () => {
    expect(pickRecordingFiles([{ ...file("x", "MP4", "active_speaker", "", ""), status: "processing" }, { id: "y", file_type: "MP4" }])).toEqual([]);
  });
});

describe("matching a Zoom participant to a student", () => {
  const students = [
    { id: "u1", name: "Klea Hoxha" },
    { id: "u2", name: "Arta Krasniqi" },
    { id: "u3", name: "Arta  Krasniqi" },
  ];

  it("trusts the key our site passed to Zoom", () => {
    expect(matchParticipant({ customerKey: "u2", name: "Someone else" }, students)).toBe("u2");
  });

  it("falls back to an exact name, ignoring accents, case and spaces", () => {
    expect(matchParticipant({ name: "klea  hoxha" }, students)).toBe("u1");
    expect(matchParticipant({ name: "Kléa Hoxha" }, students)).toBe("u1");
  });

  it("does not guess when two students share the name, or nobody matches", () => {
    expect(matchParticipant({ name: "Arta Krasniqi" }, students)).toBeNull();
    expect(matchParticipant({ name: "Mësuesja" }, students)).toBeNull();
  });
});
