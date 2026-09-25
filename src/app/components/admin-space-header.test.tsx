import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LearningSpace, LearningSpaceSource } from "@/lib/repositories";
import type { LearningSpaceSourceStatus } from "@/lib/learning-space-source-status";

vi.mock("@/app/components/sync-space-form", () => ({
  SyncSpaceForm: () => <button>Nu synchroniseren</button>,
}));

vi.mock("@/lib/repositories", () => ({
  getLatestSyncSummary: vi.fn(),
  getOpenErrorThreadCount: vi.fn(),
}));
vi.mock("@/lib/authorization", () => ({ canConfigureLearningSpace: vi.fn() }));

import { getLatestSyncSummary, getOpenErrorThreadCount } from "@/lib/repositories";
import { canConfigureLearningSpace } from "@/lib/authorization";
import { AdminSpaceHeader } from "./admin-space-header";

const mirror: LearningSpaceSource = {
  id: "space-6:mirror", learningSpaceId: "space-6", role: "mirror", providerType: "google_drive", storageConnectionId: null, isActive: true,
  localSourcePath: null, oneDriveDriveId: null, oneDriveFolderId: null, oneDriveFolderPath: null,
  googleDriveFolderId: "folder", googleDriveFolderLabel: "Mirror 6", lastValidatedAt: null,
  lastValidationStatus: "valid", lastValidationMessage: null, mirrorCompletedAt: "2026-08-20T12:00:00.000Z",
};
const space: LearningSpace = {
  id: "space-6", name: "Zesde jaar wiskunde", slug: "6", shortLabel: "6WIS", description: "Oefenmateriaal", cardColor: "#DCEFE9",
  sortOrder: 60, isActive: true, archivedAt: null, editorsCanManageAccess: false, sourceType: "google_drive", localSourcePath: null,
  oneDriveDriveId: null, oneDriveFolderId: null, oneDriveFolderPath: null, googleDriveFolderId: "folder",
  googleDriveFolderLabel: "Mirror 6", sources: [mirror], activeSourceId: mirror.id, primarySource: null, mirrorSource: mirror,
};

