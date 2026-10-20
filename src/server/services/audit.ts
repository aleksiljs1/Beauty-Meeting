import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

/**
 * Records sensitive actions (access changes, publication, integration failures).
 * `details` must stay small and must never contain tokens, passwords or provider secrets.
 */
export async function audit(
  actorId: string | null,
  action: string,
  targetType: string,
  targetId?: string | null,
  details?: Prisma.InputJsonValue,
) {
  await prisma.auditLog.create({ data: { actorId, action, targetType, targetId: targetId ?? null, details } });
}
