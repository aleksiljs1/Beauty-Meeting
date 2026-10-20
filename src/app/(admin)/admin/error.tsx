"use client";

import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { admin } from "@/i18n/admin";
import { common } from "@/i18n/common";

export default function AdminError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="space-y-4" role="alert">
      <Alert variant="destructive">
        <TriangleAlert aria-hidden />
        <AlertTitle>{admin.states.errorTitle}</AlertTitle>
        <AlertDescription>{admin.states.errorBody}</AlertDescription>
      </Alert>
      <Button variant="outline" onClick={() => retry()}>
        {common.actions.retry}
      </Button>
    </div>
  );
}
