import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ManagedUser } from "@/lib/user-management";

import { filterStudents, UserManagementView } from "./user-management-view";
import { UserAccessDialogContent } from "./user-access-menu";
import { updateUserFilterParams } from "./user-list-filters";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/gebruikers",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("UserManagementView", () => {
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
