import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  getPubliclyAccessibleLearningSpaceIds: vi.fn(),
  getLearningSpaces: vi.fn(),
  listPendingHandledReportNotificationsForCurrentUser: vi.fn(),
  listLearningSpaceOwnerNames: vi.fn(),
  redirect: vi.fn((destination: string) => { throw new Error(`NEXT_REDIRECT:${destination}`); }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: mocks.getAuthenticatedUser }));
vi.mock("@/lib/public-access", () => ({ getPubliclyAccessibleLearningSpaceIds: mocks.getPubliclyAccessibleLearningSpaceIds }));
vi.mock("@/lib/repositories", () => ({ getLearningSpaces: mocks.getLearningSpaces }));
vi.mock("@/lib/student-error-reports", () => ({ listPendingHandledReportNotificationsForCurrentUser: mocks.listPendingHandledReportNotificationsForCurrentUser }));
vi.mock("@/lib/user-management", () => ({ listLearningSpaceOwnerNames: mocks.listLearningSpaceOwnerNames }));
vi.mock("@/app/components/page-banner", () => ({ PageBanner: () => <div>banner</div> }));
vi.mock("@/app/components/student-handled-report-notification", () => ({ StudentHandledReportNotificationBanner: () => null }));

import StudentPage from "./page";

const spaces = [
  { id: "space-5", slug: "5wis", name: "5EWI 5LWI 5WEWI", description: "Portfolio's en uitwerkingen.", cardColor: "#dedcff" },
  { id: "space-6", slug: "6wis", name: "6EWI 6LWI 6WEWI", description: "Portfolio's en uitwerkingen.", cardColor: "#fff1cc" },
];

describe("StudentPage learning-space cards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthenticatedUser.mockResolvedValue({ id: "student-1", role: "student", status: "active" });
    mocks.getLearningSpaces.mockResolvedValue(spaces);
    mocks.getPubliclyAccessibleLearningSpaceIds.mockResolvedValue(spaces.map((space) => space.id));
    mocks.listPendingHandledReportNotificationsForCurrentUser.mockResolvedValue(null);
    mocks.listLearningSpaceOwnerNames.mockResolvedValue(new Map([
      ["space-5", ["Olivia Owner"]],
      ["space-6", ["Mathias Owner"]],
    ]));
  });

  it("shows only owner names as extra metadata when a user must choose between multiple spaces", async () => {
    const markup = renderToStaticMarkup(await StudentPage());

    expect(markup).toContain("Olivia Owner");
    expect(markup).toContain("Mathias Owner");
    expect(markup).toContain("lucide-user-round");
    expect(markup).not.toContain("Editor");
    expect(mocks.listLearningSpaceOwnerNames).toHaveBeenCalledWith(["space-5", "space-6"]);
  });

  it("keeps the existing direct redirect for a student with one accessible space", async () => {
    mocks.getPubliclyAccessibleLearningSpaceIds.mockResolvedValue(["space-5"]);
    await expect(StudentPage()).rejects.toThrow("NEXT_REDIRECT:/5wis");
    expect(mocks.listLearningSpaceOwnerNames).not.toHaveBeenCalled();
  });
});
