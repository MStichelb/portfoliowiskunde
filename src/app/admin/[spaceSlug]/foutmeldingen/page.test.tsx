import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canManageLearningSpace: vi.fn(),
  getAdminLearningSpaceBySlug: vi.fn(),
  getGroupedErrorReportIssues: vi.fn(),
  listErrorReportsForIssues: vi.fn(),
  requireAdminUser: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }) }));
vi.mock("@/lib/auth", () => ({ requireAdminUser: mocks.requireAdminUser }));
vi.mock("@/lib/authorization", () => ({ canManageLearningSpace: mocks.canManageLearningSpace }));
vi.mock("@/lib/repositories", () => ({
  getAdminLearningSpaceBySlug: mocks.getAdminLearningSpaceBySlug,
  getGroupedErrorReportIssues: mocks.getGroupedErrorReportIssues,
  listErrorReportsForIssues: mocks.listErrorReportsForIssues,
}));
vi.mock("@/app/components/admin-space-header", () => ({ AdminSpaceHeader: () => <header>Beheer</header> }));
vi.mock("@/app/components/error-report-groups", () => ({ GroupedErrorReportInbox: ({ issues }: { issues: Array<{ id: string }> }) => <div>Issues: {issues.length}</div> }));

import SpaceReportsPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdminUser.mockResolvedValue({ id: "teacher-1", role: "teacher", status: "active" });
  mocks.getAdminLearningSpaceBySlug.mockResolvedValue({ id: "space-5", slug: "5wis" });
  mocks.canManageLearningSpace.mockResolvedValue(true);
  mocks.getGroupedErrorReportIssues.mockResolvedValue([{ id: "issue-1" }, { id: "issue-2" }]);
  mocks.listErrorReportsForIssues.mockResolvedValue([{ id: "report-1", issueId: "issue-1" }]);
});

describe("LearningSpace grouped error report page", () => {
  it("loads one grouped overview and one bulk detail query", async () => {
    const markup = renderToStaticMarkup(await SpaceReportsPage({ params: Promise.resolve({ spaceSlug: "5wis" }) }));

    expect(markup).toContain("Issues: 2");
    expect(mocks.getGroupedErrorReportIssues).toHaveBeenCalledTimes(1);
    expect(mocks.getGroupedErrorReportIssues).toHaveBeenCalledWith("space-5");
    expect(mocks.listErrorReportsForIssues).toHaveBeenCalledTimes(1);
    expect(mocks.listErrorReportsForIssues).toHaveBeenCalledWith(["issue-1", "issue-2"], "space-5");
  });
});
