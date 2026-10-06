import { describe, expect, it } from "vitest";
import { learningSpaceEmptyState, setupSyncDisabledReason } from "./learning-space-setup";

describe("incomplete setup presentation", () => {
  it.each([
    [true, true, "Stel eerst een bronprofiel en bron in.", "Je inhoud verschijnt zodra de instellingen zijn aangevuld."],
    [true, false, "Stel eerst een bronprofiel in.", "Stel eerst in hoe bestanden en mappen herkend moeten worden."],
    [false, true, "Stel eerst een bron in.", "Koppel eerst een bron om inhoud te kunnen synchroniseren."],
    [false, false, null, "Synchroniseer om de eerste inhoud te laden."],
  ] as const)("explains profile=%s/source=%s", (missingProfile, missingSource, reason, emptyState) => {
    const setup = { missingProfile, missingSource };
    expect(setupSyncDisabledReason(setup)).toBe(reason);
    expect(learningSpaceEmptyState(setup, false, "Hoofdstukken")).toBe(emptyState);
  });

  it("uses configured terminology after a successful sync with no content", () => {
    expect(learningSpaceEmptyState({ missingProfile: false, missingSource: false }, true, "Hoofdstukken")).toBe("Nog geen hoofdstukken in deze leeromgeving.");
  });
});
