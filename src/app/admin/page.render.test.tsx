import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppUser } from "@/lib/identity";
import type { LearningSpace } from "@/lib/repositories";

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  getLearningSpaces: vi.fn(),
  getManageableLearningSpaceIds: vi.fn(),
  listManagedMemberships: vi.fn(),
  listManagedGroupMappings: vi.fn(),
  overview: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAdminUser: mocks.requireAdminUser }));
vi.mock("@/lib/authorization", () => ({ getManageableLearningSpaceIds: mocks.getManageableLearningSpaceIds }));
vi.mock("@/lib/repositories", () => ({ getLearningSpaces: mocks.getLearningSpaces }));
vi.mock("@/lib/user-management", () => ({
  listManagedMemberships: mocks.listManagedMemberships,
  listManagedGroupMappings: mocks.listManagedGroupMappings,
  isClassGroupName: (name: string) => /^[3-6]/.test(name.trim()),
}));
vi.mock("@/app/components/admin-learning-space-overview", () => ({
  AdminLearningSpaceOverview: (props: unknown) => {
    mocks.overview(props);
    return <div>Kaartoverzicht</div>;
  },
}));
vi.mock("@/app/components/learning-space-create-modal", () => ({ LearningSpaceCreateModal: () => <button>Leeromgeving toevoegen</button> }));
vi.mock("@/app/components/page-banner", () => ({ PageBanner: () => null }));
vi.mock("./actions", () => ({ createLearningSpaceAction: vi.fn() }));

import AdminPage from "./page";

describe("AdminPage overview reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminUser.mockResolvedValue(user);
    mocks.getLearningSpaces.mockResolvedValue([space]);
    mocks.getManageableLearningSpaceIds.mockResolvedValue([space.id]);
    mocks.listManagedMemberships.mockResolvedValue([{ learningSpaceId: space.id, userId: user.id, displayName: user.displayName, role: "owner" }]);
    mocks.listManagedGroupMappings.mockResolvedValue([]);
  });

  it("loads each overview dataset once and passes one combined card model", async () => {
    const markup = renderToStaticMarkup(await AdminPage({ searchParams: Promise.resolve({}) }));

    expect(markup).toContain("Kaartoverzicht");
    expect(mocks.getLearningSpaces).toHaveBeenCalledOnce();
    expect(mocks.getLearningSpaces).toHaveBeenCalledWith();
    expect(mocks.getManageableLearningSpaceIds).toHaveBeenCalledOnce();
    expect(mocks.listManagedMemberships).toHaveBeenCalledOnce();
    expect(mocks.listManagedGroupMappings).toHaveBeenCalledOnce();
    expect(mocks.overview).toHaveBeenCalledWith(expect.objectContaining({
      cards: [expect.objectContaining({ id: space.id, currentUserRole: "owner" })],
    }));
  });
});

const user: AppUser = {
  id: "owner", displayName: "Olivia Owner", firstName: "Olivia", lastName: "Owner", email: null,
  role: "teacher", status: "active", classGroupOverrideId: null,
};

const space: LearningSpace = {
  id: "space-5", name: "Vijfde jaar", slug: "5", shortLabel: "5WIS", description: "Oefenmateriaal", cardColor: "#DCEFE9",
  sortOrder: 5, isActive: true, archivedAt: null, editorsCanManageAccess: false, sourceType: "local", localSourcePath: null,
  oneDriveDriveId: null, oneDriveFolderId: null, oneDriveFolderPath: null, googleDriveFolderId: null, googleDriveFolderLabel: null,
  sources: [], activeSourceId: null, primarySource: null, mirrorSource: null,
};
