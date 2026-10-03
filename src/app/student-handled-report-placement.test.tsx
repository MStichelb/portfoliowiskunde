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
  orderLearningSpacesForUser: vi.fn(),
  getLearningSpaceHeaderAsset: vi.fn(),
  pageBanner: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
  redirect: vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); }),
}));
vi.mock("@/app/components/page-banner", () => ({
  PageBanner: (props: { customSrc?: string }) => {
    mocks.pageBanner(props);
    return <div data-page-banner data-custom-src={props.customSrc} />;
  },
}));
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
vi.mock("@/lib/user-learning-space-order", () => ({ orderLearningSpacesForUser: mocks.orderLearningSpacesForUser }));
vi.mock("@/lib/learning-space-header", () => ({ getLearningSpaceHeaderAsset: mocks.getLearningSpaceHeaderAsset }));

import LearningSpacePage from "./[spaceSlug]/page";
import StudentPage from "./page";

const student = { id: "student-a", role: "student", status: "active" };
const notification = { reportIds: ["report-1"], count: 1, exerciseCode: "12a", exerciseLabelSingular: "Oefening", singleLearningSpaceId: null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthenticatedUser.mockResolvedValue(student);
  mocks.getLearningSpaces.mockResolvedValue([
    { id: "space-5", slug: "5wis", subjectName: "Wiskunde", name: "Vijfde jaar", description: "", cardColor: "#fff", sortOrder: 5 },
    { id: "space-6", slug: "6wis", subjectName: "Wiskunde", name: "Zesde jaar", description: "", cardColor: "#fff", sortOrder: 6 },
  ]);
  mocks.getPubliclyAccessibleLearningSpaceIds.mockResolvedValue(["space-5", "space-6"]);
  mocks.getLearningSpaceBySlug.mockResolvedValue({
    id: "space-5", slug: "5wis", name: "Vijfde jaar", subjectName: "Wiskunde", isActive: true,
    collectionLabelSingular: "Portfolio", collectionLabelPlural: "Portfolio's",
    exerciseLabelSingular: "Oefening", exerciseLabelPlural: "Oefeningen",
  });
  mocks.getStudentPortfolios.mockResolvedValue([]);
  mocks.getThemes.mockResolvedValue([]);
  mocks.requirePublicLearningSpaceAccess.mockResolvedValue(student);
  mocks.listNotification.mockResolvedValue(notification);
  mocks.orderLearningSpacesForUser.mockImplementation(async (_userId: string, spaces: unknown[]) => spaces);
  mocks.getLearningSpaceHeaderAsset.mockResolvedValue(null);
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
    expect(markup).toContain("Portfolio&#x27;s");
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

  it("renders custom terminology independently of the subject and preserves the technical portfolio route", async () => {
    mocks.getLearningSpaceBySlug.mockResolvedValue({
      id: "space-5", slug: "5wis", name: "Vijfde jaar", subjectName: "Fysica", isActive: true,
      collectionLabelSingular: "bunDEL", collectionLabelPlural: "BUNDELS",
      exerciseLabelSingular: "OpGavE", exerciseLabelPlural: "OPGAVEN",
    });
    mocks.getStudentPortfolios.mockResolvedValue([{
      id: "portfolio-1", code: "1", title: "Krachten", themeId: null, cardColor: "#DCEFE9",
    }]);

    const markup = renderToStaticMarkup(await LearningSpacePage({ params: Promise.resolve({ spaceSlug: "5wis" }) }));

    expect(markup).toContain("Bundels");
    expect(markup).toContain("Fysica");
    expect(markup).toContain("Bundel 1");
    expect(markup).toContain('href="/5wis/portfolio/portfolio-1"');
    expect(markup).not.toContain("Portfolio 1");
    expect(markup).not.toContain("Overige bundels");
  });

  it("keeps the standard portfolio banner when no custom header was indexed", async () => {
    renderToStaticMarkup(await LearningSpacePage({ params: Promise.resolve({ spaceSlug: "5wis" }) }));

    expect(mocks.pageBanner).toHaveBeenLastCalledWith(expect.objectContaining({ customSrc: undefined }));
  });

  it("renders the local protected asset reference when a custom header was indexed", async () => {
    mocks.getLearningSpaceHeaderAsset.mockResolvedValue({ id: "header-id/with-safe-encoding" });

    const markup = renderToStaticMarkup(await LearningSpacePage({ params: Promise.resolve({ spaceSlug: "5wis" }) }));

    expect(mocks.pageBanner).toHaveBeenLastCalledWith(expect.objectContaining({
      customSrc: "/api/learning-space-headers/header-id%2Fwith-safe-encoding?space=5wis",
    }));
    expect(markup).toContain("/api/learning-space-headers/header-id%2Fwith-safe-encoding?space=5wis");
    expect(markup).not.toContain("onedrive");
  });

  it("shows Other only when real themed and unthemed portfolios coexist", async () => {
    mocks.getLearningSpaceBySlug.mockResolvedValue({
      id: "space-5", slug: "5wis", name: "Vijfde jaar", subjectName: "Wiskunde", isActive: true,
      collectionLabelSingular: "bunDEL", collectionLabelPlural: "BUNDELS",
      exerciseLabelSingular: "OpGavE", exerciseLabelPlural: "OPGAVEN",
    });
    mocks.getStudentPortfolios.mockResolvedValue([
      { id: "portfolio-1", code: "1", title: "Krachten", themeId: "theme-a", cardColor: "#DCEFE9" },
      { id: "portfolio-2", code: "2", title: "Energie", themeId: null, cardColor: "#DCEFE9" },
    ]);
    mocks.getThemes.mockResolvedValue([{ id: "theme-a", name: "Mechanica" }]);

    const markup = renderToStaticMarkup(await LearningSpacePage({ params: Promise.resolve({ spaceSlug: "5wis" }) }));

    expect(markup).toContain("Mechanica");
    expect(markup).toContain("Overige bundels");
  });
});
