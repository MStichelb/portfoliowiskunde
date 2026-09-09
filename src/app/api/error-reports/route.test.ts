import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorReportRateLimitError } from "@/lib/error-report-rate-limit";
import { ERROR_REPORT_GENERIC_ERROR_MESSAGE, ERROR_REPORT_RATE_LIMIT_MESSAGE } from "@/lib/error-report-submission-feedback";

const mocks = vi.hoisted(() => ({
  canAccessPublicLearningSpace: vi.fn(),
  createErrorReport: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  getVisibleExercise: vi.fn(),
  getVisiblePortfolioContext: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: mocks.getAuthenticatedUser }));
vi.mock("@/lib/public-access", () => ({ canAccessPublicLearningSpace: mocks.canAccessPublicLearningSpace }));
vi.mock("@/lib/repositories", () => ({
  createErrorReport: mocks.createErrorReport,
  getVisibleExercise: mocks.getVisibleExercise,
  getVisiblePortfolioContext: mocks.getVisiblePortfolioContext,
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("REPORT_RATE_LIMIT_SECRET", "error-report-rate-limit-secret");
  mocks.getAuthenticatedUser.mockResolvedValue({ id: "student-1", role: "student", status: "active" });
  mocks.getVisibleExercise.mockResolvedValue({ id: "exercise-1", portfolioId: "portfolio-1", learningSpaceId: "space-5" });
  mocks.getVisiblePortfolioContext.mockResolvedValue({ id: "portfolio-1", learningSpaceId: "space-5" });
  mocks.canAccessPublicLearningSpace.mockResolvedValue(true);
  mocks.createErrorReport.mockResolvedValue({ issueId: "issue-1" });
});

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/error-reports", () => {
  it("stores the authenticated user through the shared v2 create flow", async () => {
    const response = await POST(request({ portfolioId: "portfolio-1", exerciseCode: "5b", documentKind: "assignment", variant: null, message: "De opgave bevat een typfout." }));

    expect(response.status).toBe(200);
    expect(mocks.createErrorReport).toHaveBeenCalledWith(expect.objectContaining({
      learningSpaceId: "space-5",
      portfolioId: "portfolio-1",
      exerciseCode: "5b",
      documentKind: "assignment",
      variant: null,
      reporterUserId: "student-1",
    }));
    expect(mocks.createErrorReport.mock.calls[0][0]).not.toHaveProperty("reporterName");
    expect(mocks.createErrorReport.mock.calls[0][0].exerciseId).toBeUndefined();
  });

  it("distinguishes solution-page assets from the global final-solutions document", async () => {
    await POST(request({ exerciseId: "exercise-1", documentKind: "exercise_solution", variant: "standard", message: "Fout in de uitwerking." }));
    expect(mocks.createErrorReport).toHaveBeenLastCalledWith(expect.objectContaining({
      exerciseId: "exercise-1",
      documentKind: "exercise_solution",
    }));

    await POST(request({ portfolioId: "portfolio-1", exerciseCode: "5b", documentKind: "final_solutions", variant: "standard", message: "Fout in het document." }));
    expect(mocks.createErrorReport).toHaveBeenLastCalledWith(expect.objectContaining({
      portfolioId: "portfolio-1",
      documentKind: "final_solutions",
    }));
  });

  it("does not create reports for anonymous users or users without LearningSpace access", async () => {
    mocks.getAuthenticatedUser.mockResolvedValueOnce(null);
    expect((await POST(request({ exerciseId: "exercise-1", message: "Niet aangemeld" }))).status).toBe(401);

    mocks.canAccessPublicLearningSpace.mockResolvedValueOnce(false);
    expect((await POST(request({ exerciseId: "exercise-1", message: "Geen toegang" }))).status).toBe(404);
    expect(mocks.createErrorReport).not.toHaveBeenCalled();
  });

  it("keeps the honeypot short-circuit without creating a report", async () => {
    const response = await POST(request({ exerciseId: "exercise-1", message: "Robot", website: "https://spam.invalid" }));

    expect(response.status).toBe(200);
    expect(mocks.getAuthenticatedUser).not.toHaveBeenCalled();
    expect(mocks.createErrorReport).not.toHaveBeenCalled();
  });

  it("scopes authenticated rate-limit keys per user instead of shared IP", async () => {
    await POST(request({ exerciseId: "exercise-1", message: "Eerste melding" }));
    const firstUserKey = mocks.createErrorReport.mock.calls[0][0].rateLimitKey;

    mocks.getAuthenticatedUser.mockResolvedValueOnce({ id: "student-2", role: "student", status: "active" });
    await POST(request({ exerciseId: "exercise-1", message: "Andere leerling" }));
    const secondUserKey = mocks.createErrorReport.mock.calls[1][0].rateLimitKey;

    await POST(request({ exerciseId: "exercise-1", message: "Zelfde leerling" }));
    const repeatedFirstUserKey = mocks.createErrorReport.mock.calls[2][0].rateLimitKey;

    expect(firstUserKey).not.toBe(secondUserKey);
    expect(repeatedFirstUserKey).toBe(firstUserKey);
  });

  it("returns a dedicated safe rate-limit response and keeps other failures generic", async () => {
    mocks.createErrorReport.mockRejectedValueOnce(new ErrorReportRateLimitError());
    const limited = await POST(request({ exerciseId: "exercise-1", message: "Te veel" }));
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toEqual({ error: ERROR_REPORT_RATE_LIMIT_MESSAGE });

    mocks.createErrorReport.mockRejectedValueOnce(new Error("database details"));
    const failed = await POST(request({ exerciseId: "exercise-1", message: "Databasefout" }));
    expect(failed.status).toBe(400);
    await expect(failed.json()).resolves.toEqual({ error: ERROR_REPORT_GENERIC_ERROR_MESSAGE });
  });
});

function request(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/error-reports", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "192.0.2.10" },
    body: JSON.stringify(body),
  });
}
