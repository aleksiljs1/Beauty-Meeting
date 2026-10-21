
import { requireLessonCapability } from "@/server/access/lesson-access";
import { requireApiUser } from "@/server/auth/session";
import { ApiError, ok, route } from "@/server/http";
import { parseLessonId } from "@/server/queries/portal";
import { env } from "@/server/env";
import { prisma } from "@/server/db";
import { createMeetingSdkParticipantSignature } from "@/server/zoom/meeting-sdk-signature";

/**
 * Authorizes a student to join a live class.
 *
 * Every request rechecks authentication, enrollment, revocation,
 * the join window and the student's access deadline.
 *
 * Demo lessons retain their existing demo behavior.
 * Real lessons receive only a short-lived participant signature and
 * the meeting details required by the embedded Zoom Meeting SDK.
 *
 * Never return Zoom app secrets or host ZAK tokens to students.
 */
export const POST = route<RouteContext<"/api/v1/lessons/[id]/join">>(
  async (request, { params }) => {
    const user = await requireApiUser(request);
    const lessonId = parseLessonId((await params).id);

    // Central policy: verify this student may join this lesson right now.
    const { lesson } = await requireLessonCapability(
      user,
      lessonId,
      "JOIN_LIVE",
    );

    // Preserve the original, clearly labelled demo classroom.
    if (lesson.isDemo) {
      return ok({ mode: "demo" as const });
    }

    if (!env.ZOOM_CLIENT_ID || !env.ZOOM_CLIENT_SECRET) {
      throw new ApiError(
        "INTEGRATION_NOT_CONFIGURED",
        "Klasa Zoom nuk është konfiguruar ende.",
      );
    }

    // Load meeting details from our database, never from browser input.
    const meeting = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: {
        zoomMeetingNumber: true,
        zoomMeetingPassword: true,
      },
    });

    if (!meeting?.zoomMeetingNumber) {
      throw new ApiError(
        "INTEGRATION_NOT_CONFIGURED",
        "Ky mësim nuk ka një takim Zoom të lidhur.",
      );
    }

    const signature = createMeetingSdkParticipantSignature({
      clientId: env.ZOOM_CLIENT_ID,
      clientSecret: env.ZOOM_CLIENT_SECRET,
      meetingNumber: meeting.zoomMeetingNumber,
    });

    // Only the authorized student receives their participant authorization.
    return ok({
      mode: "zoom" as const,
      lessonId,
      signature,
      meetingNumber: meeting.zoomMeetingNumber,
      password: meeting.zoomMeetingPassword ?? "",
      userName: user.name,
    });
  },
);
