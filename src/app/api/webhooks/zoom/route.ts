import { NextResponse } from "next/server";
import { handleZoomWebhook } from "@/server/zoom/webhooks";

/**
 * Zoom event subscription endpoint. Authenticated by Zoom's HMAC signature over the RAW body
 * (read as text before any parsing), not by our session/Bearer auth.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  if (rawBody.length > 64 * 1024) return NextResponse.json({ error: "too_large" }, { status: 413 });
  const { status, body } = await handleZoomWebhook(rawBody, request.headers);
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
