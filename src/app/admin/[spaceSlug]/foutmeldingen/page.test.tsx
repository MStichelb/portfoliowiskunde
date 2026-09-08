import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canManageLearningSpace: vi.fn(),
  getAdminLearningSpaceBySlug: vi.fn(),
  getGroupedErrorReportThreads: vi.fn(),
  getOldDoneErrorThreadCount: vi.fn(),
  listErrorReportIssuesForThreads: vi.fn(),
  requireAdminUser: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }) }));
vi.mock("@/lib/auth", () => ({ requireAdminUser: mocks.requireAdminUser }));
vi.mock("@/lib/authorization", () => ({ canManageLearningSpace: mocks.canManageLearningSpace }));
vi.mock("@/lib/repositories", () => ({
  getAdminLearningSpaceBySlug: mocks.getAdminLearningSpaceBySlug,
  getGroupedErrorReportThreads: mocks.getGroupedErrorReportThreads,
  getOldDoneErrorThreadCount: mocks.getOldDoneErrorThreadCount,
  listErrorReportIssuesForThreads: mocks.listErrorReportIssuesForThreads,
}));
vi.mock("@/app/components/admin-space-header", () => ({ AdminSpaceHeader: () => <header>Beheer</header> }));
vi.mock("@/app/components/error-report-groups", () => ({ GroupedErrorReportThreadInbox: ({ threads, oldDoneCount }: { threads: Array<{ id: string }>; oldDoneCount: number }) => <div>Threads: {threads.length}; cleanup: {oldDoneCount}</div> }));

import SpaceReportsPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdminUser.mockResolvedValue({ id: "teacher-1", role: "teacher", status: "active" });
  mocks.getAdminLearningSpaceBySlug.mockResolvedValue({ id: "space-5", slug: "5wis" });
  mocks.canManageLearningSpace.mockResolvedValue(true);
  mocks.getGroupedErrorReportThreads.mockResolvedValue([{ id: "thread-1" }, { id: "thread-2" }]);
  mocks.getOldDoneErrorThreadCount.mockResolvedValue(1);
  mocks.listErrorReportIssuesForThreads.mockResolvedValue([{ issueId: "issue-1", threadId: "thread-1" }]);
});

describe("LearningSpace grouped error report page", () => {
  it("loads one grouped overview and one bulk detail query", async () => {
    const markup = renderToStaticMarkup(await SpaceReportsPage({ params: Promise.resolve({ spaceSlug: "5wis" }) }));

    expect(markup).toContain("Threads: 2");
    expect(markup).toContain("cleanup: 1");
    expect(mocks.getGroupedErrorReportThreads).toHaveBeenCalledTimes(1);
    expect(mocks.getGroupedErrorReportThreads).toHaveBeenCalledWith("space-5");
    expect(mocks.getOldDoneErrorThreadCount).toHaveBeenCalledWith(undefined, "space-5");
    expect(mocks.listErrorReportIssuesForThreads).toHaveBeenCalledTimes(1);
    expect(mocks.listErrorReportIssuesForThreads).toHaveBeenCalledWith(["thread-1", "thread-2"], "space-5");
  });
});
