import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppUser } from "@/lib/identity";

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  canManageLearningSpace: vi.fn(),
  getLearningSpaceSourceStatus: vi.fn(),
  getAdminLearningSpaceBySlug: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));

vi.mock("@/lib/auth", () => ({ requireAdminUser: mocks.requireAdminUser }));
vi.mock("@/lib/authorization", () => ({ canManageLearningSpace: mocks.canManageLearningSpace }));
vi.mock("@/lib/learning-space-source-status", () => ({ getLearningSpaceSourceStatus: mocks.getLearningSpaceSourceStatus }));
vi.mock("@/lib/repositories", () => ({ getAdminLearningSpaceBySlug: mocks.getAdminLearningSpaceBySlug }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/app/components/admin-space-header", () => ({
  AdminSpaceHeader: ({ section }: { section: string }) => <header data-section={section}>Beheerheader</header>,
}));
vi.mock("@/app/components/learning-space-source-status-card", () => ({
  LearningSpaceSourceStatusOverview: () => <div>Vijf statusonderdelen</div>,
}));

import LearningSpaceStatusPage from "./page";

describe("LearningSpace status page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminUser.mockResolvedValue(user("superadmin"));
    mocks.canManageLearningSpace.mockResolvedValue(true);
    mocks.getAdminLearningSpaceBySlug.mockResolvedValue(space);
    mocks.getLearningSpaceSourceStatus.mockResolvedValue({ learningSpaceId: space.id });
  });

  it.each(["superadmin", "owner", "editor"])("renders stored status for an authorized %s", async (access) => {
    const currentUser = user(access === "superadmin" ? "superadmin" : "teacher", access);
    mocks.requireAdminUser.mockResolvedValue(currentUser);

    const markup = renderToStaticMarkup(await LearningSpaceStatusPage({ params: Promise.resolve({ spaceSlug: "5-wis" }) }));

    expect(markup).toContain('data-section="status"');
    expect(markup).toContain("<h2>Status</h2>");
    expect(markup).toContain("Overzicht op basis van opgeslagen gegevens. Er wordt geen live broncontrole uitgevoerd.");
    expect(markup).toContain("Vijf statusonderdelen");
    expect(mocks.canManageLearningSpace).toHaveBeenCalledWith(currentUser, space.id);
    expect(mocks.getLearningSpaceSourceStatus).toHaveBeenCalledWith(currentUser, space.id);
  });

  it.each(["student", "onbevoegde leraar"])("denies a %s without management rights", async (kind) => {
    mocks.requireAdminUser.mockResolvedValue(user(kind === "student" ? "student" : "teacher"));
    mocks.canManageLearningSpace.mockResolvedValue(false);

    await expect(LearningSpaceStatusPage({ params: Promise.resolve({ spaceSlug: "5-wis" }) })).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mocks.getLearningSpaceSourceStatus).not.toHaveBeenCalled();
  });
});

function user(role: AppUser["role"], id: string = role): AppUser {
  return { id, displayName: id, firstName: null, lastName: null, email: null, role, status: "active", classGroupOverrideId: null };
}

const space = {
  id: "space-5", name: "Vijfde jaar", slug: "5-wis", shortLabel: "5WIS", description: "Oefenmateriaal", cardColor: "#DCEFE9",
  sortOrder: 5, isActive: true, archivedAt: null, editorsCanManageAccess: false, sourceType: "onedrive" as const, localSourcePath: null,
  oneDriveDriveId: "drive", oneDriveFolderId: "folder", oneDriveFolderPath: "Portfolio/5", googleDriveFolderId: null,
  googleDriveFolderLabel: null, sources: [], activeSourceId: null, primarySource: null, mirrorSource: null,
};
