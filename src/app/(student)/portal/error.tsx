"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { portalText } from "@/i18n/portal";

export default function PortalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto grid max-w-lg gap-3 py-12 text-center">
      <h1 className="text-3xl">{portalText.states.errorTitle}</h1>
      <p className="text-sm text-muted-foreground">{portalText.states.errorBody}</p>
      <div>
        <Button size="lg" onClick={() => retry()}>
          {portalText.states.retry}
        </Button>
      </div>
    </div>
  );
}
