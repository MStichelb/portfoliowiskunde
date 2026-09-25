import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG } from "@/lib/source-profile-config";
import type { AvailableSourceProfile } from "@/lib/source-profiles";

import { displayProfileDescription, SourceProfileCard } from "./source-profile-card";

describe("SourceProfileCard", () => {
  it("does not present a concrete snapshot as the app-wide template", () => {
    expect(displayProfileDescription("Appbreed standaardsjabloon voor de huidige portfolio- en bestandsconventies.")).toBe("Gebaseerd op het appbrede standaardsjabloon.");
  });

  it("keeps the LearningSpace card read-only for an owner", () => {
    const markup = renderCard(true);
    expect(markup).toContain("Bronprofiel");
    expect(markup).toContain("Eigen profiel");
    expect(markup).toContain("Eigenaar: Mathias");
    expect(markup).toContain("Bronprofielen beheren");
    expect(markup).toContain('href="/admin/bronprofielen"');
    expect(markup).toContain("lucide-sliders-horizontal");
    expect(markup).not.toContain("Ander profiel kiezen");
    expect(markup).not.toContain("Naam wijzigen");
    expect(markup).not.toContain("Profiel kopiëren");
    expect(markup).not.toContain("Eigen profiel maken");
    expect(markup).not.toContain("<form");
    expect(markup).not.toContain('role="dialog"');
  });

  it("uses the central read-only label for an editor", () => {
    const markup = renderCard(false);
    expect(markup).toContain("Bronprofielen bekijken");
    expect(markup).not.toContain("Bronprofielen beheren");
    expect(markup).not.toContain("Profiel kopiëren");
  });

  it("shows chain state and current usage for a shared profile", () => {
    const markup = renderCard(true, [
      { learningSpaceId: "space-4", learningSpaceName: "Vierde jaar", learningSpaceShortLabel: "4NW1" },
      { learningSpaceId: "space-5", learningSpaceName: "Vijfde jaar", learningSpaceShortLabel: "5WET" },
      { learningSpaceId: "space-6", learningSpaceName: "Zesde jaar", learningSpaceShortLabel: "6WIS" },
      { learningSpaceId: "space-extra", learningSpaceName: "Extra", learningSpaceShortLabel: "EXTRA" },
    ]);
    expect(markup).toContain("lucide-link-2");
    expect(markup).toContain("Gekoppeld aan 4 leeromgevingen");
    expect(markup).toContain("Gebruikt in: <strong>4NW1, 5WET, 6WIS +1</strong>");
    expect(markup).toContain("Korte beschrijving");
  });
});

function renderCard(canConfigure: boolean, usages: AvailableSourceProfile["usages"] = [{
  learningSpaceId: "space-5", learningSpaceName: "Vijfde jaar", learningSpaceShortLabel: "5WIS",
}]): string {
  const profile: AvailableSourceProfile = {
    id: "profile-1",
    type: "custom",
    name: "Eigen profiel",
    description: "Korte beschrijving",
    config: BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG,
    managementLearningSpaceId: "space-5",
    ownerUserId: "owner",
    archivedAt: null,
    createdAt: "2026-09-10T00:00:00.000Z",
    updatedAt: "2026-09-10T00:00:00.000Z",
    managementLearningSpaceName: "Vijfde jaar",
    managementLearningSpaceShortLabel: "5WIS",
    ownerName: "Mathias",
    usages,
    usageCount: usages.length,
    isInactive: usages.length === 0,
    isArchived: false,
    access: canConfigure ? "owner" : "editor",
    canRename: canConfigure,
    canCopy: canConfigure,
    canLink: canConfigure,
    canArchive: canConfigure && usages.length === 0,
    linkTargets: [],
  };
  return renderToStaticMarkup(<SourceProfileCard profile={profile} canConfigure={canConfigure} />);
}
