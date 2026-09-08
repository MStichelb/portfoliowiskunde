import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { UserProfileButton, UserProfileDialogContent, type UserProfileData } from "./user-profile-dialog";

describe("UserProfileDialog", () => {
  it("toont een volledig read-only leraarprofiel", () => {
    const markup = renderToStaticMarkup(<UserProfileDialogContent profile={teacherProfile} titleId="teacher-profile" />);
    expect(markup).toContain("Leraarprofiel");
    expect(markup).toContain("Van den Broeck");
    expect(markup).toContain("Leerkrachten");
    expect(markup).toContain("OneDrive · Verbonden");
    expect(markup).toContain("Eigenaar van");
    expect(markup).toContain("Bewerker van");
    expect(markup).toContain("Kijker van");
    expect(markup).toContain("5WIS");
    expect(markup).toContain("6WIS");
    expect(markup).toContain("EXTRA");
    expect(markup).not.toContain("<form");
    expect(markup).not.toContain("<input");
    expect(markup).not.toContain("<select");
  });

  it("toont nette lege toestanden in een leraarprofiel", () => {
    const markup = renderToStaticMarkup(<UserProfileDialogContent profile={{ ...teacherProfile, groups: [], connections: [], ownerSpaces: [], editorSpaces: [], viewerSpaces: [] }} titleId="empty-profile" />);
    expect(markup).toContain("Geen opgeslagen Smartschoolgroepen");
    expect(markup).toContain("Geen persoonlijke verbindingen");
    expect((markup.match(/Geen leeromgevingen/g) ?? [])).toHaveLength(3);
  });

  it("toont klas, groepen en kijkrechten in een leerlingprofiel", () => {
    const profile: UserProfileData = {
      userId: "student", role: "student", firstName: "Sara", lastName: "Student", className: "6EWI",
      groups: ["6EWI", "Leerlingen"], connections: [], ownerSpaces: [], editorSpaces: [],
      viewerSpaces: [{ id: "space-5", name: "Vijfde jaar", shortLabel: "5WIS" }],
    };
    const markup = renderToStaticMarkup(<UserProfileDialogContent profile={profile} titleId="student-profile" />);
    expect(markup).toContain("Leerlingprofiel");
    expect(markup).toContain("6EWI");
    expect(markup).toContain("Leerlingen");
    expect(markup).toContain("5WIS");
    expect(markup).not.toContain("Eigenaar van");
    expect(markup).not.toContain("Bewerker van");
  });

  it("rendert een toegankelijke profielknop per gebruiker", () => {
    const markup = renderToStaticMarkup(<UserProfileButton profile={teacherProfile} />);
    expect(markup).toContain('aria-label="Profiel van Luc Van den Broeck"');
    expect(markup).toContain("lucide-circle-user-round");
    expect(markup).not.toContain('role="dialog"');
  });
});

const teacherProfile: UserProfileData = {
  userId: "teacher", role: "teacher", firstName: "Luc", lastName: "Van den Broeck", className: null,
  groups: ["Leerkrachten"], connections: [{ provider: "onedrive", status: "active" }],
  ownerSpaces: [{ id: "space-5", name: "Vijfde jaar", shortLabel: "5WIS" }],
  editorSpaces: [{ id: "space-6", name: "Zesde jaar", shortLabel: "6WIS" }],
  viewerSpaces: [{ id: "space-extra", name: "Extra", shortLabel: "EXTRA" }],
};
