import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  filterStudentAccessCandidates,
  LearningSpaceStudentAccessModal,
} from "./learning-space-student-access-modal";

const candidates = [
  { userId: "student-1", displayName: "Anna De Smet", firstName: "Anna", lastName: "De Smet", className: "5WEWI", status: "active" as const },
  { userId: "student-2", displayName: "Bram Janssens", firstName: "Bram", lastName: "Janssens", className: "6WIS", status: "disabled" as const },
];

describe("LearningSpace student access modal", () => {
  it("keeps the dialog closed until the add button is used", () => {
    const markup = renderToStaticMarkup(<LearningSpaceStudentAccessModal learningSpaceId="space-5" candidates={candidates} action={vi.fn()} />);

    expect(markup).toContain("Leerling toevoegen");
    expect(markup).not.toContain('role="dialog"');
  });

  it("renders four columns and a Ban action for inactive candidates", () => {
    const markup = renderToStaticMarkup(<LearningSpaceStudentAccessModal learningSpaceId="space-5" candidates={candidates} action={vi.fn()} initialOpen />);

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain("Zoek op naam, voornaam of klas");
    expect(markup).toContain("De Smet");
    expect(markup).toContain("5WEWI");
    expect(markup).toContain("Naam</span><span>Voornaam</span><span>Klas");
    expect(markup).toContain('disabled="" aria-label="Bram Janssens: gebruiker uitgeschakeld"');
    expect(markup).toContain('title="Gebruiker uitgeschakeld"');
    expect(markup).toContain('lucide-ban');
  });

  it("filters case-insensitively on name, first name and class", () => {
    expect(filterStudentAccessCandidates(candidates, "anna").map((student) => student.userId)).toEqual(["student-1"]);
    expect(filterStudentAccessCandidates(candidates, "SMET").map((student) => student.userId)).toEqual(["student-1"]);
    expect(filterStudentAccessCandidates(candidates, "6wis").map((student) => student.userId)).toEqual(["student-2"]);
  });
});
