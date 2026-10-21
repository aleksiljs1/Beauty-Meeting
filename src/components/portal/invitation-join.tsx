"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { portalText } from "@/i18n/portal";
import { ApiClientError, apiSend } from "@/lib/api/client";

const t = portalText.invitation;

/** The only way to redeem a shared link: an explicit click → POST (opening the page never enrolls). */
export function InvitationJoin({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const join = async () => {
    setPending(true);
    setError(null);
    try {
      const result = await apiSend<{ lessonId: string; state: "ENROLLED" | "ALREADY_ENROLLED" }>("post", "/invitations/redeem", { token });
      setDone(true);
      router.replace(`/portal/mesimet/${result.lessonId}`);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : portalText.states.errorBody);
      setPending(false);
    }
  };

  return (
    <div className="grid gap-3">
      <Button size="lg" className="h-11 text-base" onClick={() => void join()} disabled={pending || done}>
        {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
        {pending ? t.joining : t.join}
      </Button>
      <div aria-live="polite">
        {done ? <p className="text-sm">{t.joined}</p> : null}
        {error ? (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
