import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canAccessPublicLearningSpace: vi.fn(),
  createErrorReport: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  getVisibleExercise: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: mocks.getAuthenticatedUser }));
vi.mock("@/lib/public-access", () => ({ canAccessPublicLearningSpace: mocks.canAccessPublicLearningSpace }));
vi.mock("@/lib/repositories", () => ({
  createErrorReport: mocks.createErrorReport,
  getVisibleExercise: mocks.getVisibleExercise,
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("REPORT_RATE_LIMIT_SECRET", "error-report-rate-limit-secret");
  mocks.getAuthenticatedUser.mockResolvedValue({ id: "student-1", role: "student", status: "active" });
  mocks.getVisibleExercise.mockResolvedValue({ id: "exercise-1", portfolioId: "portfolio-1", learningSpaceId: "space-5" });
  mocks.canAccessPublicLearningSpace.mockResolvedValue(true);
  mocks.createErrorReport.mockResolvedValue({ issueId: "issue-1" });
});

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/error-reports", () => {
  it("stores the authenticated user through the shared v2 create flow", async () => {
    const response = await POST(request({ portfolioId: "portfolio-1", exerciseId: "exercise-1", documentKind: "assignment", variant: null, message: "De opgave bevat een typfout." }));

    expect(response.status).toBe(200);
    expect(mocks.createErrorReport).toHaveBeenCalledWith(expect.objectContaining({
      learningSpaceId: "space-5",
      portfolioId: "portfolio-1",
      exerciseId: "exercise-1",
      documentKind: "assignment",
      variant: null,
      reporterUserId: "student-1",
    }));
    expect(mocks.createErrorReport.mock.calls[0][0]).not.toHaveProperty("reporterName");
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
});

function request(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/error-reports", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "192.0.2.10" },
    body: JSON.stringify(body),
  });
}
