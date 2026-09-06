import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppUser } from "@/lib/identity";
import type { LearningSpace } from "@/lib/repositories";

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  canManageLearningSpace: vi.fn(),
  canConfigureLearningSpace: vi.fn(),
  getAdminLearningSpaceBySlug: vi.fn(),
  listLearningSpaceTeachers: vi.fn(),
  listLearningSpaceTeacherCandidates: vi.fn(),
  listLearningSpaceGroupMappings: vi.fn(),
  listKnownExternalGroups: vi.fn(),
  listLearningSpaceIndividualStudentAccess: vi.fn(),
  listLearningSpaceIndividualStudentCandidates: vi.fn(),
  saveTeacherAccess: vi.fn(),
  removeTeacherAccess: vi.fn(),
  saveGroupMapping: vi.fn(),
  removeGroupMapping: vi.fn(),
  saveStudentAccess: vi.fn(),
  removeStudentAccess: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));

vi.mock("@/lib/auth", () => ({ requireAdminUser: mocks.requireAdminUser }));
vi.mock("@/lib/authorization", () => ({
  canManageLearningSpace: mocks.canManageLearningSpace,
  canConfigureLearningSpace: mocks.canConfigureLearningSpace,
}));
vi.mock("@/lib/repositories", () => ({ getAdminLearningSpaceBySlug: mocks.getAdminLearningSpaceBySlug }));
vi.mock("@/lib/user-management", () => ({
  isClassGroupName: (name: string) => /^[3-6]/.test(name.trim()),
  listLearningSpaceTeachers: mocks.listLearningSpaceTeachers,
  listLearningSpaceTeacherCandidates: mocks.listLearningSpaceTeacherCandidates,
  listLearningSpaceGroupMappings: mocks.listLearningSpaceGroupMappings,
  listKnownExternalGroups: mocks.listKnownExternalGroups,
  listLearningSpaceIndividualStudentAccess: mocks.listLearningSpaceIndividualStudentAccess,
  listLearningSpaceIndividualStudentCandidates: mocks.listLearningSpaceIndividualStudentCandidates,
}));
vi.mock("./actions", () => ({
  saveLearningSpaceTeacherAccessAction: mocks.saveTeacherAccess,
  removeLearningSpaceTeacherAccessAction: mocks.removeTeacherAccess,
  saveLearningSpaceGroupMappingAction: mocks.saveGroupMapping,
  removeLearningSpaceGroupMappingAction: mocks.removeGroupMapping,
  saveLearningSpaceIndividualStudentAccessAction: mocks.saveStudentAccess,
  removeLearningSpaceIndividualStudentAccessAction: mocks.removeStudentAccess,
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/app/components/admin-space-header", () => ({
  AdminSpaceHeader: ({ section }: { section: string }) => <div data-section={section}>Leeromgevingheader</div>,
}));

import LearningSpaceAccessPage from "./page";

