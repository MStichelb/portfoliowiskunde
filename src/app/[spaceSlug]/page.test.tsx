import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSpace: vi.fn(), getPortfolios: vi.fn(), getThemes: vi.fn(), access: vi.fn(), prepare: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/repositories", () => ({ getLearningSpaceBySlug: mocks.getSpace, getStudentPortfolios: mocks.getPortfolios, getThemes: mocks.getThemes }));
vi.mock("@/lib/learning-space-access", () => ({ requirePublicLearningSpaceAccess: mocks.access }));
vi.mock("@/lib/public-index", () => ({ isNextPrefetchRequest: () => false, preparePublicIndex: mocks.prepare }));
vi.mock("@/lib/learning-space-header", () => ({ getLearningSpaceHeaderAsset: async () => null }));
vi.mock("@/app/components/page-banner", () => ({ PageBanner: () => null }));
vi.mock("@/app/components/student-handled-report-notification", () => ({ StudentHandledReportNotificationBanner: () => null }));

import LearningSpacePage from "./page";

const space = { id: "space-5", slug: "5wis", isActive: true, subjectName: "Wiskunde", name: "Vijfde jaar", description: "Oefenmateriaal voor het vijfde jaar.", collectionLabelSingular: "Bundel", collectionLabelPlural: "Bundels" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSpace.mockResolvedValue(space);
  mocks.getPortfolios.mockResolvedValue([]);
  mocks.getThemes.mockResolvedValue([]);
  mocks.access.mockResolvedValue(null);
});

describe("public LearningSpace description", () => {
  it("shows the existing description beneath the title instead of the plural collection term", async () => {
    const markup = renderToStaticMarkup(await LearningSpacePage({ params: Promise.resolve({ spaceSlug: "5wis" }) }));
    expect(markup).toContain('<h1>Vijfde jaar</h1><p>Oefenmateriaal voor het vijfde jaar.</p>');
    expect(markup).not.toContain("<p>Bundels</p>");
    expect(mocks.access).toHaveBeenCalledWith("space-5", "/5wis");
    expect(mocks.prepare).toHaveBeenCalledWith("space-5", { isPrefetch: false });
  });

  it.each(["", "   "])("omits an empty description without substituting a collection label (%s)", async (description: string) => {
    mocks.getSpace.mockResolvedValue({ ...space, description });
    const markup = renderToStaticMarkup(await LearningSpacePage({ params: Promise.resolve({ spaceSlug: "5wis" }) }));
    expect(markup).toContain("<h1>Vijfde jaar</h1></header>");
    expect(markup).not.toContain("<p>Bundels</p>");
    expect(markup).not.toContain("<p></p>");
    expect(markup).not.toContain("undefined");
  });
});
