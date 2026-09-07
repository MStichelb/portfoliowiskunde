import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { LearningSpaceStudentRosterEntry } from "@/lib/learning-space-student-roster";

import {
  filterLearningSpaceStudentRoster,
  formatRosterGroupNames,
  LearningSpaceStudentRoster,
} from "./learning-space-student-roster";

describe("LearningSpace student roster", () => {
  it("renders class and relevant group once with both access badges", () => {
    const markup = renderToStaticMarkup(<LearningSpaceStudentRoster students={[student({
      className: "5WEWI6",
      relevantGroupNames: ["5WEWI6", "Uitdaging"],
      groupDerivedAccess: true,
      individualAccess: true,
    })]} />);

    expect(markup).toContain("5WEWI6 • Uitdaging");
    expect(markup).toContain(">Groep</span>");
    expect(markup).toContain(">Individueel</span>");
  });

  it("shows disabled students and the empty roster state", () => {
    const disabledMarkup = renderToStaticMarkup(<LearningSpaceStudentRoster students={[student({ status: "disabled" })]} />);
    const emptyMarkup = renderToStaticMarkup(<LearningSpaceStudentRoster students={[]} />);

    expect(disabledMarkup).toContain("Uitgeschakeld");
    expect(emptyMarkup).toContain("Nog geen leerlingen met toegang tot deze leeromgeving.");
    expect(emptyMarkup).not.toContain("<table");
  });

  it("searches and filters on names, class and relevant groups while preserving order", () => {
    const students = [
      student({ userId: "one", lastName: "De Smet", className: "5WEWI6", relevantGroupNames: ["Uitdaging"] }),
      student({ userId: "two", displayName: "Bram Janssens", firstName: "Bram", lastName: "Janssens", className: "6WIS" }),
    ];

    expect(filterLearningSpaceStudentRoster(students, "smet", "").map((entry) => entry.userId)).toEqual(["one"]);
    expect(filterLearningSpaceStudentRoster(students, "bram", "6wis").map((entry) => entry.userId)).toEqual(["two"]);
    expect(filterLearningSpaceStudentRoster(students, "", "uitdaging").map((entry) => entry.userId)).toEqual(["one"]);
    expect(filterLearningSpaceStudentRoster(students, "", "").map((entry) => entry.userId)).toEqual(["one", "two"]);
  });

  it("formats individual-only students without a class or group as an empty display value", () => {
    expect(formatRosterGroupNames(student({ className: null, relevantGroupNames: [], individualAccess: true }))).toBe("");
  });
});

function student(overrides: Partial<LearningSpaceStudentRosterEntry> = {}): LearningSpaceStudentRosterEntry {
  return {
    userId: "student-1",
    displayName: "Anna De Smet",
    firstName: "Anna",
    lastName: "De Smet",
    className: null,
    relevantGroupNames: [],
    individualAccess: false,
    groupDerivedAccess: false,
    status: "active",
    ...overrides,
  };
}
