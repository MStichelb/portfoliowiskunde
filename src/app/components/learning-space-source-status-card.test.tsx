import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { LearningSpaceSourceStatus, LearningSpaceSourceStatusWarning } from "@/lib/learning-space-source-status";

import { LearningSpaceSourceStatusOverview } from "./learning-space-source-status-card";

describe("LearningSpaceSourceStatusOverview", () => {
  it("renders the five agreed page sections without modal structure", () => {
    const markup = renderStatus();

    expect(markup).toContain("Synchronisatie");
    expect(markup).toContain("Broncontrole");
    expect(markup).toContain("Index en bronconfiguratie");
    expect(markup).toContain("Ontbrekende inhoud");
    expect(markup).toContain("Scannerwaarschuwingen");
    expect(markup).not.toContain('role="dialog"');
    expect(markup).not.toContain("confirm-backdrop");
    expect(markup).not.toContain("Sluiten");
    expect(markup).not.toContain("Uitgebreide bronstatus");
  });

  it("shows synchronization data and historical source validation in Brussels time", () => {
    const markup = renderStatus();

    expect(markup).toContain("Laatste poging");
    expect(markup).toContain("Geslaagd");
    expect(markup).toContain("25 sep 2026");
    expect(markup).toContain("14:00");
    expect(markup).toContain("Geldig bij laatste controle");
    expect(markup).toContain("geen live bereikbaarheidscontrole");
  });

  it("distinguishes a failed attempt with an older usable index", () => {
    const markup = renderStatus({
      synchronization: {
        ...baseStatus.synchronization,
        latestAttempt: failedAttempt,
        usableIndex: { available: true, state: "available_from_previous_success" },
      },
    });

    expect(markup).toContain("De laatste synchronisatie is mislukt. De eerder gesynchroniseerde inhoud blijft beschikbaar.");
    expect(markup).toContain("Beschikbaar uit een eerdere geslaagde synchronisatie");
    expect(markup).not.toContain("Er is nog geen bruikbare gesynchroniseerde inhoud beschikbaar.");
  });

  it("distinguishes a failed first attempt without usable content", () => {
    const markup = renderStatus({
      synchronization: {
        ...baseStatus.synchronization,
        latestAttempt: failedAttempt,
        latestSuccessful: null,
        usableIndex: { available: false, state: "unavailable" },
        profileIndexAlignment: { state: "unknown", reason: "no_successful_sync" },
      },
      missingContent: unknownMissingContent,
      warnings: unknownWarnings,
    });

    expect(markup).toContain("Geen geslaagde synchronisatie beschikbaar");
    expect(markup).toContain("Er is nog geen bruikbare gesynchroniseerde inhoud beschikbaar.");
    expect(markup).toContain("Er is nog geen bruikbare gesynchroniseerde index beschikbaar.");
    expect(markup).toContain("Onbekend: er is geen bruikbare index");
    expect(markup).not.toContain("eerder gesynchroniseerde inhoud blijft beschikbaar");
  });

  it("shows only reliable missing totals and keeps unknown warning counts unknown", () => {
    const markup = renderStatus({
      missingContent: {
        state: "known", portfolios: 1, sections: 2, exercises: 3, legacySolutionAssets: 4,
        genericPortfolioResources: 1, genericExerciseResources: 2, genericResources: 3,
        overlappingLegacyAndGenericExerciseAssets: 1, totalFilesAndResources: 6,
      },
      warnings: unknownWarnings,
    });

    expect(markup).toContain("Portfolio&#x27;s</dt><dd>1");
    expect(markup).toContain("Secties</dt><dd>2");
    expect(markup).toContain("Oefeningen</dt><dd>3");
    expect(markup).toContain("Bestanden en resources</dt><dd>6");
    expect(markup).not.toContain("Legacy resources");
    expect(markup).not.toContain("Generieke resources");
    expect(markup).not.toContain("Resource overlap");
    expect(markup).toContain("Nog geen scannerwaarschuwingen beschikbaar.");
  });

  it("keeps known warnings collapsed and groups linked and unlinked warnings without dropping them", () => {
    const markup = renderStatus({
      warnings: {
        state: "known", basedOnSuccessfulSyncAt: "2026-09-25T12:00:00.000Z", count: 3,
        items: [
          warning("Portfolio 2 - Tweede/twee.pdf", "Tweede waarschuwing.", { id: "portfolio-2", code: "2", title: "Tweede" }),
          warning("los-bestand.pdf", "Algemene waarschuwing."),
          warning("Portfolio 1 - Eerste/een.pdf", "Eerste waarschuwing.", { id: "portfolio-1", code: "1", title: "Eerste" }),
        ],
      },
    });

    expect(markup).toContain("Scannerwaarschuwingen");
    expect(markup).toContain("3 scannerwaarschuwingen uit de laatste geslaagde synchronisatie");
    expect(markup).toContain("<details class=\"source-status-warning-details\"><summary>Waarschuwingen bekijken</summary>");
    expect(markup).not.toContain("<details class=\"source-status-warning-details\" open=\"\"");
    expect(markup).toContain("Eerste waarschuwing.");
    expect(markup).toContain("Portfolio 1 — Eerste");
    expect(markup).toContain("Tweede waarschuwing.");
    expect(markup).toContain("Portfolio 2 — Tweede");
    expect(markup).toContain("Algemene waarschuwingen");
    expect(markup).toContain("Algemene waarschuwing.");
    expect(markup.indexOf("Portfolio 1 — Eerste")).toBeLessThan(markup.indexOf("Portfolio 2 — Tweede"));
    expect(markup.indexOf("Portfolio 2 — Tweede")).toBeLessThan(markup.indexOf("Algemene waarschuwingen"));
  });

  it("uses the agreed wording for a confirmed current index", () => {
    const markup = renderStatus();

    expect(markup).toContain("Volgens de opgeslagen gegevens is de index afgestemd op de huidige bronconfiguratie.");
  });

  it("presents unknown index consistency as uncertainty, not as a proven error", () => {
    const markup = renderStatus({
      synchronization: {
        ...baseStatus.synchronization,
        profileIndexAlignment: { state: "unknown", reason: "profile_or_assignment_changed_after_sync" },
      },
    });

    expect(markup).toContain("De bronconfiguratie is mogelijk gewijzigd sinds de laatste geslaagde synchronisatie.");
    expect(markup).toContain("Synchroniseer opnieuw om de index bij te werken volgens de huidige bronconfiguratie.");
    expect(markup).not.toContain("Eigen profiel");
    expect(markup).not.toContain("configuratie v1");
    expect(markup).not.toContain("OneDrive");
  });

  it("distinguishes zero reliable warnings from an unknown warning state", () => {
    const zeroMarkup = renderStatus();
    const unknownMarkup = renderStatus({ warnings: unknownWarnings });

    expect(zeroMarkup).toContain("Geen scannerwaarschuwingen vastgesteld bij de laatste geslaagde synchronisatie.");
    expect(zeroMarkup).not.toContain("Waarschuwingen bekijken");
    expect(unknownMarkup).toContain("Nog geen scannerwaarschuwingen beschikbaar.");
    expect(unknownMarkup).not.toContain("Geen scannerwaarschuwingen vastgesteld");
    expect(unknownMarkup).not.toContain("Waarschuwingen bekijken");
  });
});

