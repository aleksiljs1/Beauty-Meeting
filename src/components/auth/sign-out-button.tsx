"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { common } from "@/i18n/common";
import { portalText } from "@/i18n/portal";
import { useSignOut } from "./use-sign-out";

export function SignOutButton({ redirectTo = "/hyr", label = common.actions.signOut, variant = "outline" }: { redirectTo?: string; label?: string; variant?: "outline" | "ghost" | "secondary" }) {
  const { signOut, pending } = useSignOut(redirectTo);
  return (
    <Button variant={variant} size="lg" onClick={() => void signOut()} disabled={pending}>
      <LogOut aria-hidden="true" />
      {pending ? portalText.shell.signingOut : label}
    </Button>
  );
}
