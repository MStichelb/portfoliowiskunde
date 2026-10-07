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
  it.each(["none", "folder"] as const)("shows the saved theme-folder setting and matching preview (%s)", (themeMode: "none" | "folder") => {
    const config = structuredClone(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG);
    config.scanner.portfolio.themeMode = themeMode;
    const markup = renderToStaticMarkup(<SourceProfileManageDialog profile={profile({ config })} saveAction={action} archiveAction={action} />);
    expect(markup).toContain("Groepering uit mappen");
    expect(markup).toContain(`<option value="${themeMode}" selected="">`);
    expect(markup).toContain(`&quot;themeMode&quot;:&quot;${themeMode}&quot;`);
    expect(markup).not.toContain("Thema uit bronmap");
    expect(markup).toContain("Interpretatie tonen");
    expect(markup.includes("Bronmap")).toBe(themeMode === "folder");
    if (themeMode === "folder") {
      expect(markup).toContain(">Analyse<");
      expect(markup).toContain(">Algebra<");
      expect(markup).toContain("Portfolio 4 - Herhaling");
    }
  });

  it("uses one sticky save flow for the profile name, global resources and exercise resources", () => {
    const config = {
      ...BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG,
      scanner: { ...BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.scanner, portfolio: { ...BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.scanner.portfolio, marker: "Bundel" } },
    };
    const markup = renderToStaticMarkup(<SourceProfileManageDialog
      profile={profile({ config, usageCount: 1, usages: [usage("space-5", "5WIS")] })}
      saveAction={action}
      archiveAction={action}
    />);

    expect(markup).toContain("Bronprofiel beheren");
    expect(markup).toContain("confirm-backdrop source-profile-editor-backdrop");
    expect(markup).toContain("Profielnaam");
    expect(markup).toContain("Documenten bij portfolio&#x27;s");
    expect(markup).toContain('name="resourcesJson"');
    expect(markup).toContain("Oefeningen herkennen");
    expect(markup).toContain("Mapnaam begint met");
    expect(markup).toContain('name="portfolioScannerJson"');
    expect(markup).toContain('value="Bundel"');
    expect(markup).toContain("Bundel1.1 - Stelsels oplossen");
    expect(markup).toContain("1.1 Inleiding");
    expect(markup).toContain("Letter-startende codes worden niet herkend");
    expect(markup).toContain('name="exerciseScannerJson"');
    expect(markup).toContain("Materialen bij oefeningen");
    expect(markup).toContain('name="exerciseResourcesJson"');
    expect(markup).toContain("Opslaan");
    expect(markup).not.toContain("Documenten bij portfolio&#x27;s opslaan");
    expect(markup).not.toContain("Oefeningsdocumenten opslaan");
    expect(markup).not.toContain(">Annuleren<");
  });


  it("places the view context beside Save in the header and keeps usage metadata in Overview", () => {
    const spaces = [
      { id: "space-4", shortLabel: "4NW1", name: "Vierde", sortOrder: 1 },
      { id: "space-5", shortLabel: "5WET", name: "Vijfde", sortOrder: 2 },
    ];
    const markup = renderToStaticMarkup(<SourceProfileManageDialog profile={profile()} presentationSpaces={spaces} saveAction={action} archiveAction={action} />);
    const header = markup.slice(0, markup.indexOf("source-profile-manage-content"));
    expect(header).toContain("source-profile-view-choice");
    expect(header.indexOf("source-profile-view-choice")).toBeLessThan(header.indexOf(">Opslaan<"));
    const content = markup.slice(markup.indexOf("source-profile-manage-content"));
    expect(content).toContain("Gebruikt in:");
    expect(content).not.toContain("source-profile-view-choice");
    expect(content).not.toContain("source-profile-terminology-choice");
  });

  it("places the archive action in the sticky top bar when archiving is allowed", () => {
    const markup = renderToStaticMarkup(<SourceProfileManageDialog
      profile={profile({ canArchive: true, usageCount: 1, usages: [usage("space-5", "5WIS")] })}
      saveAction={action}
      archiveAction={action}
    />);

    expect(markup).toContain("Archiveren");
    expect(markup.indexOf("Archiveren")).toBeLessThan(markup.indexOf("source-profile-manage-content"));
    expect(markup).not.toContain("source-profile-lifecycle-zone");
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
