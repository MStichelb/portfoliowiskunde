import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { LearningSpace } from "@/lib/repositories";
import type { ManagedGroupUser, ManagedMembership, ManagedStorageConnection, ManagedUser, ManagedUserAccess } from "@/lib/user-management";

import { buildUserProfile, filterStudents, filterTeachers, UserManagementView } from "./user-management-view";
import { UserAccessDialogContent } from "./user-access-menu";
import { TeacherListFilters, updateUserFilterParams } from "./user-list-filters";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/gebruikers",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("UserManagementView", () => {
  it("toont voor superadmins alleen een statische status zonder beheeracties", () => {
    const markup = renderToStaticMarkup(<UserManagementView users={[managedUser({ id: "admin", role: "superadmin", firstName: "Ada", lastName: "Admin" })]} spaces={[]} memberships={[]} access={[]} storageConnections={[]} classGroups={[]} teacherGroups={[]} teacherGroupId={null} params={{}} />);
    const administratorSection = markup.slice(markup.indexOf('aria-labelledby="administrators-heading"'), markup.indexOf('aria-labelledby="teachers-heading"'));

    expect(administratorSection).toContain("Ada");
    expect(administratorSection).toContain("Actief");
    expect(administratorSection).not.toContain("<button");
    expect(administratorSection).not.toContain("<form");
  });

  it("zoekt op voor- en achternaam en combineert klas-, status- en toegangsfilters", () => {
    const users = [
      managedUser({ id: "marie", firstName: "Marie", lastName: "De Smet", effectiveClassGroupId: "class-5", hasIndividualAccess: true }),
      managedUser({ id: "anna", firstName: "Anna", lastName: "Aerts", effectiveClassGroupId: "class-6" }),
      managedUser({ id: "jonas", firstName: "Jonas", lastName: "Peeters", effectiveClassGroupId: "class-5", status: "disabled" }),
    ];
    expect(filterStudents(users, { q: "marie" }).map((user) => user.id)).toEqual(["marie"]);
    expect(filterStudents(users, { q: "smet" }).map((user) => user.id)).toEqual(["marie"]);
    expect(filterStudents(users, { class: "class-5", status: "disabled", sort: "first-desc" }).map((user) => user.id)).toEqual(["jonas"]);
    expect(filterStudents(users, { class: ["class-5", "class-6"], access: "with" }).map((user) => user.id)).toEqual(["marie"]);
    expect(filterStudents(users, { sort: "last-asc" }).map((user) => user.id)).toEqual(["anna", "marie", "jonas"]);
  });
  it("pagineert leerlingen en toont afzonderlijke status- en toegangsbediening", () => {
    const students = Array.from({ length: 26 }, (_, index) => managedUser({
      id: `student-${index + 1}`,
      firstName: `Voornaam ${index + 1}`,
      lastName: `Naam ${String(index + 1).padStart(2, "0")}`,
    }));
    const markup = renderToStaticMarkup(<UserManagementView
      users={students}
      spaces={[]}
      memberships={[]}
      access={[]}
      storageConnections={[]}
      classGroups={[]}
      teacherGroups={[]}
      teacherGroupId={null}
      params={{ size: "25", page: "1" }}
    />);
    expect(markup).toContain("Pagina 1 van 2");
    expect(markup).toContain("Zoek op naam of voornaam");
    expect(markup).toContain("Individuele toegang");
    expect(markup).toContain('role="switch"');
    expect(markup).not.toContain("Naam 26");
    expect(markup).not.toContain(">Toepassen<");
    expect(markup).not.toContain(">Filteren<");
    expect(markup.indexOf("Sortering")).toBeLessThan(markup.indexOf("Zoek op naam of voornaam"));
    expect(markup.indexOf("Zoek op naam of voornaam")).toBeLessThan(markup.indexOf("Klassen"));
    expect(markup).toContain('type="checkbox"');
  });

  it("behoudt andere filters en reset paginering bij directe wijzigingen", () => {
    const current = new URLSearchParams("q=anna&page=4&teacherStatus=disabled&class=6EWI");
    const next = updateUserFilterParams(current, { access: "with", class: ["6EWI", "6LWI"] });
    expect(next.get("q")).toBe("anna");
    expect(next.get("teacherStatus")).toBe("disabled");
    expect(next.getAll("class")).toEqual(["6EWI", "6LWI"]);
    expect(next.get("access")).toBe("with");
    expect(next.has("page")).toBe(false);
  });

  it("toont effectieve kijkrechten gededupliceerd, gesorteerd en begrensd", () => {
    const student = managedUser({ id: "student", firstName: "Sara", lastName: "Student" });
    const spaces = [1, 2, 3, 4, 5].map((number) => learningSpace(`space-${number}`, `S${number}`, number));
    const access: ManagedUserAccess[] = [
      { ...userAccess("student", "space-1", true), groupDerived: true },
      userAccess("student", "space-1", true),
      userAccess("student", "space-2", true),
      { ...userAccess("student", "space-3", false), groupDerived: true },
      { ...userAccess("student", "space-4", true), groupDerived: true },
      { ...userAccess("student", "space-5", false), groupDerived: true },
    ];

    const markup = renderToStaticMarkup(<UserManagementView users={[student]} spaces={spaces} memberships={[]} access={access} storageConnections={[]} classGroups={[]} teacherGroups={[]} teacherGroupId={null} params={{}} />);
    expect((markup.match(/title="Kijkrecht voor Space 1"/g) ?? [])).toHaveLength(1);
    expect(markup.indexOf('title="Kijkrecht voor Space 1"')).toBeLessThan(markup.indexOf('title="Kijkrecht voor Space 2"'));
    expect(markup.indexOf('title="Kijkrecht voor Space 2"')).toBeLessThan(markup.indexOf('title="Kijkrecht voor Space 3"'));
    expect(markup).not.toContain('title="Kijkrecht voor Space 4"');
    expect(markup).toContain('title="2 extra leeromgevingen">+ 2</span>');
  });

  it("maakt afgeleide toegang niet wijzigbaar en houdt individuele toegang apart", () => {
    const markup = renderToStaticMarkup(<UserAccessDialogContent
      userId="user-1"
      userName="Voorbeeld"
      userRole="teacher"
      titleId="access-title"
      action={async () => undefined}
      spaces={[
        { id: "space-group", name: "Via groep", shortLabel: "GROEP", groupDerived: true, individual: false, managementRole: null },
        { id: "space-extra", name: "Individueel", shortLabel: "EXTRA", groupDerived: false, individual: true, managementRole: null },
        { id: "space-editor", name: "Beheer", shortLabel: "BEHEER", groupDerived: false, individual: false, managementRole: "editor" },
      ]}
    />);
    expect(markup).toContain("Automatisch via Smartschoolgroep");
    expect(markup).toContain("Via beheerrecht als editor");
    expect(markup).toContain("Kijkrechten instellen voor Voorbeeld");
    expect(markup).toContain('class="lucide lucide-star');
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    const derivedControl = markup.match(/<input[^>]*aria-label="Via groep: Automatisch via Smartschoolgroep"[^>]*>/)?.[0];
    expect(derivedControl).toContain('checked=""');
    expect(derivedControl).toContain('disabled=""');
    expect(markup).toContain('aria-label="Individuele toegang tot Individueel"');
  });
  it("ordent en begrenst beheer- en individuele kijkrechten zonder duplicatie", () => {
    const teacher = managedUser({ id: "teacher", role: "teacher", firstName: "Tess", lastName: "Teacher" });
    const spaces = [1, 2, 3, 4, 5].map((number) => learningSpace(`space-${number}`, `S${number}`, number));
    const memberships: ManagedMembership[] = [
      membership("teacher", "space-1", "editor"),
      membership("teacher", "space-2", "owner"),
      membership("teacher", "space-3", "owner"),
      membership("teacher", "space-4", "editor"),
      membership("teacher", "space-5", "editor"),
    ];
    const access: ManagedUserAccess[] = [
      userAccess("teacher", "space-1", true),
      userAccess("teacher", "space-2", true),
      userAccess("teacher", "space-3", true),
      userAccess("teacher", "space-4", true),
      userAccess("teacher", "space-5", true),
    ];

    const managementMarkup = renderToStaticMarkup(<UserManagementView users={[teacher]} spaces={spaces} memberships={memberships} access={[]} storageConnections={[]} classGroups={[]} teacherGroups={[]} teacherGroupId={null} params={{}} />);
    expect(managementMarkup.indexOf('title="Eigenaar van Space 2"')).toBeLessThan(managementMarkup.indexOf('title="Eigenaar van Space 3"'));
    expect(managementMarkup.indexOf('title="Eigenaar van Space 3"')).toBeLessThan(managementMarkup.indexOf('title="Bewerker van Space 1"'));
    expect(managementMarkup).toContain('title="2 extra leeromgevingen">+ 2</span>');

    const viewerMarkup = renderToStaticMarkup(<UserManagementView users={[teacher]} spaces={spaces} memberships={[membership("teacher", "space-1", "editor")]} access={access} storageConnections={[]} classGroups={[]} teacherGroups={[]} teacherGroupId={null} params={{}} />);
    expect(viewerMarkup).not.toContain('title="Kijker van Space 1"');
    expect(viewerMarkup).toContain('title="Kijker van Space 2"');
    expect(viewerMarkup).toContain('title="Kijker van Space 4"');
    expect(viewerMarkup).not.toContain('title="Kijker van Space 5"');
    expect(viewerMarkup).toContain('title="1 extra leeromgevingen">+ 1</span>');
  });

  it("filtert leraren op owner, editor of individuele kijktoegang", () => {
    const teachers = [
      managedUser({ id: "owner", role: "teacher", lastName: "Owner" }),
      managedUser({ id: "editor", role: "teacher", lastName: "Editor" }),
      managedUser({ id: "viewer", role: "teacher", lastName: "Viewer" }),
      managedUser({ id: "group-only", role: "teacher", lastName: "Group" }),
    ];
    const memberships = [membership("owner", "space-5", "owner"), membership("editor", "space-5", "editor")];
    const access = [userAccess("viewer", "space-5", true), { ...userAccess("group-only", "space-5", false), groupDerived: true }];

    expect(filterTeachers(teachers, { teacherSpace: "space-5" }, memberships, access, []).map((teacher) => teacher.id))
      .toEqual(["editor", "owner", "viewer"]);
  });

  it("zet verbonden leraren eerst en behoudt de bestaande naamsortering binnen beide groepen", () => {
    const teachers = [
      managedUser({ id: "connected-z", role: "teacher", lastName: "Zwaan" }),
      managedUser({ id: "disconnected-b", role: "teacher", lastName: "Boon" }),
      managedUser({ id: "connected-a", role: "teacher", lastName: "Aerts" }),
      managedUser({ id: "disconnected-a", role: "teacher", lastName: "Anders" }),
    ];
    const connections: ManagedStorageConnection[] = [
      { userId: "connected-z", provider: "onedrive", status: "active" },
      { userId: "connected-a", provider: "google_drive", status: "disconnected" },
    ];

    expect(filterTeachers(teachers, {}, [], [], connections).map((teacher) => teacher.id))
      .toEqual(["connected-a", "disconnected-a", "disconnected-b", "connected-z"]);
    expect(filterTeachers(teachers, { teacherConnectionFirst: "1" }, [], [], connections).map((teacher) => teacher.id))
      .toEqual(["connected-a", "connected-z", "disconnected-a", "disconnected-b"]);
  });

  it("toont het leeromgevingfilter en verbinding-sortering zonder individuele-toegangfilter", () => {
    const markup = renderToStaticMarkup(<TeacherListFilters params={{ teacherSpace: "space-5", teacherConnectionFirst: "1" }} spaces={[{ id: "space-5", label: "5WIS" }]} />);
    expect(markup).toContain("Leeromgeving");
    expect(markup).toContain("Alle leeromgevingen");
    expect(markup).toContain("5WIS");
    expect(markup).toContain("Verbinding eerst");
    expect(markup).not.toContain("Individuele toegang");
  });
  it("bouwt rolbewuste profielen uit bestaande read-data", () => {
    const spaces = [learningSpace("space-5", "5WIS", 5), learningSpace("space-6", "6WIS", 6), learningSpace("space-extra", "EXTRA", 7)];
    const teacher = managedUser({ id: "teacher", role: "teacher", firstName: "Tess", lastName: "Teacher" });
    const student = managedUser({ id: "student", firstName: "Sara", lastName: "Student", effectiveClassName: "6EWI" });
    const groups: ManagedGroupUser[] = [
      { provider: "smartschool", externalGroupId: "teachers", externalGroupName: "Leerkrachten", userId: "teacher", displayName: "Tess Teacher", role: "teacher", status: "active" },
      { provider: "smartschool", externalGroupId: "class-6", externalGroupName: "6EWI", userId: "student", displayName: "Sara Student", role: "student", status: "active" },
    ];
    const teacherProfile = buildUserProfile(
      teacher,
      spaces,
      [membership("teacher", "space-5", "owner"), membership("teacher", "space-6", "editor")],
      [userAccess("teacher", "space-5", true), userAccess("teacher", "space-extra", true)],
      [{ userId: "teacher", provider: "onedrive", status: "active" }],
      groups,
    );
    expect(teacherProfile).toMatchObject({
      groups: ["Leerkrachten"],
      connections: [{ userId: "teacher", provider: "onedrive", status: "active" }],
      ownerSpaces: [{ id: "space-5" }],
      editorSpaces: [{ id: "space-6" }],
      viewerSpaces: [{ id: "space-extra" }],
    });

    const studentProfile = buildUserProfile(
      student,
      spaces,
      [],
      [
        { ...userAccess("student", "space-5", true), groupDerived: true },
        userAccess("student", "space-5", true),
        { ...userAccess("student", "space-6", false), groupDerived: true },
      ],
      [],
      groups,
    );
    expect(studentProfile).toMatchObject({ className: "6EWI", groups: ["6EWI"] });
    expect(studentProfile.viewerSpaces.map((space) => space.id)).toEqual(["space-5", "space-6"]);
  });

  it("toont een profielknop voor leraren en leerlingen", () => {
    const markup = renderToStaticMarkup(<UserManagementView
      users={[
        managedUser({ id: "teacher", role: "teacher", firstName: "Tess", lastName: "Teacher" }),
        managedUser({ id: "student", firstName: "Sara", lastName: "Student" }),
      ]}
      spaces={[]}
      memberships={[]}
      access={[]}
      storageConnections={[]}
      groupUsers={[]}
      classGroups={[]}
      teacherGroups={[]}
      teacherGroupId={null}
      params={{}}
    />);
    expect((markup.match(/lucide-circle-user-round/g) ?? [])).toHaveLength(2);
    expect(markup).toContain('aria-label="Profiel van Tess Teacher"');
    expect(markup).toContain('aria-label="Profiel van Sara Student"');
  });
});

