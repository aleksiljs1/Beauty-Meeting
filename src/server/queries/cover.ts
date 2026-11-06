import "server-only";

/**
 * Course and lesson photos are gallery items, served publicly at /media/gallery/<id> (published
 * photos, and any photo chosen as a cover). Select `image: coverSelect` and turn it into a src with `coverSrc`; null means
 * "show the course photo or the default cover".
 */
export const coverSelect = { select: { id: true } } as const;

type CoverRow = { id: string } | null | undefined;

/** A chosen cover is always shown, even when the photo itself is kept off the gallery. */
export const coverSrc = (image: CoverRow) => (image ? `/media/gallery/${image.id}` : null);

/** A lesson shows its own photo, else its course's. */
export const lessonCoverSrc = (lesson: { image?: CoverRow; course?: { image?: CoverRow } | null }) => coverSrc(lesson.image) ?? coverSrc(lesson.course?.image);
