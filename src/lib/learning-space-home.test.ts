import { describe, expect, it } from "vitest";

import { sortLearningSpacesForViewer } from "./learning-space-home";

describe("sortLearningSpacesForViewer", () => {
  it("sorts by subject, then name, then a stable identifier", () => {
    const spaces = [
      { id: "c", slug: "c", subjectName: "Wiskunde", name: "Eerste" },
      { id: "b", slug: "b", subjectName: "Fysica", name: "Tweede" },
      { id: "a", slug: "a", subjectName: "Fysica", name: "Tweede" },
      { id: "d", slug: "d", subjectName: "Fysica", name: "Eerste" },
    ];
    expect(sortLearningSpacesForViewer(spaces).map((space) => space.id)).toEqual(["d", "a", "b", "c"]);
  });

  it("does not mutate the repository result", () => {
    const spaces = [
      { id: "b", slug: "b", subjectName: "Wiskunde", name: "B" },
      { id: "a", slug: "a", subjectName: "Fysica", name: "A" },
    ];
    sortLearningSpacesForViewer(spaces);
    expect(spaces.map((space) => space.id)).toEqual(["b", "a"]);
  });
});
