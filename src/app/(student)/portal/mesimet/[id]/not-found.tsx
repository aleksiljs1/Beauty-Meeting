import Link from "next/link";
import { Button } from "@/components/ui/button";
import { portalText } from "@/i18n/portal";

export default function LessonNotFound() {
  return (
    <div className="mx-auto grid max-w-lg gap-3 py-12 text-center">
      <h1 className="text-3xl">{portalText.lesson.notFoundTitle}</h1>
      <p className="text-sm text-muted-foreground">{portalText.lesson.notFoundBody}</p>
      <div>
        <Button asChild size="lg">
          <Link href="/portal/mesimet">{portalText.lesson.back}</Link>
        </Button>
      </div>
    </div>
  );
}
