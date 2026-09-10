import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG } from "@/lib/source-profile-config";
import type { SourceProfile, SourceProfileAdminModel } from "@/lib/source-profiles";

import { SourceProfileCard, type SourceProfileCardActions } from "./source-profile-card";

const actions: SourceProfileCardActions = {
  switchProfile: async () => undefined,
  createOwnProfile: async () => undefined,
  copyProfile: async () => undefined,
  renameProfile: async () => undefined,
};

describe("SourceProfileCard", () => {
  it("shows the active built-in profile and compact management actions", () => {
    const markup = renderToStaticMarkup(<SourceProfileCard learningSpaceId="space-5" model={{
      activeProfile: profile("built-in", "built_in", "Standaard portfolio", null),
      availableProfiles: [{
        ...profile("built-in", "built_in", "Standaard portfolio", null),
        managementLearningSpaceName: null,
        managementLearningSpaceShortLabel: null,
      }],
      copySources: [{
        learningSpaceId: "space-6",
        learningSpaceName: "Zesde jaar",
        learningSpaceShortLabel: "6WIS",
        profile: profile("other", "custom", "Mijn profiel", "space-6"),
      }],
    }} actions={actions} />);

    expect(markup).toContain("Bronprofiel");
    expect(markup).toContain("Standaard portfolio");
    expect(markup).toContain("Ingebouwd profiel");
    expect(markup).toContain("Ander profiel kiezen");
    expect(markup).toContain("Eigen profiel maken");
    expect(markup).toContain("Profiel kopiëren");
    expect(markup).toContain("Mijn profiel — 6WIS");
    expect(markup).toContain("huidige scanner gebruikt deze configuratie nog niet");
    expect(markup).not.toContain("Naam wijzigen");
  });

  it("offers rename for a custom active profile", () => {
    const custom = profile("custom", "custom", "Eigen profiel", "space-5");
    const model: SourceProfileAdminModel = {
      activeProfile: custom,
      availableProfiles: [{ ...custom, managementLearningSpaceName: "Vijfde jaar", managementLearningSpaceShortLabel: "5WIS" }],
      copySources: [],
    };
    const markup = renderToStaticMarkup(<SourceProfileCard learningSpaceId="space-5" model={model} actions={actions} />);

    expect(markup).toContain("Eigen profiel");
    expect(markup).toContain("Naam wijzigen");
    expect(markup).not.toContain("Eigen profiel maken");
  });
});

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
