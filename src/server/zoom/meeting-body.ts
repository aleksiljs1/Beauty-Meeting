/** Zoom meeting request bodies — pure, so they can be unit-tested without configuration. */

/** Marker in the meeting agenda that ties a Zoom meeting to its lesson (used for recovery). */
export const lessonMarker = (lessonId: string) => `beauty-academy-lesson:${lessonId}`;

export type LessonSchedule = { id: string; title: string; scheduledStartAt: Date; scheduledEndAt: Date };

export function meetingSchedule(lesson: LessonSchedule) {
  return {
    topic: lesson.title.slice(0, 200),
    start_time: lesson.scheduledStartAt.toISOString(),
    duration: Math.max(1, Math.ceil((lesson.scheduledEndAt.getTime() - lesson.scheduledStartAt.getTime()) / 60_000)),
    timezone: "UTC",
  };
}

export function createMeetingBody(lesson: LessonSchedule, autoRecording: "none" | "cloud") {
  return {
    ...meetingSchedule(lesson),
    type: 2, // scheduled meeting
    agenda: lessonMarker(lesson.id),
    settings: {
      join_before_host: false,
      // No waiting room: our access policy already decides who may join; with ~30 students
      // the teacher would otherwise have to admit everyone by hand.
      waiting_room: false,
      // Students join through our site without Zoom accounts.
      meeting_authentication: false,
      approval_type: 2, // no registration
      host_video: true,
      participant_video: false, // never switch a student's camera on unexpectedly
      mute_upon_entry: true,
      auto_recording: autoRecording,
    },
  };
}
