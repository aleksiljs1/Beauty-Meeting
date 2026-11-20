import { connection, NextResponse } from "next/server";
import { prisma } from "@/server/db";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Health check for the host (Railway): 200 when the app can reach the database, else 503.
 * Public on purpose (outside proxy.ts's matcher), so it says nothing beyond ok/not ok — the
 * reason goes to the server log only.
 */
export async function GET() {
  await connection(); // always checked per request, never prerendered or cached
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    console.error("[health] database check failed", (error as Error).message);
    return NextResponse.json({ ok: false }, { status: 503, headers: NO_STORE });
  }
}
