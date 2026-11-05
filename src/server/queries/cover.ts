import "server-only";

/**
 * Course and lesson photos are gallery items, served publicly at /media/gallery/<id> (published
 * ones only). Select `image: coverSelect` and turn it into a src with `coverSrc`; null means
 * "show the course photo or the default cover".
 */
export const coverSelect = { select: { id: true, isPublished: true } } as const;

type CoverRow = { id: string; isPublished: boolean } | null | undefined;

export const coverSrc = (image: CoverRow) => (image?.isPublished ? `/media/gallery/${image.id}` : null);

/** A lesson shows its own photo, else its course's. */
export const lessonCoverSrc = (lesson: { image?: CoverRow; course?: { image?: CoverRow } | null }) => coverSrc(lesson.image) ?? coverSrc(lesson.course?.image);
