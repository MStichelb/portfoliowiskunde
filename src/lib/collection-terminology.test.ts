import { describe, expect, it } from "vitest";

import { formatExerciseShortLabel, formatTerminologyLabel, getLearningSpaceTerminology, initialLearningSpaceDescription, learningSpaceTerminologyLabel, miscellaneousCollectionLabel, normalizeCollectionTerminology, normalizeExerciseTerminology, normalizeSectionTerminology, normalizeThemeTerminology } from "./collection-terminology";

describe("LearningSpace terminology", () => {
  it("provides all hierarchy defaults while preserving an explicitly empty abbreviation", () => {
    expect(getLearningSpaceTerminology()).toEqual({
      theme: { singular: "Thema", plural: "Thema's" },
      collection: { singular: "Portfolio", plural: "Portfolio's" },
      section: { singular: "Onderdeel", plural: "Onderdelen" },
      exercise: { singular: "Oefening", plural: "Oefeningen", short: "Oef." },
    });
    expect(getLearningSpaceTerminology({ themeLabelSingular: " ", sectionLabelPlural: "" }).section.plural).toBe("Onderdelen");
    expect(getLearningSpaceTerminology({ themeLabelSingular: " " }).theme.singular).toBe("Thema");
    expect(getLearningSpaceTerminology({ exerciseLabelShort: "" }).exercise.short).toBe("");
    expect(formatExerciseShortLabel("", "3a")).toBe("3a");
    expect(formatExerciseShortLabel("Vr.", "3a")).toBe("Vr. 3a");
  });

  it("formats configured singular and plural labels through the existing capitalization pattern", () => {
    const input = { themeLabelSingular: " dEEL ", themeLabelPlural: "DELEN", sectionLabelSingular: "sECTIE", sectionLabelPlural: "Secties" };
    expect(learningSpaceTerminologyLabel(input, "theme", "singular")).toBe("Deel");
    expect(learningSpaceTerminologyLabel(input, "theme", "plural", "inline")).toBe("delen");
    expect(learningSpaceTerminologyLabel(input, "section", "singular", "inline")).toBe("sectie");
    expect(learningSpaceTerminologyLabel(input, "section", "plural")).toBe("Secties");
    expect(input.themeLabelSingular).toBe(" dEEL ");
  });

  it.each([normalizeThemeTerminology, normalizeSectionTerminology])("validates hierarchy labels with the same rules as existing terminology", (normalize) => {
    expect(normalize({ singular: " Deel ", plural: " Delen " })).toEqual({ singular: "Deel", plural: "Delen" });
    expect(normalize({ plural: "Delen" }, { singular: "Deel", plural: "Domeinen" })).toEqual({ singular: "Deel", plural: "Delen" });
    expect(() => normalize({ singular: " " })).toThrow("enkelvoud");
    expect(() => normalize({ plural: "x".repeat(41) })).toThrow("40");
  });
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
