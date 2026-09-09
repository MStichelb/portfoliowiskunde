import { getAuthenticatedUser } from "@/lib/auth";
import { authenticatedErrorReportRateLimitKey, ErrorReportRateLimitError } from "@/lib/error-report-rate-limit";
import { ERROR_REPORT_GENERIC_ERROR_MESSAGE, ERROR_REPORT_RATE_LIMIT_MESSAGE } from "@/lib/error-report-submission-feedback";
import { canAccessPublicLearningSpace } from "@/lib/public-access";
import { createErrorReport, getVisibleExercise, getVisiblePortfolioContext, type ErrorReportDocumentKind } from "@/lib/repositories";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { portfolioId?: unknown; exerciseId?: unknown; exerciseCode?: unknown; documentKind?: unknown; variant?: unknown; message?: unknown; website?: unknown } | null;
  if (!body || body.website) return Response.json({ ok: true });
  const documentKind = body.documentKind ?? (typeof body.portfolioId === "string" ? "final_solutions" : "exercise_solution");
  const portfolioFlow = typeof body.portfolioId === "string";
  if ((!portfolioFlow && typeof body.exerciseId !== "string")
    || (portfolioFlow && typeof body.exerciseCode !== "string")
    || (body.portfolioId !== undefined && typeof body.portfolioId !== "string")
    || !isDocumentKind(documentKind)
    || (body.variant !== undefined && body.variant !== null && body.variant !== "standard" && body.variant !== "alternative")
    || typeof body.message !== "string") return Response.json({ error: "Ongeldige melding." }, { status: 400 });
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "Niet aangemeld." }, { status: 401 });
  const context = portfolioFlow
    ? await getVisiblePortfolioContext(body.portfolioId as string)
    : await getVisibleExercise(body.exerciseId as string);
  if (!context || !await canAccessPublicLearningSpace(user, context.learningSpaceId)) {
    return Response.json({ error: portfolioFlow ? "Portfolio niet gevonden." : "Oefening niet gevonden." }, { status: 404 });
  }
  const secret = process.env.REPORT_RATE_LIMIT_SECRET?.trim() || process.env.ADMIN_SESSION_SECRET?.trim() || process.env.ADMIN_PASSWORD?.trim();
  if (!secret) return Response.json({ error: "Meldingen zijn tijdelijk niet beschikbaar." }, { status: 503 });
  const bucket = Math.floor(Date.now() / 600_000);
  const rateLimitKey = authenticatedErrorReportRateLimitKey(secret, user.id, bucket);
  try {
    await createErrorReport({
      exerciseId: portfolioFlow ? undefined : body.exerciseId as string,
      exerciseCode: portfolioFlow ? body.exerciseCode as string : undefined,
      learningSpaceId: context.learningSpaceId,
      portfolioId: portfolioFlow ? body.portfolioId as string : undefined,
      documentKind,
      variant: body.variant as "standard" | "alternative" | null | undefined,
      message: body.message,
      reporterUserId: user.id,
      rateLimitKey,
    });
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ErrorReportRateLimitError) {
      return Response.json({ error: ERROR_REPORT_RATE_LIMIT_MESSAGE }, { status: 429 });
    }
    return Response.json({ error: ERROR_REPORT_GENERIC_ERROR_MESSAGE }, { status: 400 });
  }
}

function isDocumentKind(value: unknown): value is ErrorReportDocumentKind {
  return value === "assignment" || value === "final_solutions" || value === "hints" || value === "exercise_solution";
}
