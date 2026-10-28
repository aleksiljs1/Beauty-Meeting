import "server-only";
import type { AppUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { ApiError } from "@/server/http";
import { publishLessonChanged } from "@/server/realtime/publish";
import { audit } from "./audit";
import { renameFile } from "./material-files";

/** Rename and reorder lesson materials (files live in material-files.ts, links in materials.ts). */

/** Renames the library file, so the new name shows in every lesson that uses it. */
export async function renameMaterial(materialId: string, displayName: string, admin: AppUser) {
  const material = await prisma.lessonMaterial.findUnique({ where: { id: materialId }, select: { fileId: true } });
  if (!material) throw new ApiError("NOT_FOUND", "Materiali nuk u gjet.");
  await renameFile(material.fileId, displayName, admin);
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
  await publishLessonChanged(material.lessonId);
}