function renderStatus(overrides: Partial<LearningSpaceSourceStatus> = {}): string {
  return renderToStaticMarkup(<LearningSpaceSourceStatusOverview status={{ ...baseStatus, ...overrides }} />);
}

const successfulAttempt: NonNullable<LearningSpaceSourceStatus["synchronization"]["latestSuccessful"]> = {
  sourceId: "source-primary", providerType: "onedrive", startedAt: "2026-09-25T11:59:00.000Z",
  finishedAt: "2026-09-25T12:00:00.000Z", result: "succeeded", portfolioCount: 4,
  warningCount: 0, failureMessage: null,
};

const failedAttempt: NonNullable<LearningSpaceSourceStatus["synchronization"]["latestAttempt"]> = {
  sourceId: "source-primary", providerType: "onedrive", startedAt: "2026-09-25T13:00:00.000Z",
  finishedAt: "2026-09-25T13:00:02.000Z", result: "failed", portfolioCount: null,
  warningCount: null, failureMessage: "Bron tijdelijk niet beschikbaar.",
};

const unknownMissingContent: LearningSpaceSourceStatus["missingContent"] = {
  state: "unknown", portfolios: null, sections: null, exercises: null, legacySolutionAssets: null,
  genericPortfolioResources: null, genericExerciseResources: null, genericResources: null,
  overlappingLegacyAndGenericExerciseAssets: null, totalFilesAndResources: null,
};

const unknownWarnings: LearningSpaceSourceStatus["warnings"] = {
  state: "unknown", basedOnSuccessfulSyncAt: null, count: null, items: null,
};

function warning(
  relativePath: string,
  message: string,
  portfolio: LearningSpaceSourceStatusWarning["portfolio"] = null,
): LearningSpaceSourceStatusWarning {
  return { severity: "warning" as const, relativePath, message, portfolio };
}

const baseStatus: LearningSpaceSourceStatus = {
  learningSpaceId: "space-5",
  isArchived: false,
  observedAt: "2026-09-25T13:00:00.000Z",
  activeSource: {
    id: "source-primary", role: "primary", providerType: "onedrive", isActive: true,
    lastKnownValidation: { state: "valid", checkedAt: "2026-09-25T11:58:00.000Z", message: null }, mirrorCompletedAt: null,
  },
  sources: [{
    id: "source-primary", role: "primary", providerType: "onedrive", isActive: true,
    lastKnownValidation: { state: "valid", checkedAt: "2026-09-25T11:58:00.000Z", message: null }, mirrorCompletedAt: null,
  }],
  profile: {
    id: "profile-1", name: "Eigen profiel", configVersion: 1,
    updatedAt: "2026-09-20T10:00:00.000Z", assignmentUpdatedAt: "2026-09-20T10:00:00.000Z",
  },
  synchronization: {
    latestAttempt: successfulAttempt,
    latestSuccessful: successfulAttempt,
    inProgress: { state: "not_detected", evidence: "no_active_sync_lease", leaseExpiresAt: null },
    usableIndex: { available: true, state: "available_from_latest_success" },
    profileIndexAlignment: { state: "confirmed_current", reason: "profile_and_assignment_unchanged_since_sync" },
  },
  missingContent: {
    state: "known", portfolios: 0, sections: 0, exercises: 0, legacySolutionAssets: 0,
    genericPortfolioResources: 0, genericExerciseResources: 0, genericResources: 0,
    overlappingLegacyAndGenericExerciseAssets: 0, totalFilesAndResources: 0,
  },
  warnings: { state: "known", basedOnSuccessfulSyncAt: "2026-09-25T12:00:00.000Z", count: 0, items: [] },
  assessment: { state: "no_problem_detected", reasons: [], evidence: "stored_state_only" },
};
