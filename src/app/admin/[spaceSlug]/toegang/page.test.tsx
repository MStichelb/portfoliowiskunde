import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/components/flash-toast", () => ({
  useToast: () => vi.fn(),
  ExerciseNoteFeedback: () => null,
  FlashToast: ({ type, message, feedbackKey }: { type: string; message: string; feedbackKey?: string }) => <span data-toast={type} data-feedback-key={feedbackKey}>{message}</span>,
}));


import type { AppUser } from "@/lib/identity";
import type { LearningSpace } from "@/lib/repositories";

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  canManageLearningSpace: vi.fn(),
  canManageLearningSpaceTeacherAccess: vi.fn(),
  canManageLearningSpaceStudentAccess: vi.fn(),
  getAdminLearningSpaceBySlug: vi.fn(),
  listLearningSpaceTeachers: vi.fn(),
  listLearningSpaceTeacherCandidates: vi.fn(),
  listLearningSpaceGroupMappings: vi.fn(),
  listKnownExternalGroups: vi.fn(),
  listLearningSpaceIndividualStudentAccess: vi.fn(),
  listLearningSpaceIndividualStudentCandidates: vi.fn(),
  listLearningSpaceStudentRoster: vi.fn(),
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
  canManageLearningSpaceTeacherAccess: mocks.canManageLearningSpaceTeacherAccess,
  canManageLearningSpaceStudentAccess: mocks.canManageLearningSpaceStudentAccess,
}));
vi.mock("@/lib/repositories", () => ({ getAdminLearningSpaceBySlug: mocks.getAdminLearningSpaceBySlug }));
vi.mock("@/lib/learning-space-student-roster", () => ({ listLearningSpaceStudentRoster: mocks.listLearningSpaceStudentRoster }));
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
    mocks.canManageLearningSpaceTeacherAccess.mockResolvedValue(false);
    mocks.canManageLearningSpaceStudentAccess.mockResolvedValue(false);
    mocks.listLearningSpaceTeachers.mockResolvedValue([]);
    mocks.listLearningSpaceTeacherCandidates.mockResolvedValue([]);
    mocks.listLearningSpaceGroupMappings.mockResolvedValue([]);
    mocks.listKnownExternalGroups.mockResolvedValue([]);
    mocks.listLearningSpaceIndividualStudentAccess.mockResolvedValue([]);
    mocks.listLearningSpaceIndividualStudentCandidates.mockResolvedValue([]);
    mocks.listLearningSpaceStudentRoster.mockResolvedValue([]);
  });

  it("starts on Teachers and keeps all four existing sections mounted", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("owner", "teacher"));
    const markup = renderToStaticMarkup(await LearningSpaceAccessPage({ params: Promise.resolve({ spaceSlug: "5" }) }));
    const panels = [...markup.matchAll(/<div id="access-panel-([^"]+)"[^>]*>/g)];
    expect(panels.map((panel) => panel[1])).toEqual(["teachers", "groups", "individual", "students"]);
    expect(panels.filter((panel) => !panel[0].includes('hidden=""')).map((panel) => panel[1])).toEqual(["teachers"]);
    expect(markup).toContain('aria-label="Toegang tot deze leeromgeving"');
    expect(markup).toContain('class="learning-space-settings-layout"');
    const navigation = markup.match(/<nav[^>]*aria-label="Toegang tot deze leeromgeving"[\s\S]*?<\/nav>/)?.[0] ?? "";
    expect([...navigation.matchAll(/<button[^>]*aria-controls="access-panel-([^"]+)"[^>]*>([^<]+)<\/button>/g)]
      .map((button) => [button[1], button[2]])).toEqual([
        ["teachers", "Leraren"], ["groups", "Groepen"], ["individual", "Individueel"], ["students", "Leerlingen"],
      ]);
    expect([...navigation.matchAll(/role="group" aria-label="([^"]+)"/g)].map((group) => group[1]))
      .toEqual(["Leraren", "Koppelen", "Leerlingen"]);
    expect(markup).not.toContain("Leerlingen koppelen");
  });

  it.each([
    [{ groupSaved: "1" }, "groups", "Groepskoppeling bijgewerkt."],
    [{ groupError: "Groep mislukt" }, "groups", "Groep mislukt"],
    [{ studentSaved: "1" }, "individual", "Individuele toegang bijgewerkt."],
    [{ studentError: "Leerling mislukt" }, "individual", "Leerling mislukt"],
    [{ accessSaved: "1" }, "teachers", "Lerarentoegang bijgewerkt."],
    [{ accessError: "Rol wijzigen mislukt" }, "teachers", "Rol wijzigen mislukt"],
  ] as const)("uses central flash feedback while retaining the selected section (%j)", async (query, section, feedback) => {
    mocks.requireAdminUser.mockResolvedValue(user("owner", "teacher"));
    const markup = renderToStaticMarkup(await LearningSpaceAccessPage({ params: Promise.resolve({ spaceSlug: "5" }), searchParams: Promise.resolve(query) }));
    const panels = [...markup.matchAll(/<div id="access-panel-([^"]+)"[^>]*>/g)];
    expect(panels.filter((panel) => !panel[0].includes('hidden=""')).map((panel) => panel[1])).toEqual([section]);
    expect(markup).toContain(feedback);
    expect(markup).toContain(`data-feedback-key="${Object.keys(query)[0]}"`);
    expect(markup).toContain(`data-toast="${Object.keys(query)[0].endsWith("Error") ? "error" : "success"}"`);
    expect(markup).not.toContain("save-feedback");
    expect(markup).not.toContain("success-message");
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
    expect(markup).not.toContain("teacher-admin-indicator");
    expect(markup).not.toContain("Toevoegen");
    expect(markup).not.toContain("Wijzigen");
    expect(markup).not.toContain("Lerarentoegang verwijderen");
    expect(markup).not.toContain("<form");
    expect(markup).not.toContain("<select");
    expect(markup).not.toContain("Klik op een rol om deze te wijzigen.");
    expect(mocks.listLearningSpaceTeacherCandidates).not.toHaveBeenCalled();
  });

  it("marks only superadmins with a Crown beside their name", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("editor", "teacher"));
    mocks.listLearningSpaceTeachers.mockResolvedValue([
      { userId: "admin", firstName: "Ada", lastName: "Admin", role: "viewer", isSuperadmin: true },
      { userId: "teacher", firstName: "Tess", lastName: "Teacher", role: "viewer", isSuperadmin: false },
    ]);

    const markup = renderToStaticMarkup(await LearningSpaceAccessPage({ params: Promise.resolve({ spaceSlug: "5" }) }));

    expect((markup.match(/teacher-admin-indicator/g) ?? [])).toHaveLength(1);
    expect(markup).toContain('title="Hoofdbeheerder"');
    expect(markup).toContain("Admin");
    expect(markup).toContain("Teacher");
  });

  it.each([
    ["owner", user("owner", "teacher")],
    ["superadmin", user("superadmin", "superadmin")],
  ] as const)("shows compact controls to a %s while keeping owners read-only", async (_label, actor) => {
    mocks.requireAdminUser.mockResolvedValue(actor);
    mocks.canManageLearningSpaceTeacherAccess.mockResolvedValue(true);
    mocks.canManageLearningSpaceStudentAccess.mockResolvedValue(true);
    mocks.listLearningSpaceTeachers.mockResolvedValue(teachers);
    mocks.listLearningSpaceTeacherCandidates.mockResolvedValue([
      { userId: "candidate", displayName: "Nieuwe Leraar", firstName: "Nieuwe", lastName: "Leraar" },
    ]);

    const markup = renderToStaticMarkup(await LearningSpaceAccessPage({ params: Promise.resolve({ spaceSlug: "5" }) }));

    expect(markup).toContain("Nieuwe Leraar");
    expect(markup).toContain("Toevoegen");
    expect(markup).toContain("Klik op een rol om deze te wijzigen. De eigenaar kan geen andere rol krijgen.");
    expect(markup).not.toContain("Maak kijker");
    expect(markup).not.toContain("Maak bewerker");
    expect(markup).not.toContain("Wijzigen");
    expect(markup).toContain("Lerarentoegang verwijderen?");
    expect(markup).toContain('<option value="viewer" selected="">Kijker</option>');
    expect(markup).toContain('<option value="editor">Bewerker</option>');
    expect((markup.match(/popover="auto"/g) ?? [])).toHaveLength(2);
    expect(markup).toContain('aria-label="Rol van Elias Editor wijzigen"');
    expect(markup).toContain('aria-label="Rol van Vera Viewer wijzigen"');
    expect(markup).not.toContain('aria-label="Rol van Olivia Owner wijzigen"');
    expect((markup.match(/role="menuitemradio" aria-checked="true"/g) ?? [])).toHaveLength(2);
    expect((markup.match(/<select/g) ?? [])).toHaveLength(4);
    expect(mocks.listLearningSpaceTeacherCandidates).toHaveBeenCalledWith(space.id);
    expect((markup.match(/aria-label="Lerarentoegang verwijderen\?"/g) ?? [])).toHaveLength(2);
  });

  it("splits class and other Smartschool groups and excludes existing mappings", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("owner", "teacher"));
    mocks.canManageLearningSpaceTeacherAccess.mockResolvedValue(true);
    mocks.canManageLearningSpaceStudentAccess.mockResolvedValue(true);
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
    expect(markup).not.toContain(">Koppelen</button>");
    expect(markup).not.toContain("Groepskoppeling verwijderen?");
  });

  it("shows only student-access controls to an editor when delegation is enabled", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("editor", "teacher"));
    mocks.canManageLearningSpaceStudentAccess.mockResolvedValue(true);
    mocks.listKnownExternalGroups.mockResolvedValue([
      { provider: "smartschool", externalGroupId: "class-5", externalGroupName: "5WEWI" },
    ]);
    mocks.listLearningSpaceIndividualStudentCandidates.mockResolvedValue([
      { userId: "student-2", displayName: "Bram Janssens", firstName: "Bram", lastName: "Janssens", className: "6WIS", status: "active" },
    ]);

    const markup = renderToStaticMarkup(await LearningSpaceAccessPage({ params: Promise.resolve({ spaceSlug: "5" }) }));

    expect(markup).toContain("Koppelen");
    expect(markup).toContain("Leerling toevoegen");
    expect(markup).not.toContain("Nieuwe Leraar");
    expect(markup).not.toContain("teacher-role-action");
    expect(mocks.listKnownExternalGroups).toHaveBeenCalled();
    expect(mocks.listLearningSpaceIndividualStudentCandidates).toHaveBeenCalledWith(space.id);
    expect(mocks.listLearningSpaceTeacherCandidates).not.toHaveBeenCalled();
  });

  it("shows individual students and add/remove controls to an owner", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("owner", "teacher"));
    mocks.canManageLearningSpaceTeacherAccess.mockResolvedValue(true);
    mocks.canManageLearningSpaceStudentAccess.mockResolvedValue(true);
    mocks.listLearningSpaceIndividualStudentAccess.mockResolvedValue([
      { userId: "student-1", displayName: "Anna De Smet", firstName: "Anna", lastName: "De Smet", className: "5WEWI", status: "active" },
    ]);
    mocks.listLearningSpaceIndividualStudentCandidates.mockResolvedValue([
      { userId: "student-2", displayName: "Bram Janssens", firstName: "Bram", lastName: "Janssens", className: "6WIS", status: "active" },
    ]);

    const markup = renderToStaticMarkup(await LearningSpaceAccessPage({ params: Promise.resolve({ spaceSlug: "5" }) }));

    expect(markup).toContain('<h2 id="individual-students-heading">Individueel</h2>');
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

  it("loads and renders the effective student roster with the correct count", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("editor", "teacher"));
    mocks.listLearningSpaceStudentRoster.mockResolvedValue([
      {
        userId: "group-student",
        displayName: "Anna De Smet",
        firstName: "Anna",
        lastName: "De Smet",
        className: "5WEWI6",
        relevantGroupNames: ["5WEWI6", "Uitdaging"],
        individualAccess: true,
        groupDerivedAccess: true,
        status: "active",
      },
      {
        userId: "individual-student",
        displayName: "Bram Janssens",
        firstName: "Bram",
        lastName: "Janssens",
        className: null,
        relevantGroupNames: [],
        individualAccess: true,
        groupDerivedAccess: false,
        status: "disabled",
      },
    ]);

    const markup = renderToStaticMarkup(await LearningSpaceAccessPage({ params: Promise.resolve({ spaceSlug: "5" }) }));

    expect(mocks.listLearningSpaceStudentRoster).toHaveBeenCalledWith(space.id);
    expect(markup).toContain('<h2 id="teachers-heading">Leraren</h2>');
    expect(markup).toContain('<h2 id="groups-heading">Groepen</h2>');
    expect(markup).toContain('<h2 id="individual-students-heading">Individueel</h2>');
    expect(markup).toContain('<h2 id="users-heading">Leerlingen</h2>');
    expect(markup).toContain("2 leerlingen");
    expect(markup).toContain("5WEWI6 • Uitdaging");
    expect(markup).toContain("Groep");
    expect(markup).toContain("Individueel");
    expect(markup).toContain("Uitgeschakeld");
    expect(markup).toContain("Nog geen leraren met toegang.");
  });

  it("uses singular count and renders the roster empty state", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("editor", "teacher"));

    const emptyMarkup = renderToStaticMarkup(await LearningSpaceAccessPage({ params: Promise.resolve({ spaceSlug: "5" }) }));
    expect(emptyMarkup).toContain("0 leerlingen");
    expect(emptyMarkup).toContain("Nog geen leerlingen met toegang tot deze leeromgeving.");

    mocks.listLearningSpaceStudentRoster.mockResolvedValue([{
      userId: "student-1", displayName: "Anna De Smet", firstName: "Anna", lastName: "De Smet", className: "5WEWI6",
      relevantGroupNames: ["5WEWI6"], individualAccess: false, groupDerivedAccess: true, status: "active",
    }]);
    const singularMarkup = renderToStaticMarkup(await LearningSpaceAccessPage({ params: Promise.resolve({ spaceSlug: "5" }) }));
    expect(singularMarkup).toContain("1 leerling");
    expect(singularMarkup).not.toContain("1 leerlingen");
  });
});

