import { describe, expect, it } from "vitest";
import { terminologyScenario, validateCreationStep } from "./learning-space-creation-wizard";

export function wizardForm(): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries({ creationFlow: "wizard", subjectId: "subject-wiskunde", name: "Nieuwe ruimte", shortLabel: "NIEUW", slug: "nieuwe-ruimte", cardColor: "#DCEFE9", profileMode: "later", sourceSetup: "later" })) form.set(key, value);
  const terms = terminologyScenario("bundle");
  for (const entity of ["theme", "collection", "section", "exercise"] as const) {
    form.set(`${entity}LabelSingular`, terms[entity].singular);
    form.set(`${entity}LabelPlural`, terms[entity].plural);
  }
  form.set("exerciseLabelShort", terms.exercise.short);
  return form;
}

describe("creation wizard validation and local presets", () => {
  it.each(["subjectId", "name", "slug", "shortLabel"])("requires %s before continuing", (key) => {
    const form = wizardForm(); form.delete(key);
    expect(validateCreationStep(1, form)).not.toBeNull();
  });
  it("rejects invalid URL, name, label and description lengths", () => {
    for (const [key, value] of [["slug", "Bad--URL"], ["name", "a".repeat(101)], ["shortLabel", "1234567"], ["description", "a".repeat(241)]]) {
      const form = wizardForm(); form.set(key, value); expect(validateCreationStep(1, form)).not.toBeNull();
    }
  });
  it("allows both configuration steps to be skipped", () => {
    const form = wizardForm(); for (let step = 1; step <= 4; step++) expect(validateCreationStep(step, form)).toBeNull();
  });
  it("requires profile selections and complete provider identifiers", () => {
    const form = wizardForm(); form.set("profileMode", "link"); expect(validateCreationStep(3, form)).not.toBeNull();
    form.set("profileSelectionId", "profile-1"); expect(validateCreationStep(3, form)).toBeNull();
    form.set("sourceSetup", "now");
    for (const provider of ["onedrive", "google_drive", "local"]) { form.set("sourceType", provider); expect(validateCreationStep(4, form)).not.toBeNull(); }
    form.set("localSourcePath", "C:\\test"); expect(validateCreationStep(4, form)).toBeNull();
  });
  it("validates terminology and optional abbreviation", () => {
    const form = wizardForm(); form.set("sectionLabelSingular", " "); expect(validateCreationStep(2, form)).not.toBeNull();
    form.set("sectionLabelSingular", "Sectie"); form.set("exerciseLabelShort", ""); expect(validateCreationStep(2, form)).toBeNull();
    form.set("exerciseLabelShort", "a".repeat(41)); expect(validateCreationStep(2, form)).not.toBeNull();
  });
  it("presets have the agreed values and editing a local result never changes a preset", () => {
    expect(terminologyScenario("chapter")).toMatchObject({ theme: { singular: "Deel", plural: "Delen" }, collection: { singular: "Hoofdstuk", plural: "Hoofdstukken" }, section: { singular: "Sectie", plural: "Secties" } });
    const local = terminologyScenario("bundle"); local.exercise.singular = "Vraag";
    expect(terminologyScenario("bundle")).toMatchObject({ collection: { singular: "Bundel" }, exercise: { singular: "Opdracht", plural: "Opdrachten", short: "Opdr." } });
  });
  it("validating steps forward and backward preserves custom values and description", () => {
    const form = wizardForm(); form.set("description", "Mijn eigen beschrijving"); form.set("themeLabelPlural", "Domeinen");
    const before = [...form.entries()]; for (const step of [1, 2, 3, 4, 3, 2, 1]) expect(validateCreationStep(step, form)).toBeNull();
    expect([...form.entries()]).toEqual(before);
  });
});
