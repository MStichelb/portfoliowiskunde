import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG } from "@/lib/source-profile-config";
import type { SourceProfile, SourceProfileAdminModel } from "@/lib/source-profiles";

import { displayProfileDescription, SourceProfileCard, type SourceProfileCardActions, type SourceProfileModal } from "./source-profile-card";

const actions: SourceProfileCardActions = {
  switchProfile: async () => undefined,
  createOwnProfile: async () => undefined,
  copyProfile: async () => undefined,
  renameProfile: async () => undefined,
};

describe("SourceProfileCard", () => {
  it("does not present a concrete snapshot as the app-wide template", () => {
    expect(displayProfileDescription("Appbreed standaardsjabloon voor de huidige portfolio- en bestandsconventies.")).toBe("Gebaseerd op het appbrede standaardsjabloon.");
  });

  it("keeps the built-in card compact without inline selection, rename or copy forms", () => {
    const markup = renderCard("built_in");

    expect(markup).toContain("Bronprofiel");
    expect(markup).toContain("Standaard portfolio");
    expect(markup).toContain("Ingebouwd profiel");
    expect(markup).toContain("Ander profiel kiezen");
    expect(markup).toContain("Eigen profiel maken");
    expect(markup).toContain("Profiel kopiëren");
    expect(markup).toContain("huidige scanner gebruikt deze configuratie nog niet");
    expect(markup).not.toContain('role="dialog"');
    expect(markup).not.toContain("Beschikbaar bronprofiel");
    expect(markup).not.toContain("Profielnaam<input");
    expect(markup).not.toContain("Profiel uit andere leeromgeving");
    expect(markup.match(/<form/g)).toHaveLength(1);
  });

  it("keeps custom actions compact without inline forms", () => {
    const markup = renderCard("custom");

    expect(markup).toContain("Concreet profiel");
    expect(markup).toContain("Naam wijzigen");
    expect(markup).toContain("Profiel kopiëren");
    expect(markup).not.toContain("Eigen profiel maken");
    expect(markup).not.toContain("Profielnaam<input");
    expect(markup).not.toContain("Profiel uit andere leeromgeving");
    expect(markup).not.toContain("<form");
  });

  it("opens only the profile-selection modal with scoped labels, no fallback and two close paths", () => {
    const markup = renderCard("custom", "switch");

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain("Ander bronprofiel kiezen");
    expect(markup).not.toContain("Standaard portfolio — ingebouwd");
    expect(markup).toContain("Mijn profiel — 4NW1, 5WET, 6WIS +1");
    expect(markup).toContain("Los profiel — inactief");
    expect(markup).toContain("Annuleren");
    expect(markup).toContain("Activeren");
    expect(markup).toContain('aria-label="Sluiten"');
    expect(markup).not.toContain("Profielnaam wijzigen");
    expect(markup).not.toContain("Bronprofiel kopiëren");
    expect(markup.match(/role="dialog"/g)).toHaveLength(1);
    expect(markup.match(/<form/g)).toHaveLength(1);
  });

  it("shows current usage labels and a semantically correct central management link", () => {
    const markup = renderCard("custom", "switch");

    expect(markup).toContain("Eigen profiel — 5WIS");
    expect(markup).toContain("Mijn profiel — 4NW1, 5WET, 6WIS +1");
    expect(markup).toContain("Los profiel — inactief");
    expect(markup).toContain('href="/admin/bronprofielen"');
    expect(markup).toContain("Bronprofielen beheren");
    expect(markup).not.toContain("Appbreed standaardsjabloon voor de huidige portfolio");
  });

  it("opens rename with the current value and keeps a validation error inside the modal", () => {
    const markup = renderCard("custom", "rename", "Geef het bronprofiel een naam.");

    expect(markup).toContain("Profielnaam wijzigen");
    expect(markup).toContain('name="name"');
    expect(markup).toContain('value="Eigen profiel"');
    expect(markup).toContain('maxLength="80"');
    expect(markup).toContain("Geef het bronprofiel een naam.");
    expect(markup).toContain("Annuleren");
    expect(markup).toContain("Opslaan");
    expect(markup.match(/role="alert"/g)).toHaveLength(1);
    expect(markup.match(/role="dialog"/g)).toHaveLength(1);
    expect(markup.match(/<form/g)).toHaveLength(1);
  });

  it("opens copy with independent-copy guidance and an unambiguous LearningSpace choice", () => {
    const markup = renderCard("custom", "copy");

    expect(markup).toContain("Bronprofiel kopiëren");
    expect(markup).toContain("Profiel uit andere leeromgeving");
    expect(markup).toContain("Mijn profiel — 6WIS");
    expect(markup).toContain("Er wordt een onafhankelijke kopie gemaakt");
    expect(markup).toContain("Annuleren");
    expect(markup).toContain("Kopiëren en activeren");
    expect(markup).not.toContain("Ander bronprofiel kiezen");
    expect(markup).not.toContain("Profielnaam wijzigen");
    expect(markup.match(/role="dialog"/g)).toHaveLength(1);
    expect(markup.match(/<form/g)).toHaveLength(1);
  });
});

function renderCard(type: SourceProfile["type"], initialModal: SourceProfileModal | null = null, error?: string): string {
  const active = profile(type === "built_in" ? "built-in" : "custom", type, type === "built_in" ? "Standaard portfolio" : "Eigen profiel", type === "built_in" ? null : "space-5");
  const model: SourceProfileAdminModel = {
    activeProfile: active,
    availableProfiles: [
      ...(active.type === "custom" ? [{ ...active, managementLearningSpaceName: "Vijfde jaar", managementLearningSpaceShortLabel: "5WIS", usages: [usage("space-5", "Vijfde jaar", "5WIS")], usageCount: 1, isInactive: false }] : []),
      { ...profile("other", "custom", "Mijn profiel", "space-6"), managementLearningSpaceName: "Zesde jaar", managementLearningSpaceShortLabel: "6WIS", usages: [
        usage("space-4", "Vierde jaar", "4NW1"), usage("space-5b", "Vijfde wetenschappen", "5WET"),
        usage("space-6", "Zesde jaar", "6WIS"), usage("space-extra", "Extra", "EXTRA"),
      ], usageCount: 4, isInactive: false },
      { ...profile("inactive", "custom", "Los profiel", "space-6"), managementLearningSpaceName: "Zesde jaar", managementLearningSpaceShortLabel: "6WIS", usages: [], usageCount: 0, isInactive: true },
    ],
    copySources: [{ learningSpaceId: "space-6", learningSpaceName: "Zesde jaar", learningSpaceShortLabel: "6WIS", profile: profile("other", "custom", "Mijn profiel", "space-6") }],
  };
  return renderToStaticMarkup(<SourceProfileCard learningSpaceId="space-5" model={model} actions={actions} initialModal={initialModal} error={error} />);
}

function usage(learningSpaceId: string, learningSpaceName: string, learningSpaceShortLabel: string) {
  return { learningSpaceId, learningSpaceName, learningSpaceShortLabel };
}

function profile(id: string, type: SourceProfile["type"], name: string, managementLearningSpaceId: string | null): SourceProfile {
  return {
    id,
    type,
    name,
    description: "Korte beschrijving",
    config: BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG,
    managementLearningSpaceId,
    createdAt: "2026-09-10T00:00:00.000Z",
    updatedAt: "2026-09-10T00:00:00.000Z",
  };
}
