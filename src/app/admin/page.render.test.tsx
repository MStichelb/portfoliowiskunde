import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppUser } from "@/lib/identity";
import type { LearningSpace } from "@/lib/repositories";

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  getLearningSpaces: vi.fn(),
  getAccessibleLearningSpaceIds: vi.fn(),
  getManageableLearningSpaceIds: vi.fn(),
  listManagedMemberships: vi.fn(),
  listManagedGroupMappings: vi.fn(),
  listActiveSubjects: vi.fn(),
  orderLearningSpacesForUser: vi.fn(),
  savePersonalLearningSpaceOrderAction: vi.fn(),
  overview: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAdminUser: mocks.requireAdminUser }));
vi.mock("@/lib/authorization", () => ({
  getAccessibleLearningSpaceIds: mocks.getAccessibleLearningSpaceIds,
  getManageableLearningSpaceIds: mocks.getManageableLearningSpaceIds,
}));
vi.mock("@/lib/repositories", () => ({ getLearningSpaces: mocks.getLearningSpaces }));
vi.mock("@/lib/learning-space-creation-options", () => ({ getLearningSpaceCreationOptions: vi.fn(async () => ({ templates: [], copies: [], links: [] })) }));
vi.mock("@/lib/subjects", () => ({ listActiveSubjects: mocks.listActiveSubjects }));
vi.mock("@/lib/user-learning-space-order", () => ({ orderLearningSpacesForUser: mocks.orderLearningSpacesForUser }));
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
vi.mock("./learning-space-order-actions", () => ({ savePersonalLearningSpaceOrderAction: mocks.savePersonalLearningSpaceOrderAction }));

import AdminPage from "./page";

describe("AdminPage overview reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminUser.mockResolvedValue(user);
    mocks.getLearningSpaces.mockResolvedValue([space]);
    mocks.getAccessibleLearningSpaceIds.mockResolvedValue([space.id]);
    mocks.getManageableLearningSpaceIds.mockResolvedValue([space.id]);
    mocks.listManagedMemberships.mockResolvedValue([{ learningSpaceId: space.id, userId: user.id, displayName: user.displayName, role: "owner" }]);
    mocks.listManagedGroupMappings.mockResolvedValue([]);
    mocks.listActiveSubjects.mockResolvedValue([{ id: "subject-wiskunde", name: "Wiskunde", sortOrder: 10, isActive: true }]);
    mocks.orderLearningSpacesForUser.mockImplementation(async (_userId: string, spaces: LearningSpace[]) => spaces);
  });

  it("loads each overview dataset once and passes one combined card model", async () => {
    const markup = renderToStaticMarkup(await AdminPage({ searchParams: Promise.resolve({}) }));

    expect(markup).toContain("Kaartoverzicht");
    expect(markup).toContain('href="/admin/bronprofielen"');
    expect(markup).toContain("Bronprofielen");
    expect(markup).not.toContain('href="/admin/systeem"');
    expect(mocks.getLearningSpaces).toHaveBeenCalledOnce();
    expect(mocks.getLearningSpaces).toHaveBeenCalledWith();
    expect(mocks.getAccessibleLearningSpaceIds).toHaveBeenCalledWith(user);
    expect(mocks.getManageableLearningSpaceIds).toHaveBeenCalledOnce();
    expect(mocks.listManagedMemberships).toHaveBeenCalledOnce();
    expect(mocks.listManagedGroupMappings).toHaveBeenCalledOnce();
    expect(mocks.orderLearningSpacesForUser).toHaveBeenCalledWith(user.id, [space]);
    expect(mocks.overview).toHaveBeenCalledWith(expect.objectContaining({
      cards: [expect.objectContaining({ id: space.id, currentUserRole: "owner" })],
      orderItems: [{ id: space.id, shortLabel: space.shortLabel, displayName: space.name }],
      orderAction: mocks.savePersonalLearningSpaceOrderAction,
    }));
  });

  it("shows the system entry only to a superadmin", async () => {
    mocks.requireAdminUser.mockResolvedValue({ ...user, role: "superadmin" });
    const markup = renderToStaticMarkup(await AdminPage({ searchParams: Promise.resolve({}) }));
    expect(markup).toContain('href="/admin/systeem"');
    expect(markup).toContain("Systeem");
  });

  it("includes view-only accessible spaces in personal ordering without adding admin cards", async () => {
    const viewOnly = { ...space, id: "space-6", slug: "6", shortLabel: "6WIS", name: "Zesde jaar", sortOrder: 6 };
    mocks.getLearningSpaces.mockResolvedValue([space, viewOnly]);
    mocks.getAccessibleLearningSpaceIds.mockResolvedValue([space.id, viewOnly.id]);
    mocks.orderLearningSpacesForUser.mockResolvedValue([viewOnly, space]);

    renderToStaticMarkup(await AdminPage({ searchParams: Promise.resolve({}) }));

    expect(mocks.overview).toHaveBeenCalledWith(expect.objectContaining({
      cards: [expect.objectContaining({ id: space.id })],
      orderItems: [
        { id: viewOnly.id, shortLabel: viewOnly.shortLabel, displayName: viewOnly.name },
        { id: space.id, shortLabel: space.shortLabel, displayName: space.name },
      ],
    }));
  });
});

const user: AppUser = {
  id: "owner", displayName: "Olivia Owner", firstName: "Olivia", lastName: "Owner", email: null,
  role: "teacher", status: "active", classGroupOverrideId: null,
};

const space: LearningSpace = {
  id: "space-5", subjectId: "subject-wiskunde", subjectName: "Wiskunde", subjectIsActive: true,
  collectionLabelSingular: "Portfolio", collectionLabelPlural: "Portfolio's",
  exerciseLabelSingular: "Oefening", exerciseLabelPlural: "Oefeningen",
  name: "Vijfde jaar", slug: "5", shortLabel: "5WIS", description: "Oefenmateriaal", cardColor: "#DCEFE9",
  sortOrder: 5, isActive: true, archivedAt: null, editorsCanManageAccess: false, sourceType: "local", localSourcePath: null,
  oneDriveDriveId: null, oneDriveFolderId: null, oneDriveFolderPath: null, googleDriveFolderId: null, googleDriveFolderLabel: null,
  sources: [], activeSourceId: null, primarySource: null, mirrorSource: null,
};
