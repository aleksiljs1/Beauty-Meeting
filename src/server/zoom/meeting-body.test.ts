import { describe, expect, it } from "vitest";
import { createMeetingBody, lessonMarker, meetingSchedule } from "./meeting-body";

const lesson = {
  id: "0197f000-0000-7000-8000-000000000001",
  title: "Teknikat e ngjyrosjes",
  scheduledStartAt: new Date("2026-11-15T08:00:00.000Z"),
  scheduledEndAt: new Date("2026-11-15T11:00:00.000Z"),
};

describe("Zoom meeting request bodies", () => {
  it("schedules in UTC with the lesson's duration", () => {
    expect(meetingSchedule(lesson)).toEqual({ topic: lesson.title, start_time: "2026-11-15T08:00:00.000Z", duration: 180, timezone: "UTC" });
  });

  it("tags the meeting with its lesson so a timed-out creation can be recovered", () => {
    expect(createMeetingBody(lesson, "none").agenda).toBe(lessonMarker(lesson.id));
  });

  it("lets enrolled students in without a waiting room, Zoom accounts or forced cameras", () => {
    const { settings } = createMeetingBody(lesson, "cloud");
    expect(settings).toMatchObject({
      waiting_room: false,
      meeting_authentication: false,
      join_before_host: false,
      participant_video: false,
      mute_upon_entry: true,
      auto_recording: "cloud",
    });
  });
});
