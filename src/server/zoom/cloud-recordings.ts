import "server-only";
import { zoomRequest } from "./client";

/** Zoom wants a meeting UUID that starts with "/" or contains "//" encoded twice. */
export const meetingUuidPath = (uuid: string) => (uuid.startsWith("/") || uuid.includes("//") ? encodeURIComponent(encodeURIComponent(uuid)) : encodeURIComponent(uuid));

/** Moves one file of a Zoom cloud recording to Zoom's trash (after it was copied into our storage). */
export async function trashZoomCloudFile(meetingUuid: string, fileId: string) {
  try {
    await zoomRequest(`/meetings/${meetingUuidPath(meetingUuid)}/recordings/${encodeURIComponent(fileId)}`, {
      method: "DELETE",
      query: { action: "trash" },
      acceptStatus: [404],
    });
  } catch (error) {
    console.warn("[recordings] could not move the Zoom cloud file to the trash", (error as Error).message);
  }
}

/**
 * Deletes everything Zoom's cloud still holds for one class (every view, the audio, the chat), for
 * good: the lesson has expired, so nobody can watch it any more and it would only fill the plan's
 * cloud space. Gone already (404) counts as done. Returns false when Zoom refused; the caller logs it.
 */
export async function deleteZoomCloudRecording(meetingUuid: string): Promise<boolean> {
  try {
    await zoomRequest(`/meetings/${meetingUuidPath(meetingUuid)}/recordings`, {
      method: "DELETE",
      query: { action: "delete" },
      acceptStatus: [404],
    });
    return true;
  } catch (error) {
    console.warn("[recordings] could not delete the Zoom cloud recording", (error as Error).message);
    return false;
  }
}
