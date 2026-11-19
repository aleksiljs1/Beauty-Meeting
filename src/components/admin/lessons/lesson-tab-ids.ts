/** Tab ids of the lesson detail page (`?tab=`). Plain module: usable from server and client. */
export const LESSON_TABS = ["detaje", "studentet", "pjesemarrja", "ftesat", "materialet", "regjistrimet", "perparimi"] as const;
export type LessonTab = (typeof LESSON_TABS)[number];

/** Live (Zoom) lessons. */
export const LIVE_TABS: readonly LessonTab[] = ["detaje", "studentet", "pjesemarrja", "ftesat", "materialet", "regjistrimet"];
/** Offline lessons: materials come first; no attendance or recordings, but the students' progress. */
export const OFFLINE_TABS: readonly LessonTab[] = ["detaje", "materialet", "studentet", "perparimi", "ftesat"];
