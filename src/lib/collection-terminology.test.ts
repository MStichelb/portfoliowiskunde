import { describe, expect, it } from "vitest";

import { formatTerminologyLabel, initialLearningSpaceDescription, miscellaneousCollectionLabel, normalizeCollectionTerminology, normalizeExerciseTerminology } from "./collection-terminology";

describe("LearningSpace terminology", () => {
  it("builds the initial description from the creation terminology", () => {
    expect(initialLearningSpaceDescription()).toBe("Overzicht van de portfolio's met oefeningen.");
    expect(initialLearningSpaceDescription("Bundels", "Oefeningen")).toBe("Overzicht van de bundels met oefeningen.");
    expect(initialLearningSpaceDescription("Portfolio's", "Opdrachten")).toBe("Overzicht van de portfolio's met opdrachten.");
  });
  it.each([
    ["bunDEL", "standalone", "Bundel"],
    ["bunDEL", "inline", "bundel"],
    ["BUNDELS", "standalone", "Bundels"],
    ["BUNDELS", "inline", "bundels"],
    ["OpGavE", "standalone", "Opgave"],
    ["OpGavE", "inline", "opgave"],
    ["OPGAVEN", "standalone", "Opgaven"],
    ["OPGAVEN", "inline", "opgaven"],
    ["portfolio's", "standalone", "Portfolio's"],
    ["Portfolio's", "inline", "portfolio's"],
    ["'BUNdels", "standalone", "'Bundels"],
  ] as const)("formats %s in %s context", (value, context, expected) => {
    const raw = value;
    expect(formatTerminologyLabel(value, context)).toBe(expected);
    expect(value).toBe(raw);
  });

  it("does not mutate stored terminology while normalizing only whitespace", () => {
    const collectionInput = { singular: " portfolio ", plural: " portfolio's " };
    const exerciseInput = { singular: " oefening ", plural: " oefeningen " };

    expect(normalizeCollectionTerminology(collectionInput)).toEqual({ singular: "portfolio", plural: "portfolio's" });
    expect(normalizeExerciseTerminology(exerciseInput)).toEqual({ singular: "oefening", plural: "oefeningen" });
    expect(collectionInput).toEqual({ singular: " portfolio ", plural: " portfolio's " });
    expect(exerciseInput).toEqual({ singular: " oefening ", plural: " oefeningen " });
  });

  it("uses inline capitalization after Overige", () => {
    expect(miscellaneousCollectionLabel("OeFeNiNgEn")).toBe("Overige oefeningen");
    expect(miscellaneousCollectionLabel("portfolio's")).toBe("Overige portfolio's");
  });
});
