import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG } from "@/lib/source-profile-config";
import type { SourceProfile, SourceProfileAdminModel } from "@/lib/source-profiles";

import { displayProfileDescription, SourceProfileCard, type SourceProfileCardActions, type SourceProfileModal } from "./source-profile-card";

const actions: SourceProfileCardActions = {
  linkProfile: async () => undefined,
  copySelectedProfile: async () => undefined,
  copyTemplate: async () => undefined,
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
    expect(markup).not.toContain("Ingebouwd profiel");
    expect(markup).toContain("Ander profiel kiezen");
    expect(markup).toContain("Eigen profiel maken");
    expect(markup).toContain("Profiel kopiëren");
    expect(markup).toContain('class="secondary-button source-profile-copy-button"');
    expect(markup).not.toContain("huidige scanner gebruikt deze configuratie nog niet");
    expect(markup).not.toContain('role="dialog"');
    expect(markup).not.toContain("Beschikbaar bronprofiel");
    expect(markup).not.toContain("Profielnaam<input");
    expect(markup).not.toContain("Profiel uit andere leeromgeving");
    expect(markup.match(/<form/g)).toHaveLength(1);
  });

  it("keeps custom actions compact without inline forms", () => {
    const markup = renderCard("custom");

    expect(markup).not.toContain("Concreet profiel");
    expect(markup).toContain("Naam wijzigen");
    expect(markup).toContain("Profiel kopiëren");
    expect(markup).not.toContain("Eigen profiel maken");
    expect(markup).not.toContain("Profielnaam<input");
    expect(markup).not.toContain("Profiel uit andere leeromgeving");
    expect(markup).not.toContain("<form");
  });

  it("marks the active selection as current and offers no no-op action", () => {
    const markup = renderCard("custom", "switch");

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain("Ander bronprofiel kiezen");
    expect(markup).toContain("Eigen profielen");
    expect(markup).toContain("Sjablonen");
    expect(markup).not.toContain("Standaard portfolio — ingebouwd");
    expect(markup).toContain("Mijn profiel — 4NW1, 5WET, 6WIS +1");
    expect(markup).toContain("Los profiel — inactief");
    expect(markup).toContain("Eigen profiel — Huidig profiel");
    expect(markup).toContain("Huidig profiel");
    expect(markup).toContain("Sluiten");
    expect(markup).not.toContain("Activeren");
    expect(markup).not.toContain(">Koppelen</button>");
    expect(markup).toContain('aria-label="Sluiten"');
    expect(markup).not.toContain("Profielnaam wijzigen");
    expect(markup).not.toContain("Bronprofiel kopiëren");
    expect(markup.match(/role="dialog"/g)).toHaveLength(1);
    expect(markup.match(/<form/g)).toHaveLength(1);
  });

  it("offers explicit copy and link actions for a selected concrete profile", () => {
    const markup = renderCard("custom", "switch", undefined, true, false, "other");
    expect(markup).toContain("wordt een onafhankelijk profiel gemaakt voor deze leeromgeving");
    expect(markup).toContain("Latere wijzigingen aan dit profiel gelden voor alle gekoppelde leeromgevingen");
    expect(markup).toContain(">Kopiëren</button>");
    expect(markup).toContain(">Koppelen</button>");
    expect(markup).toContain("source-profile-dialog-actions source-profile-selection-actions");
    expect(markup).not.toContain("Activeren");
  });

  it("keeps templates limited to copy and activate", () => {
    const markup = renderCard("custom", "switch", undefined, true, false, undefined, "templates");
    expect(markup).toContain("Kopiëren en activeren");
    expect(markup).not.toContain(">Koppelen</button>");
    expect(markup).not.toContain(">Kopiëren</button>");
  });

  it("keeps an editor read-only for activation and rename while preserving independent copy", () => {
    const markup = renderCard("custom", null, undefined, false);

    expect(markup).toContain("Bronprofielen bekijken");
    expect(markup).toContain("lucide-sliders-horizontal");
    expect(markup).toContain("Profiel kopiëren");
    expect(markup).toContain("Als editor kun je profielen bekijken en kopiëren, maar niet wijzigen.");
    expect(markup).not.toContain("Ander profiel kiezen");
    expect(markup).not.toContain("Naam wijzigen");
  });

  it("shows current usage labels and a semantically correct central management link", () => {
    const markup = renderCard("custom", "switch");

    expect(markup).toContain("Eigen profiel — Huidig profiel");
    expect(markup).toContain("Mijn profiel — 4NW1, 5WET, 6WIS +1");
    expect(markup).toContain("Los profiel — inactief");
    expect(markup).toContain('href="/admin/bronprofielen"');
    expect(markup).toContain("Bronprofielen beheren");
    expect(markup).toContain("secondary-button link-button source-profile-management-link");
    expect(markup).toContain("lucide-sliders-horizontal");
    expect(markup.indexOf("source-profile-management-link")).toBeLessThan(markup.indexOf("source-profile-summary"));
    expect(markup).not.toContain("Appbreed standaardsjabloon voor de huidige portfolio");
    expect(markup).not.toContain("Configuratieversie");
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
    expect(markup).not.toContain("Kies een profiel");
    expect(markup).toContain("<span>Bronprofiel</span><strong>Eigen profiel</strong>");
    expect(markup).toContain("Doelleeromgeving");
    expect(markup).toContain("6WIS — Mijn profiel");
    expect(markup).toContain("Er wordt een onafhankelijke kopie gemaakt");
    expect(markup).toContain("De kopie wordt het actieve bronprofiel van de gekozen leeromgeving.");
    expect(markup).toContain("Annuleren");
    expect(markup).toContain(">Kopiëren</button>");
    expect(markup).toContain("lucide-copy");
    expect(markup).not.toContain("Kopiëren en activeren");
    expect(markup).not.toContain("Ander bronprofiel kiezen");
    expect(markup).not.toContain("Profielnaam wijzigen");
    expect(markup.match(/role="dialog"/g)).toHaveLength(1);
    expect(markup.match(/<form/g)).toHaveLength(1);
  });

  it("explains that an editor copy still needs owner activation", () => {
    const markup = renderCard("custom", "copy", undefined, false);
    expect(markup).toContain("De kopie wordt niet actief. Een eigenaar moet het profiel nog activeren.");
  });

  it("requires an explicit scope when renaming a shared profile", () => {
    const markup = renderCard("custom", "rename", undefined, true, true);
    expect(markup).toContain("Gekoppeld aan 4 leeromgevingen");
    expect(markup).toContain("Wijzigen voor alle gekoppelde leeromgevingen");
    expect(markup).toContain("Alleen voor deze leeromgeving");
    expect(markup).toContain("4NW1, 5WET, 6WIS, EXTRA");
    expect(markup).toContain("source-profile-rename-scope");
  });
});

