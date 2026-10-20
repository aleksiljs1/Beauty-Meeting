"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/lib/api/auth";
import { clearSessionHint } from "@/lib/api/session-hint";

/**
 * Signs out (server session + in-memory token + every tab via auth-events), clears the
 * session hint and navigates to `redirectTo` (login by default).
 */
export function useSignOut(redirectTo = "/hyr") {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const run = async () => {
    setPending(true);
    try {
      await signOut();
    } catch {
      // signOut() always clears local state and notifies listeners, even if the request failed.
    } finally {
      clearSessionHint();
    }
    router.replace(redirectTo);
    router.refresh();
  };
  return { signOut: run, pending };
}
