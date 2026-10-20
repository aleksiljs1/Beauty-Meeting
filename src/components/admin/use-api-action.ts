"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";
import { ApiClientError } from "@/lib/api/client";
import { common } from "@/i18n/common";

/** User-safe message for any thrown value (ApiClientError messages are already safe). */
export function errorMessage(error: unknown): string {
  return error instanceof ApiClientError ? error.message : common.errors.generic;
}

/**
 * Runs a mutation against our API, toasts the outcome and refreshes Server Components so the
 * page shows fresh data. Returns the result, or undefined on failure (already reported).
 */
export function useApiAction() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [refreshing, startTransition] = useTransition();

  const run = useCallback(
    async <T>(action: () => Promise<T>, options: { success?: string; refresh?: boolean; onError?: (error: unknown) => boolean } = {}) => {
      setRunning(true);
      try {
        const result = await action();
        if (options.success) toast.success(options.success);
        if (options.refresh !== false) startTransition(() => router.refresh());
        return result;
      } catch (error) {
        // onError may handle the error itself (e.g. a confirmation flow) by returning true.
        if (!options.onError?.(error)) toast.error(errorMessage(error));
        return undefined;
      } finally {
        setRunning(false);
      }
    },
    [router],
  );

  return { run, pending: running || refreshing };
}