function renderCard(type: SourceProfile["type"], initialModal: SourceProfileModal | null = null, error?: string, canConfigure = true, shared = false, initialSelectedProfileId?: string, initialSwitchSource: "profiles" | "templates" = "profiles"): string {
  const active = profile(type === "built_in" ? "built-in" : "custom", type, type === "built_in" ? "Standaard portfolio" : "Eigen profiel", type === "built_in" ? null : "space-5");
  const model: SourceProfileAdminModel = {
    activeProfile: active,
    availableProfiles: [
      ...(active.type === "custom" ? [{ ...active, managementLearningSpaceName: "Vijfde jaar", managementLearningSpaceShortLabel: "5WIS", usages: shared ? [usage("space-4", "Vierde jaar", "4NW1"), usage("space-5b", "Vijfde wetenschappen", "5WET"), usage("space-6", "Zesde jaar", "6WIS"), usage("space-extra", "Extra", "EXTRA")] : [usage("space-5", "Vijfde jaar", "5WIS")], usageCount: shared ? 4 : 1, isInactive: false, canRename: true, ownerNames: ["Mathias"] }] : []),
      { ...profile("other", "custom", "Mijn profiel", "space-6"), managementLearningSpaceName: "Zesde jaar", managementLearningSpaceShortLabel: "6WIS", usages: [
        usage("space-4", "Vierde jaar", "4NW1"), usage("space-5b", "Vijfde wetenschappen", "5WET"),
        usage("space-6", "Zesde jaar", "6WIS"), usage("space-extra", "Extra", "EXTRA"),
      ], usageCount: 4, isInactive: false, canRename: true, ownerNames: ["Mathias"] },
      { ...profile("inactive", "custom", "Los profiel", "space-6"), managementLearningSpaceName: "Zesde jaar", managementLearningSpaceShortLabel: "6WIS", usages: [], usageCount: 0, isInactive: true, canRename: true, ownerNames: ["Mathias"] },
    ],
    copyTargets: [
      { learningSpaceId: "space-5", learningSpaceName: "Vijfde jaar", learningSpaceShortLabel: "5WIS", profile: active, canConfigure },
      { learningSpaceId: "space-6", learningSpaceName: "Zesde jaar", learningSpaceShortLabel: "6WIS", profile: profile("other", "custom", "Mijn profiel", "space-6"), canConfigure },
    ],
  };
  return renderToStaticMarkup(<SourceProfileCard learningSpaceId="space-5" model={model} templates={[{ id: "template-1", name: "Standaardtest", description: null, configVersion: 1, isDefault: true }]} canConfigure={canConfigure} actions={actions} initialModal={initialModal} initialSelectedProfileId={initialSelectedProfileId} initialSwitchSource={initialSwitchSource} error={error} />);
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
