import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ManagedUser } from "@/lib/user-management";

import { filterStudents, UserManagementView } from "./user-management-view";
import { UserAccessMenu } from "./user-access-menu";

describe("UserManagementView", () => {
  it("zoekt op voor- en achternaam en combineert klas-, status- en toegangsfilters", () => {
    const users = [
      managedUser({ id: "marie", firstName: "Marie", lastName: "De Smet", effectiveClassGroupId: "class-5", hasIndividualAccess: true }),
      managedUser({ id: "anna", firstName: "Anna", lastName: "Aerts", effectiveClassGroupId: "class-6" }),
      managedUser({ id: "jonas", firstName: "Jonas", lastName: "Peeters", effectiveClassGroupId: "class-5", status: "disabled" }),
    ];
    expect(filterStudents(users, { q: "marie" }).map((user) => user.id)).toEqual(["marie"]);
    expect(filterStudents(users, { q: "smet" }).map((user) => user.id)).toEqual(["marie"]);
    expect(filterStudents(users, { class: ["class-5", "class-6"], status: "active", access: "without", sort: "first-desc" }).map((user) => user.id))
      .toEqual(["anna"]);
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
      params={{ size: "25", page: "1" }}
    />);
    expect(markup).toContain("Pagina 1 van 2");
    expect(markup).toContain("Zoek op naam of voornaam");
    expect(markup).toContain("Individuele toegang");
    expect(markup).toContain('role="switch"');
    expect(markup).not.toContain("Naam 26");
  });

  it("maakt afgeleide toegang niet wijzigbaar en houdt individuele toegang apart", () => {
    const markup = renderToStaticMarkup(<UserAccessMenu
      userId="user-1"
      userName="Voorbeeld"
      action={async () => undefined}
      spaces={[
        { id: "space-group", name: "Via groep", shortLabel: "GROEP", groupDerived: true, individual: false, managementRole: null },
        { id: "space-extra", name: "Individueel", shortLabel: "EXTRA", groupDerived: false, individual: true, managementRole: null },
        { id: "space-editor", name: "Beheer", shortLabel: "BEHEER", groupDerived: false, individual: false, managementRole: "editor" },
      ]}
    />);
    expect(markup).toContain("Automatisch via Smartschoolgroep");
    expect(markup).toContain("Via beheerrecht als editor");
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
