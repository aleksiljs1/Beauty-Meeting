import "server-only";
import type { AppUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { ApiError } from "@/server/http";
import { sanitizeDisplayName } from "@/server/storage/file-types";
import { audit } from "./audit";

/** Rename and reorder lesson materials (upload/delete live in materials.ts). */

export async function renameMaterial(materialId: string, displayName: string, admin: AppUser) {
  const material = await prisma.lessonMaterial.findUnique({ where: { id: materialId }, select: { lessonId: true } });
  if (!material) throw new ApiError("NOT_FOUND", "Materiali nuk u gjet.");
  await prisma.lessonMaterial.update({ where: { id: materialId }, data: { displayName: sanitizeDisplayName(displayName) } });
  await audit(admin.id, "material.rename", "lesson", material.lessonId, { materialId });
}

/** Swaps a material with its neighbour. Positions are renumbered 0..n-1 so gaps/duplicates heal. */
export async function moveMaterial(materialId: string, direction: "up" | "down", admin: AppUser) {
  const material = await prisma.lessonMaterial.findUnique({ where: { id: materialId }, select: { lessonId: true } });
  if (!material) throw new ApiError("NOT_FOUND", "Materiali nuk u gjet.");

  await prisma.$transaction(async (tx) => {
    const siblings = await tx.lessonMaterial.findMany({
      where: { lessonId: material.lessonId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    const ids = siblings.map((s) => s.id);
    const index = ids.indexOf(materialId);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index === -1 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    for (const [position, id] of ids.entries()) {
      await tx.lessonMaterial.update({ where: { id }, data: { position } });
    }
  });
  await audit(admin.id, "material.reorder", "lesson", material.lessonId, { materialId, direction });
}