describe("LearningSpace access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAdminLearningSpaceBySlug.mockResolvedValue(space);
    mocks.canManageLearningSpace.mockResolvedValue(true);
    mocks.canConfigureLearningSpace.mockResolvedValue(false);
    mocks.listLearningSpaceTeachers.mockResolvedValue([]);
    mocks.listLearningSpaceTeacherCandidates.mockResolvedValue([]);
    mocks.listLearningSpaceGroupMappings.mockResolvedValue([]);
    mocks.listKnownExternalGroups.mockResolvedValue([]);
    mocks.listLearningSpaceIndividualStudentAccess.mockResolvedValue([]);
    mocks.listLearningSpaceIndividualStudentCandidates.mockResolvedValue([]);
  });

  it.each([
    ["superadmin", user("superadmin", "superadmin")],
    ["owner", user("owner", "teacher")],
    ["editor", user("editor", "teacher")],
  ] as const)("allows a %s through the management boundary", async (_label, actor) => {
    mocks.requireAdminUser.mockResolvedValue(actor);

    const markup = renderToStaticMarkup(await LearningSpaceAccessPage({ params: Promise.resolve({ spaceSlug: "5" }) }));

    expect(mocks.getAdminLearningSpaceBySlug).toHaveBeenCalledWith("5");
    expect(mocks.canManageLearningSpace).toHaveBeenCalledWith(actor, space.id);
    expect(markup).toContain('data-section="access"');
  });

  it("rejects a view-only teacher at the management boundary", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("viewer", "teacher"));
    mocks.canManageLearningSpace.mockResolvedValue(false);

    await expect(LearningSpaceAccessPage({ params: Promise.resolve({ spaceSlug: "5" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("rejects a student before the LearningSpace route is loaded", async () => {
    mocks.requireAdminUser.mockRejectedValue(new Error("Geen beheerrechten"));

    await expect(LearningSpaceAccessPage({ params: Promise.resolve({ spaceSlug: "5" }) })).rejects.toThrow("Geen beheerrechten");
    expect(mocks.getAdminLearningSpaceBySlug).not.toHaveBeenCalled();
  });

  it("keeps the teacher table read-only for an editor", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("editor", "teacher"));
    mocks.listLearningSpaceTeachers.mockResolvedValue(teachers);

    const markup = renderToStaticMarkup(await LearningSpaceAccessPage({ params: Promise.resolve({ spaceSlug: "5" }) }));

    expect(markup).toContain("Eigenaar");
    expect(markup).toContain("lucide-crown");
    expect(markup).toContain("Bewerker");
    expect(markup).toContain("lucide-pencil");
    expect(markup).toContain("Kijker");
    expect(markup).toContain("lucide-eye");
    expect(markup).not.toContain("Toevoegen");
    expect(markup).not.toContain("Wijzigen");
    expect(markup).not.toContain("Lerarentoegang verwijderen");
    expect(markup).not.toContain("<form");
    expect(markup).not.toContain("<select");
    expect(mocks.listLearningSpaceTeacherCandidates).not.toHaveBeenCalled();
  });

  it.each([
    ["owner", user("owner", "teacher")],
    ["superadmin", user("superadmin", "superadmin")],
  ] as const)("shows compact controls to a %s while keeping owners read-only", async (_label, actor) => {
    mocks.requireAdminUser.mockResolvedValue(actor);
    mocks.canConfigureLearningSpace.mockResolvedValue(true);
    mocks.listLearningSpaceTeachers.mockResolvedValue(teachers);
    mocks.listLearningSpaceTeacherCandidates.mockResolvedValue([
      { userId: "candidate", displayName: "Nieuwe Leraar", firstName: "Nieuwe", lastName: "Leraar" },
    ]);

    const markup = renderToStaticMarkup(await LearningSpaceAccessPage({ params: Promise.resolve({ spaceSlug: "5" }) }));

    expect(markup).toContain("Nieuwe Leraar");
    expect(markup).toContain("Toevoegen");
    expect(markup).toContain("Maak kijker");
    expect(markup).toContain("Maak bewerker");
    expect(markup).not.toContain("Wijzigen");
    expect(markup).toContain("Lerarentoegang verwijderen?");
    expect(markup).toContain('<option value="viewer" selected="">Kijker</option>');
    expect(markup).toContain('<option value="editor">Bewerker</option>');
    expect((markup.match(/class="secondary-button teacher-role-action"/g) ?? [])).toHaveLength(2);
    expect((markup.match(/<select/g) ?? [])).toHaveLength(4);
    expect(mocks.listLearningSpaceTeacherCandidates).toHaveBeenCalledWith(space.id);
    expect((markup.match(/aria-label="Lerarentoegang verwijderen\?"/g) ?? [])).toHaveLength(2);
  });

  it("splits class and other Smartschool groups and excludes existing mappings", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("owner", "teacher"));
    mocks.canConfigureLearningSpace.mockResolvedValue(true);
    mocks.listKnownExternalGroups.mockResolvedValue([
      { provider: "smartschool", externalGroupId: "class-5", externalGroupName: "5WEWI" },
      { provider: "smartschool", externalGroupId: "class-6", externalGroupName: "6WEWI" },
      { provider: "smartschool", externalGroupId: "club", externalGroupName: "Wiskundeclub" },
      { provider: "other", externalGroupId: "ignored", externalGroupName: "5Anders" },
    ]);
    mocks.listLearningSpaceGroupMappings.mockResolvedValue([
      { id: "mapping-6", learningSpaceId: space.id, provider: "smartschool", externalGroupId: "class-6", externalGroupName: "6WEWI" },
    ]);

    const markup = renderToStaticMarkup(await LearningSpaceAccessPage({ params: Promise.resolve({ spaceSlug: "5" }) }));

    expect(markup).toContain("<label>Klasgroep<select");
    expect(markup).toContain("<label>Andere groep<select");
    expect(markup).toContain('<option value="class-5">5WEWI</option>');
    expect(markup).toContain('<option value="club">Wiskundeclub</option>');
    expect(markup).not.toContain('<option value="class-6">');
    expect(markup).not.toContain("5Anders");
    expect(markup).toContain("6WEWI");
    expect(markup).toContain("Klasgroep");
    expect((markup.match(/>Koppelen<\/button>/g) ?? [])).toHaveLength(2);
  });

  it("shows scoped mappings read-only to an editor", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("editor", "teacher"));
    mocks.listLearningSpaceGroupMappings.mockResolvedValue([
      { id: "mapping-5", learningSpaceId: space.id, provider: "smartschool", externalGroupId: "class-5", externalGroupName: "5WEWI" },
    ]);

    const markup = renderToStaticMarkup(await LearningSpaceAccessPage({ params: Promise.resolve({ spaceSlug: "5" }) }));

    expect(mocks.listLearningSpaceGroupMappings).toHaveBeenCalledWith(space.id);
    expect(mocks.listKnownExternalGroups).not.toHaveBeenCalled();
    expect(markup).toContain("5WEWI");
    expect(markup).toContain("Klasgroep");
    expect(markup).not.toContain("Koppelen");
    expect(markup).not.toContain("Groepskoppeling verwijderen?");
  });

  it("shows individual students and add/remove controls to an owner", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("owner", "teacher"));
    mocks.canConfigureLearningSpace.mockResolvedValue(true);
    mocks.listLearningSpaceIndividualStudentAccess.mockResolvedValue([
      { userId: "student-1", displayName: "Anna De Smet", firstName: "Anna", lastName: "De Smet", className: "5WEWI", status: "active" },
    ]);
    mocks.listLearningSpaceIndividualStudentCandidates.mockResolvedValue([
      { userId: "student-2", displayName: "Bram Janssens", firstName: "Bram", lastName: "Janssens", className: "6WIS", status: "active" },
    ]);

    const markup = renderToStaticMarkup(await LearningSpaceAccessPage({ params: Promise.resolve({ spaceSlug: "5" }) }));

    expect(markup).toContain("Individuele leerlingen");
    expect(markup).toContain("Leerling toevoegen");
    expect(markup).toContain("De Smet");
    expect(markup).toContain("5WEWI");
    expect(markup).toContain("Individuele leerlingtoegang verwijderen?");
    expect(mocks.listLearningSpaceIndividualStudentAccess).toHaveBeenCalledWith(space.id);
    expect(mocks.listLearningSpaceIndividualStudentCandidates).toHaveBeenCalledWith(space.id);
  });

  it("shows only the individual list read-only to an editor", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("editor", "teacher"));
    mocks.listLearningSpaceIndividualStudentAccess.mockResolvedValue([
      { userId: "student-1", displayName: "Anna De Smet", firstName: "Anna", lastName: "De Smet", className: "5WEWI", status: "active" },
    ]);

    const markup = renderToStaticMarkup(await LearningSpaceAccessPage({ params: Promise.resolve({ spaceSlug: "5" }) }));

    expect(markup).toContain("De Smet");
    expect(markup).not.toContain("Leerling toevoegen");
    expect(markup).not.toContain("Individuele leerlingtoegang verwijderen?");
    expect(mocks.listLearningSpaceIndividualStudentCandidates).not.toHaveBeenCalled();
  });

  it("renders the group card and remaining users placeholder", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("editor", "teacher"));

    const markup = renderToStaticMarkup(await LearningSpaceAccessPage({ params: Promise.resolve({ spaceSlug: "5" }) }));

    expect(markup).toContain('<h2 id="teachers-heading">Leraren</h2>');
    expect(markup).toContain('<h2 id="groups-users-heading">Groepen koppelen</h2>');
    expect(markup).toContain('<h2 id="users-heading">Gebruikers</h2>');
    expect(markup).toContain("Nog geen leraren met toegang.");
    expect(markup).not.toContain("<table");
  });
});

const teachers = [
  { userId: "owner", firstName: "Olivia", lastName: "Owner", role: "owner" as const },
  { userId: "editor", firstName: "Elias", lastName: "Editor", role: "editor" as const },
  { userId: "viewer", firstName: "Vera", lastName: "Viewer", role: "viewer" as const },
];

const space: LearningSpace = {
  id: "space-5", name: "Vijfde jaar", slug: "5", shortLabel: "5WIS", description: "Oefenmateriaal", cardColor: "#DCEFE9",
  sortOrder: 5, isActive: true, archivedAt: null, sourceType: "local", localSourcePath: null, oneDriveDriveId: null,
  oneDriveFolderId: null, oneDriveFolderPath: null, googleDriveFolderId: null, googleDriveFolderLabel: null, sources: [],
  activeSourceId: null, primarySource: null, mirrorSource: null,
};

function user(id: string, role: AppUser["role"]): AppUser {
  return { id, displayName: id, firstName: null, lastName: null, email: null, role, status: "active", classGroupOverrideId: null };
}