function managedUser(overrides: Partial<ManagedUser>): ManagedUser {
  return {
    id: "user",
    displayName: "Voorbeeld Gebruiker",
    firstName: "Voorbeeld",
    lastName: "Gebruiker",
    email: null,
    role: "student",
    status: "active",
    classGroupOverrideId: null,
    hasSmartschoolIdentity: true,
    automaticClassGroupId: null,
    automaticClassName: null,
    effectiveClassGroupId: null,
    effectiveClassName: null,
    hasIndividualAccess: false,
    ...overrides,
  };
}

function membership(userId: string, learningSpaceId: string, role: "owner" | "editor"): ManagedMembership {
  return { userId, learningSpaceId, displayName: userId, role };
}

function userAccess(userId: string, learningSpaceId: string, individual: boolean): ManagedUserAccess {
  return { userId, learningSpaceId, individual, groupDerived: false, managementRole: null };
}

function learningSpace(id: string, shortLabel: string, sortOrder: number): LearningSpace {
  return {
    id,
    name: `Space ${sortOrder}`,
    slug: id,
    shortLabel,
    description: "",
    cardColor: "#FFFFFF",
    sortOrder,
    isActive: true,
    archivedAt: null,
    editorsCanManageAccess: false,
    sourceType: "local",
    localSourcePath: null,
    oneDriveDriveId: null,
    oneDriveFolderId: null,
    oneDriveFolderPath: null,
    googleDriveFolderId: null,
    googleDriveFolderLabel: null,
    sources: [],
    activeSourceId: null,
    primarySource: null,
    mirrorSource: null,
  };
}
