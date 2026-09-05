import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  getManageableLearningSpaceIds: vi.fn(),
  getLearningSpaces: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAdminUser: mocks.requireAdminUser }));
vi.mock("@/lib/authorization", () => ({ getManageableLearningSpaceIds: mocks.getManageableLearningSpaceIds }));
vi.mock("@/lib/repositories", () => ({ getLearningSpaces: mocks.getLearningSpaces }));
vi.mock("@/app/components/page-banner", () => ({ PageBanner: () => null }));
vi.mock("./actions", () => ({ createLearningSpaceAction: vi.fn(), logoutAction: vi.fn() }));

import AdminPage from "./page";

describe("admin LearningSpace creation entry point", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLearningSpaces.mockResolvedValue([]);
    mocks.getManageableLearningSpaceIds.mockResolvedValue([]);
  });

  it.each(["teacher", "superadmin"] as const)("shows the creation trigger to an active %s", async (role) => {
    mocks.requireAdminUser.mockResolvedValue(user(role));

    const markup = renderToStaticMarkup(await AdminPage({ searchParams: Promise.resolve({}) }));

    expect(markup).toContain("Leeromgeving toevoegen");
    expect(markup).toContain("lucide-folder-plus");
  });

  it("does not expose the admin creation flow to a student", async () => {
    mocks.requireAdminUser.mockRejectedValue(new Error("Geen beheerrechten"));

    await expect(AdminPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("Geen beheerrechten");
  });

  it("reopens the modal and displays a returned validation error", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("teacher"));

    const markup = renderToStaticMarkup(await AdminPage({ searchParams: Promise.resolve({ create: "1", createError: "invalid" }) }));

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Controleer de ingevulde gegevens.");
  });
});

function user(role: "teacher" | "superadmin") {
  return { id: `${role}-1`, displayName: role, firstName: null, lastName: null, email: null, role, status: "active" as const, classGroupOverrideId: null };
}
