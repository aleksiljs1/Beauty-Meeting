"use client";

import { AlertCircle, ExternalLink, LoaderCircle, MonitorUp } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiClientError, apiSend } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type Labels = { request: string; preparing: string; ready: string; open: string; error: string };

/** Only Zoom https links are rendered (the server checks too). */
const isZoomUrl = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)zoom\.(us|com)$/i.test(url.hostname);
  } catch {
    return false;
  }
};

/**
 * Deliberate two-step "open in the Zoom app": a click asks our API for the link (policy-checked,
 * audited), then the link is shown to open in a new tab. Never an automatic redirect, and the
 * link is forgotten once used so it doesn't linger on the page.
 */
export function ZoomAppLink({
  endpoint,
  field,
  labels,
  className,
}: {
  endpoint: string;
  field: "joinUrl" | "startUrl";
  labels: Labels;
  className?: string;
}) {
  const [state, setState] = useState<{ kind: "idle" } | { kind: "loading" } | { kind: "ready"; url: string } | { kind: "error"; message: string }>({
    kind: "idle",
  });

  const request = async () => {
    setState({ kind: "loading" });
    try {
      const result = await apiSend<Record<string, unknown>>("post", endpoint);
      const url = result?.[field];
      if (!isZoomUrl(url)) throw new Error(labels.error);
      setState({ kind: "ready", url });
    } catch (error) {
      setState({ kind: "error", message: error instanceof ApiClientError || error instanceof Error ? error.message : labels.error });
    }
  };

  return (
    <div aria-live="polite" className={cn("grid justify-items-center gap-2", className)}>
      {state.kind === "ready" ? (
        <>
          <p className="text-sm text-muted-foreground">{labels.ready}</p>
          <Button asChild variant="outline">
            <a href={state.url} target="_blank" rel="noopener noreferrer" onClick={() => setState({ kind: "idle" })}>
              <ExternalLink aria-hidden />
              {labels.open}
            </a>
          </Button>
        </>
      ) : (
        <Button variant="outline" disabled={state.kind === "loading"} onClick={() => void request()}>
          {state.kind === "loading" ? <LoaderCircle className="animate-spin" aria-hidden /> : <MonitorUp aria-hidden />}
          {state.kind === "loading" ? labels.preparing : labels.request}
        </Button>
      )}
      {state.kind === "error" && (
        <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.message}
        </p>
      )}
    </div>
  );
}
