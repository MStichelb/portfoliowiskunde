import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG } from "@/lib/source-profile-config";
import type { ManagedSourceProfile } from "@/lib/source-profiles";

import { SourceProfileManageDialog } from "./source-profile-manage-dialog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

const action = async () => undefined;

describe("SourceProfileManageDialog", () => {
  it("uses one sticky save flow for the profile name and global resources", () => {
    const markup = renderToStaticMarkup(<SourceProfileManageDialog
      profile={profile({ usageCount: 1, usages: [usage("space-5", "5WIS")] })}
      saveAction={action}
      archiveAction={action}
    />);

    expect(markup).toContain("Bronprofiel beheren");
    expect(markup).toContain("Profielnaam");
    expect(markup).toContain("Globale documenten");
    expect(markup).toContain('name="resourcesJson"');
    expect(markup).toContain("Opslaan");
    expect(markup).not.toContain("Globale documenten opslaan");
    expect(markup).not.toContain(">Annuleren<");
  });

  it("does not render the old shared checkbox in the base manage dialog", () => {
    const markup = renderToStaticMarkup(<SourceProfileManageDialog
      profile={profile()}
      saveAction={action}
      archiveAction={action}
    />);

    expect(markup).toContain("<strong>4NW1, 5WET</strong>");
    expect(markup).not.toContain('name="confirmShared"');
    expect(markup).not.toContain("source-profile-shared-confirm");
  });
});

function profile(overrides: Partial<ManagedSourceProfile> = {}): ManagedSourceProfile {
  const usages = [usage("space-4", "4NW1"), usage("space-5", "5WET")];
  return {
    id: "profile-1",
    type: "custom",
    name: "Gedeeld profiel",
    description: null,
    config: BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG,
    managementLearningSpaceId: "space-5",
    ownerUserId: "teacher",
    archivedAt: null,
    createdAt: "2026-09-10T00:00:00.000Z",
    updatedAt: "2026-09-10T00:00:00.000Z",
    managementLearningSpaceName: "Vijfde jaar",
    managementLearningSpaceShortLabel: "5WIS",
    ownerName: "Mathias",
    usages,
    usageCount: usages.length,
    isInactive: false,
    isArchived: false,
    access: "owner",
    canRename: true,
    canCopy: true,
    canLink: true,
    canArchive: false,
    linkTargets: [],
    ...overrides,
  };
}

function usage(learningSpaceId: string, learningSpaceShortLabel: string) {
  return {
    learningSpaceId,
    learningSpaceShortLabel,
    learningSpaceName: `Leeromgeving ${learningSpaceShortLabel}`,
  };
}