const teachers = [
  { userId: "owner", firstName: "Olivia", lastName: "Owner", role: "owner" as const, isSuperadmin: false },
  { userId: "editor", firstName: "Elias", lastName: "Editor", role: "editor" as const, isSuperadmin: false },
  { userId: "viewer", firstName: "Vera", lastName: "Viewer", role: "viewer" as const, isSuperadmin: false },
];

const space: LearningSpace = {
  id: "space-5", subjectId: "subject-wiskunde", subjectName: "Wiskunde", subjectIsActive: true,
  collectionLabelSingular: "Portfolio", collectionLabelPlural: "Portfolio's",
  exerciseLabelSingular: "Oefening", exerciseLabelPlural: "Oefeningen",
  name: "Vijfde jaar", slug: "5", shortLabel: "5WIS", description: "Oefenmateriaal", cardColor: "#DCEFE9",
  sortOrder: 5, isActive: true, archivedAt: null, editorsCanManageAccess: false, sourceType: "local", localSourcePath: null, oneDriveDriveId: null,
  oneDriveFolderId: null, oneDriveFolderPath: null, googleDriveFolderId: null, googleDriveFolderLabel: null, sources: [],
  activeSourceId: null, primarySource: null, mirrorSource: null,
};

function user(id: string, role: AppUser["role"]): AppUser {
  return { id, displayName: id, firstName: null, lastName: null, email: null, role, status: "active", classGroupOverrideId: null };
}
