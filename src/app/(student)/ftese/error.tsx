"use client";

import { RouteError } from "@/components/route-error";

export default function InvitationError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <RouteError {...props} />;
}
