/**
 * Which files of a Zoom cloud recording to import, and how to match a Zoom participant to one of
 * our students. Pure, so they can be unit-tested without configuration.
 */

export type ZoomRecordingFile = {
  id?: string;
  file_type?: string;
  file_size?: number;
  recording_type?: string;
  recording_start?: string;
  recording_end?: string;
  status?: string;
  download_url?: string;
};

/** The view students see best first: the shared screen with the teacher, then the teacher alone. */
const LAYOUT_PREFERENCE = [
  "shared_screen_with_speaker_view",
  "shared_screen_with_speaker_view(CC)",
  "shared_screen_with_gallery_view",
  "active_speaker",
  "speaker_view",
  "gallery_view",
  "shared_screen",
];

export type PickedRecordingFile = {
  id: string;
  downloadUrl: string;
  sizeBytes: number;
  layout: string;
  startedAt: Date | null;
  durationSeconds: number | null;
};

/**
 * One MP4 per recorded segment (a class stopped and restarted gives several), in the best view
 * Zoom produced, in time order. Audio-only, chat and transcript files are left out.
 */
export function pickRecordingFiles(files: ZoomRecordingFile[]): PickedRecordingFile[] {
  const videos = files.filter(
    (f) => f.file_type?.toUpperCase() === "MP4" && f.id && f.download_url && (f.status ?? "completed") === "completed",
  );
  const bySegment = new Map<string, ZoomRecordingFile[]>();
  for (const file of videos) {
    const segment = file.recording_start ?? "";
    bySegment.set(segment, [...(bySegment.get(segment) ?? []), file]);
  }
  const rank = (layout: string | undefined) => {
    const index = LAYOUT_PREFERENCE.indexOf(layout ?? "");
    return index === -1 ? LAYOUT_PREFERENCE.length : index;
  };
  return [...bySegment.values()]
    .map((segment) => segment.sort((a, b) => rank(a.recording_type) - rank(b.recording_type))[0])
    .map((file) => {
      const start = file.recording_start ? new Date(file.recording_start) : null;
      const end = file.recording_end ? new Date(file.recording_end) : null;
      const seconds = start && end ? Math.round((end.getTime() - start.getTime()) / 1000) : NaN;
      return {
        id: file.id!,
        downloadUrl: file.download_url!,
        sizeBytes: file.file_size ?? 0,
        layout: file.recording_type ?? "video",
        startedAt: start && !Number.isNaN(start.getTime()) ? start : null,
        durationSeconds: Number.isFinite(seconds) && seconds > 0 ? seconds : null,
      };
    })
    .sort((a, b) => (a.startedAt?.getTime() ?? 0) - (b.startedAt?.getTime() ?? 0));
}

/**
 * Zoom's "customer key" is at most 36 characters: our site passes the student's user id there when
 * they join from the lesson page, so attendance needs no guessing for them.
 */
export const ZOOM_CUSTOMER_KEY_MAX = 36;

const normalizeName = (name: string) => name.trim().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").toLowerCase();

/**
 * The student a Zoom participant is: the customer key our site set, else the one enrolled student
 * whose name matches exactly (people who joined through the Zoom app). Null when unsure.
 */
export function matchParticipant(
  participant: { customerKey?: string | null; name: string },
  students: { id: string; name: string }[],
): string | null {
  if (participant.customerKey) {
    const byKey = students.find((s) => s.id === participant.customerKey);
    if (byKey) return byKey.id;
  }
  const name = normalizeName(participant.name);
  const byName = students.filter((s) => normalizeName(s.name) === name);
  return byName.length === 1 ? byName[0].id : null;
}
