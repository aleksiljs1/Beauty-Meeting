import "client-only";
import { clearAccessToken } from "./access-token";

/**
 * Sign-out propagation within this tab and across tabs (BroadcastChannel), so logging out
 * in one tab stops polling and clears the in-memory token everywhere.
 */
export type SignedOutReason = "logout" | "expired";
type Listener = (reason: SignedOutReason) => void;

const listeners = new Set<Listener>();
const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("academy-auth") : null;

channel?.addEventListener("message", (event: MessageEvent<{ type: string; reason: SignedOutReason }>) => {
  if (event.data?.type === "signed-out") emit(event.data.reason, false);
});

function emit(reason: SignedOutReason, broadcast: boolean) {
  clearAccessToken();
  if (broadcast) channel?.postMessage({ type: "signed-out", reason });
  listeners.forEach((listener) => listener(reason));
}

export function notifySignedOut(reason: SignedOutReason) {
  emit(reason, true);
}

export function onSignedOut(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
