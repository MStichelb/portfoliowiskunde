import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  getPubliclyAccessibleLearningSpaceIds: vi.fn(),
  getLearningSpaces: vi.fn(),
  getLearningSpaceBySlug: vi.fn(),
  getStudentPortfolios: vi.fn(),
  getThemes: vi.fn(),
  requirePublicLearningSpaceAccess: vi.fn(),
  listNotification: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
  redirect: vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); }),
}));
vi.mock("@/app/components/page-banner", () => ({ PageBanner: () => <div data-page-banner /> }));
vi.mock("@/app/components/student-handled-report-notification", () => ({
  StudentHandledReportNotificationBanner: ({ notification }: { notification: unknown }) => notification ? <div data-student-notification /> : null,
}));
vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: mocks.getAuthenticatedUser }));
vi.mock("@/lib/public-access", () => ({ getPubliclyAccessibleLearningSpaceIds: mocks.getPubliclyAccessibleLearningSpaceIds }));
vi.mock("@/lib/public-index", () => ({ isNextPrefetchRequest: vi.fn(() => false), preparePublicIndex: vi.fn() }));
vi.mock("@/lib/learning-space-access", () => ({ requirePublicLearningSpaceAccess: mocks.requirePublicLearningSpaceAccess }));
vi.mock("@/lib/repositories", () => ({
  getLearningSpaces: mocks.getLearningSpaces,
  getLearningSpaceBySlug: mocks.getLearningSpaceBySlug,
  getStudentPortfolios: mocks.getStudentPortfolios,
  getThemes: mocks.getThemes,
}));
vi.mock("@/lib/student-error-reports", () => ({ listPendingHandledReportNotificationsForCurrentUser: mocks.listNotification }));

import LearningSpacePage from "./[spaceSlug]/page";
import StudentPage from "./page";

const student = { id: "student-a", role: "student", status: "active" };
const notification = { reportIds: ["report-1"], count: 1, exerciseCode: "12a", singleLearningSpaceId: null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthenticatedUser.mockResolvedValue(student);
  mocks.getLearningSpaces.mockResolvedValue([
    { id: "space-5", slug: "5wis", name: "Vijfde jaar", description: "", cardColor: "#fff" },
    { id: "space-6", slug: "6wis", name: "Zesde jaar", description: "", cardColor: "#fff" },
  ]);
  mocks.getPubliclyAccessibleLearningSpaceIds.mockResolvedValue(["space-5", "space-6"]);
  mocks.getLearningSpaceBySlug.mockResolvedValue({ id: "space-5", slug: "5wis", name: "Vijfde jaar", isActive: true });
  mocks.getStudentPortfolios.mockResolvedValue([]);
  mocks.getThemes.mockResolvedValue([]);
  mocks.requirePublicLearningSpaceAccess.mockResolvedValue(student);
  mocks.listNotification.mockResolvedValue(notification);
});

describe("handled report banner placement", () => {
  it("places one banner after the page banner and before the multi-space dashboard content", async () => {
    const markup = renderToStaticMarkup(await StudentPage());
    expect(markup.match(/data-student-notification/g)).toHaveLength(1);
    expect(markup.indexOf("data-page-banner")).toBeLessThan(markup.indexOf("data-student-notification"));
    expect(markup.indexOf("data-student-notification")).toBeLessThan(markup.indexOf("Kies je leeromgeving"));
  });

  it("places the banner on the sole LearningSpace home reached by the existing redirect", async () => {
    mocks.listNotification.mockResolvedValue({ ...notification, singleLearningSpaceId: "space-5" });
    const markup = renderToStaticMarkup(await LearningSpacePage({ params: Promise.resolve({ spaceSlug: "5wis" }) }));
    expect(markup.match(/data-student-notification/g)).toHaveLength(1);
    expect(markup.indexOf("data-page-banner")).toBeLessThan(markup.indexOf("data-student-notification"));
    expect(markup.indexOf("data-student-notification")).toBeLessThan(markup.indexOf("Vijfde jaar"));
  });

  it("does not repeat the banner on a LearningSpace page when the student has multiple spaces", async () => {
    const markup = renderToStaticMarkup(await LearningSpacePage({ params: Promise.resolve({ spaceSlug: "5wis" }) }));
    expect(markup).not.toContain("data-student-notification");
  });

  it("does not show or query the banner for a teacher context", async () => {
    mocks.requirePublicLearningSpaceAccess.mockResolvedValue({ ...student, role: "teacher" });
    const markup = renderToStaticMarkup(await LearningSpacePage({ params: Promise.resolve({ spaceSlug: "5wis" }) }));
    expect(markup).not.toContain("data-student-notification");
    expect(mocks.listNotification).not.toHaveBeenCalled();
  });
});
