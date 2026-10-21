/** Tab ids of the lesson detail page (`?tab=`). Plain module: usable from server and client. */
export const LESSON_TABS = ["detaje", "studentet", "ftesat", "materialet", "regjistrimet"] as const;
export type LessonTab = (typeof LESSON_TABS)[number];
