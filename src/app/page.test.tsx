import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  getPubliclyAccessibleLearningSpaceIds: vi.fn(),
  getLearningSpaces: vi.fn(),
  orderLearningSpacesForUser: vi.fn(),
  listPendingHandledReportNotificationsForCurrentUser: vi.fn(),
  listLearningSpaceOwnerNames: vi.fn(),
  redirect: vi.fn((destination: string) => { throw new Error(`NEXT_REDIRECT:${destination}`); }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: mocks.getAuthenticatedUser }));
vi.mock("@/lib/public-access", () => ({ getPubliclyAccessibleLearningSpaceIds: mocks.getPubliclyAccessibleLearningSpaceIds }));
vi.mock("@/lib/repositories", () => ({ getLearningSpaces: mocks.getLearningSpaces }));
vi.mock("@/lib/user-learning-space-order", () => ({ orderLearningSpacesForUser: mocks.orderLearningSpacesForUser }));
vi.mock("@/lib/student-error-reports", () => ({ listPendingHandledReportNotificationsForCurrentUser: mocks.listPendingHandledReportNotificationsForCurrentUser }));
vi.mock("@/lib/user-management", () => ({ listLearningSpaceOwnerNames: mocks.listLearningSpaceOwnerNames }));
vi.mock("@/app/components/page-banner", () => ({ PageBanner: () => <div>banner</div> }));
vi.mock("@/app/components/student-handled-report-notification", () => ({ StudentHandledReportNotificationBanner: () => null }));

import StudentPage from "./page";

const spaces = [
  { id: "space-5", slug: "5wis", subjectName: "Wiskunde", name: "5EWI 5LWI 5WEWI", description: "Portfolio's en uitwerkingen.", cardColor: "#dedcff", sortOrder: 5 },
  { id: "space-6", slug: "6wis", subjectName: "Fysica", name: "6EWI 6LWI 6WEWI", description: "Portfolio's en uitwerkingen.", cardColor: "#fff1cc", sortOrder: 6 },
];

describe("StudentPage learning-space cards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthenticatedUser.mockResolvedValue({ id: "student-1", role: "student", status: "active" });
    mocks.getLearningSpaces.mockResolvedValue(spaces);
    mocks.getPubliclyAccessibleLearningSpaceIds.mockResolvedValue(spaces.map((space) => space.id));
    mocks.orderLearningSpacesForUser.mockImplementation(async (_userId: string, values: typeof spaces) => values);
    mocks.listPendingHandledReportNotificationsForCurrentUser.mockResolvedValue(null);
    mocks.listLearningSpaceOwnerNames.mockResolvedValue(new Map([
      ["space-5", ["Olivia Owner"]],
      ["space-6", ["Mathias Owner"]],
    ]));
  });

  it("shows subject, LearningSpace name and owner without the description", async () => {
    const markup = renderToStaticMarkup(await StudentPage());

    expect(markup).toContain("Olivia Owner");
    expect(markup).toContain("Mathias Owner");
    expect(markup).toContain("lucide-user-round");
    expect(markup).toContain("Fysica");
    expect(markup).toContain("Wiskunde");
    expect(markup).not.toContain("Portfolio&#x27;s en uitwerkingen.");
    expect(markup).not.toContain("Editor");
    expect(mocks.orderLearningSpacesForUser).toHaveBeenCalledWith("student-1", [
      expect.objectContaining({ id: "space-6", sortOrder: 10 }),
      expect.objectContaining({ id: "space-5", sortOrder: 20 }),
    ]);
    expect(mocks.listLearningSpaceOwnerNames).toHaveBeenCalledWith(["space-6", "space-5"]);
  });

  it("keeps the existing direct redirect for a student with one accessible space", async () => {
    mocks.getPubliclyAccessibleLearningSpaceIds.mockResolvedValue(["space-5"]);
    await expect(StudentPage()).rejects.toThrow("NEXT_REDIRECT:/5wis");
    expect(mocks.listLearningSpaceOwnerNames).not.toHaveBeenCalled();
  });

  it("renders the chooser in the effective personal order", async () => {
    mocks.orderLearningSpacesForUser.mockResolvedValue([spaces[1], spaces[0]]);

    const markup = renderToStaticMarkup(await StudentPage());

    expect(markup.indexOf("6EWI 6LWI 6WEWI")).toBeLessThan(markup.indexOf("5EWI 5LWI 5WEWI"));
  });
});
