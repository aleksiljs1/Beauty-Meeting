import { CalendarDays, Clock, MailOpen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { InvitationJoin } from "@/components/portal/invitation-join";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { portalText } from "@/i18n/portal";
import { formatTimeRange, formatWeekdayDate } from "@/lib/datetime";
import { getPageUser } from "@/server/auth/session";
import { ApiError } from "@/server/http";
import { getAcademyName } from "@/server/queries/portal";
import { previewInvitation, type InvitationState } from "@/server/services/invitations";

const t = portalText.invitation;

export const metadata: Metadata = { title: t.metaTitle, robots: { index: false, follow: false } };

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{20,100}$/;

type PageState = InvitationState | "INVALID";

function Frame({ academyName, children }: { academyName: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <header className="mb-8 text-center">
          <Link href="/" className="font-heading text-3xl tracking-tight">
            {academyName}
          </Link>
        </header>
        <main className="rounded-xl border bg-card p-6 shadow-sm sm:p-8">{children}</main>
      </div>
      <Toaster position="top-center" />
    </div>
  );
}

export default async function InvitationPage({ params }: PageProps<"/ftese/[token]">) {
  const { token } = await params;
  const user = await getPageUser();
  const selfPath = `/ftese/${TOKEN_SHAPE.test(token) ? token : ""}`;
  if (!user) redirect(`/hyr?next=${encodeURIComponent(selfPath)}`);

  const academyName = await getAcademyName();

  if (user.role === "admin") {
    return (
      <Frame academyName={academyName}>
        <div className="grid gap-4 text-center">
          <h1 className="text-2xl">{t.adminTitle}</h1>
          <p className="text-sm text-muted-foreground">{t.adminBody}</p>
          <Button asChild size="lg">
            <Link href="/admin">{t.adminAction}</Link>
          </Button>
        </div>
      </Frame>
    );
  }

  // Read-only preview: never enrolls (safe for link previews and email scanners).
  let state: PageState = "INVALID";
  let lesson: Awaited<ReturnType<typeof previewInvitation>>["lesson"] | null = null;
  if (TOKEN_SHAPE.test(token)) {
    try {
      const preview = await previewInvitation(token, user);
      state = preview.state;
      lesson = preview.lesson;
    } catch (error) {
      if (!(error instanceof ApiError && error.code === "NOT_FOUND")) throw error;
    }
  }

  const showLesson = lesson && (state === "VALID" || state === "ALREADY_ENROLLED");

  return (
    <Frame academyName={academyName}>
      <div className="grid gap-5">
        <div className="flex items-center gap-2 text-xs tracking-[0.18em] text-muted-foreground uppercase">
          <MailOpen aria-hidden="true" className="size-4" />
          {t.eyebrow}
        </div>

        {showLesson && lesson ? (
          <div className="grid gap-2">
            <h1 className="text-3xl leading-tight">{lesson.title}</h1>
            <dl className="grid gap-1.5 text-sm">
              <div className="flex items-start gap-2">
                <dt className="sr-only">{portalText.lesson.scheduleLabel}</dt>
                <CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <dd className="first-letter:uppercase">{formatWeekdayDate(lesson.scheduledStartAt)}</dd>
              </div>
              <div className="flex items-start gap-2">
                <dt className="sr-only">{portalText.lesson.scheduleLabel}</dt>
                <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <dd>{formatTimeRange(lesson.scheduledStartAt, lesson.scheduledEndAt)}</dd>
              </div>
            </dl>
          </div>
        ) : null}

        {state === "VALID" ? (
          <>
            <p className="text-sm text-muted-foreground">{t.previewNote}</p>
            <InvitationJoin token={token} />
            <p className="text-xs text-muted-foreground">{t.signedInAs(user.email)}</p>
          </>
        ) : (
          <div className="grid gap-3" role="status">
            <h2 className={showLesson ? "text-xl" : "text-3xl leading-tight"}>{t.states[state].title}</h2>
            <p className="text-sm text-muted-foreground">{t.states[state].body}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              {state === "ALREADY_ENROLLED" && lesson ? (
                <Button asChild size="lg">
                  <Link href={`/portal/mesimet/${lesson.id}`}>{t.goToLesson}</Link>
                </Button>
              ) : (
                <Button asChild size="lg" variant={state === "WRONG_ACCOUNT" ? "outline" : "default"}>
                  <Link href="/portal">{t.goToPortal}</Link>
                </Button>
              )}
              {state === "WRONG_ACCOUNT" ? <SignOutButton redirectTo={`/hyr?next=${encodeURIComponent(selfPath)}`} label={t.switchAccount} variant="secondary" /> : null}
            </div>
            <p className="text-xs text-muted-foreground">{t.signedInAs(user.email)}</p>
          </div>
        )}
      </div>
    </Frame>
  );
}
