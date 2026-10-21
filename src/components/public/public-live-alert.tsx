"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { hasSessionHint } from "@/lib/api/session-hint";

// Loaded only for signed-in visitors, so anonymous visitors never download the realtime client.
const LiveClassAlert = dynamic(() => import("@/components/portal/live-class-alert").then((m) => m.LiveClassAlert), { ssr: false });

const noopSubscribe = () => () => undefined;

/** The "class has started" pop-up on public pages, for students who are signed in. */
export function PublicLiveAlert() {
  const signedIn = useSyncExternalStore(noopSubscribe, hasSessionHint, () => false);
  return signedIn ? <LiveClassAlert /> : null;
}
