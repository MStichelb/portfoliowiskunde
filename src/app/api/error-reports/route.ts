import { createHmac } from "node:crypto";

import { getAuthenticatedUser } from "@/lib/auth";
import { canAccessLearningSpace } from "@/lib/authorization";
import { createErrorReport, getVisibleExercise } from "@/lib/repositories";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { exerciseId?: unknown; variant?: unknown; message?: unknown; reporterName?: unknown; website?: unknown } | null;
  if (!body || body.website) return Response.json({ ok: true });
  if (typeof body.exerciseId !== "string" || (body.variant !== "standard" && body.variant !== "alternative") || typeof body.message !== "string" || (body.reporterName !== undefined && typeof body.reporterName !== "string")) return Response.json({ error: "Ongeldige melding." }, { status: 400 });
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "Niet aangemeld." }, { status: 401 });
  const exercise = await getVisibleExercise(body.exerciseId);
  if (!exercise || !await canAccessLearningSpace(user, exercise.learningSpaceId)) return Response.json({ error: "Oefening niet gevonden." }, { status: 404 });
  const secret = process.env.REPORT_RATE_LIMIT_SECRET?.trim() || process.env.ADMIN_SESSION_SECRET?.trim() || process.env.ADMIN_PASSWORD?.trim();
  if (!secret) return Response.json({ error: "Meldingen zijn tijdelijk niet beschikbaar." }, { status: 503 });
  const visitor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const bucket = Math.floor(Date.now() / 600_000);
  const rateLimitKey = createHmac("sha256", secret).update(`${bucket}:${visitor}`).digest("base64url");
  try {
    await createErrorReport({ exerciseId: body.exerciseId, variant: body.variant, message: body.message, reporterName: body.reporterName, rateLimitKey });
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "De melding kon niet worden verstuurd." }, { status: 400 });
  }
}