describe("shared LearningSpace admin header", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(canConfigureLearningSpace).mockResolvedValue(true);
  });

  it("shows the agreed heading, mirror warning, report count, sync and compact navigation", async () => {
    vi.mocked(getLatestSyncSummary).mockResolvedValue({
      startedAt: "2026-08-20T12:00:00.000Z", finishedAt: "2026-08-20T12:01:00.000Z", portfolioCount: 3,
      warningCount: 0, status: "completed", providerType: "google_drive", addedCount: 0, updatedCount: 0, missingCount: 0, failureMessage: null,
    });
    vi.mocked(getOpenErrorThreadCount).mockResolvedValue(4);

    const markup = renderToStaticMarkup(await AdminSpaceHeader({ current: space, section: "settings", user: { id: "admin", displayName: "Admin", firstName: null, lastName: null, email: null, role: "superadmin", status: "active", classGroupOverrideId: null } }));
    expect(markup).toContain("Beheer");
    expect(markup).toContain("Zesde jaar wiskunde");
    expect(markup).toContain("Laatste geslaagde synchronisatie");
    expect(markup).toContain("Mirror actief");
    expect(markup).toContain('href="/admin/6/status"');
    expect(markup.indexOf(">Status</a>")).toBeLessThan(markup.indexOf("Foutmeldingen"));
    expect(markup).toContain("Foutmeldingen");
    expect(markup).toContain("notification-badge");
    expect(markup).toContain("Nu synchroniseren");
    expect(markup).not.toContain("space-switcher");
    expect(markup).not.toContain(">Foutmeldingen</a></div>");
  });

  it("hides Instellingen from an editor while keeping it for an owner", async () => {
    vi.mocked(getLatestSyncSummary).mockResolvedValue(null);
    vi.mocked(getOpenErrorThreadCount).mockResolvedValue(0);
    const teacher = { id: "teacher", displayName: "Teacher", firstName: null, lastName: null, email: null, role: "teacher" as const, status: "active" as const, classGroupOverrideId: null };

    vi.mocked(canConfigureLearningSpace).mockResolvedValueOnce(false);
    const editorMarkup = renderToStaticMarkup(await AdminSpaceHeader({ current: space, section: "portfolios", user: teacher }));
    expect(editorMarkup).not.toContain("Instellingen");
    expect(editorMarkup).toContain(">Status</a>");

    vi.mocked(canConfigureLearningSpace).mockResolvedValueOnce(true);
    const ownerMarkup = renderToStaticMarkup(await AdminSpaceHeader({ current: space, section: "portfolios", user: teacher }));
    expect(ownerMarkup).toContain("Instellingen");
    expect(ownerMarkup).toContain(">Status</a>");
  });

  it("labels a failed latest attempt without presenting it as a successful synchronization", async () => {
    vi.mocked(getLatestSyncSummary).mockResolvedValue({
      startedAt: "2026-08-20T12:00:00.000Z", finishedAt: "2026-08-20T12:01:00.000Z", portfolioCount: 0,
      warningCount: 0, status: "failed", providerType: "google_drive", addedCount: 0, updatedCount: 0, missingCount: 0,
      failureMessage: "Bron tijdelijk niet beschikbaar.",
    });
    vi.mocked(getOpenErrorThreadCount).mockResolvedValue(0);

    const markup = renderToStaticMarkup(await AdminSpaceHeader({ current: space, section: "portfolios", user: { id: "admin", displayName: "Admin", firstName: null, lastName: null, email: null, role: "superadmin", status: "active", classGroupOverrideId: null } }));

    expect(markup).toContain("Laatste synchronisatiepoging mislukt");
    expect(markup).not.toContain("Laatste geslaagde synchronisatie");
  });

  it("keeps previous synchronized content explicit after a failed attempt", async () => {
    vi.mocked(getOpenErrorThreadCount).mockResolvedValue(0);

    const markup = renderToStaticMarkup(await AdminSpaceHeader({
      current: space,
      section: "portfolios",
      user: admin,
      sourceStatus: failedSourceStatus(true),
    }));

    expect(markup).toContain("Laatste synchronisatiepoging mislukt");
    expect(markup).toContain("De vorige gesynchroniseerde inhoud blijft beschikbaar");
    expect(markup).not.toContain("nog geen bruikbare gesynchroniseerde inhoud");
    expect(markup.indexOf(">Status</a>")).toBeLessThan(markup.indexOf("Foutmeldingen"));
    expect(getLatestSyncSummary).not.toHaveBeenCalled();
  });

  it("makes the absence of usable synchronized content explicit after a failed first attempt", async () => {
    vi.mocked(getOpenErrorThreadCount).mockResolvedValue(0);

    const markup = renderToStaticMarkup(await AdminSpaceHeader({
      current: space,
      section: "portfolios",
      user: admin,
      sourceStatus: failedSourceStatus(false),
    }));

    expect(markup).toContain("Laatste synchronisatiepoging mislukt");
    expect(markup).toContain("Er is nog geen bruikbare gesynchroniseerde inhoud beschikbaar");
    expect(markup).not.toContain("De vorige gesynchroniseerde inhoud blijft beschikbaar");
  });

  it("marks the status link as current without adding a navigation tab", async () => {
    vi.mocked(getOpenErrorThreadCount).mockResolvedValue(0);

    const markup = renderToStaticMarkup(await AdminSpaceHeader({
      current: space,
      section: "status",
      user: admin,
      sourceStatus: failedSourceStatus(true),
    }));

    expect(markup).toContain('source-status-link is-current');
    expect(markup).toContain('aria-current="page"');
    expect(markup).not.toContain('space-link-current" href="/admin/6/status"');
  });
});

const admin = { id: "admin", displayName: "Admin", firstName: null, lastName: null, email: null, role: "superadmin" as const, status: "active" as const, classGroupOverrideId: null };

function failedSourceStatus(usableIndexAvailable: boolean): LearningSpaceSourceStatus {
  return {
    learningSpaceId: space.id,
    isArchived: false,
    observedAt: "2026-08-20T12:02:00.000Z",
    activeSource: null,
    sources: [],
    profile: null,
    synchronization: {
      latestAttempt: {
        sourceId: null, providerType: null, startedAt: "2026-08-20T12:00:00.000Z",
        finishedAt: "2026-08-20T12:01:00.000Z", result: "failed", portfolioCount: null,
        warningCount: null, failureMessage: "Bron tijdelijk niet beschikbaar.",
      },
      latestSuccessful: null,
      inProgress: { state: "not_detected", evidence: "no_active_sync_lease", leaseExpiresAt: null },
      usableIndex: { available: usableIndexAvailable, state: usableIndexAvailable ? "available_from_previous_success" : "unavailable" },
      profileIndexAlignment: { state: "unknown", reason: "no_successful_sync" },
    },
    missingContent: {
      state: "unknown", portfolios: null, sections: null, exercises: null, legacySolutionAssets: null,
      genericPortfolioResources: null, genericExerciseResources: null, genericResources: null,
      overlappingLegacyAndGenericExerciseAssets: null, totalFilesAndResources: null,
    },
    warnings: { state: "unknown", basedOnSuccessfulSyncAt: null, count: null, items: null },
    assessment: { state: "attention_required", reasons: ["latest_sync_failed"], evidence: "stored_state_only" },
  };
}
