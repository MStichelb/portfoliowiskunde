import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { LearningSpace, LearningSpaceSource } from "@/lib/repositories";

vi.mock("@/app/components/sync-space-form", () => ({
  SyncSpaceForm: () => <button>Nu synchroniseren</button>,
}));

vi.mock("@/lib/repositories", () => ({
  getLatestSyncSummary: vi.fn(),
  getOpenErrorReportCount: vi.fn(),
}));

import { getLatestSyncSummary, getOpenErrorReportCount } from "@/lib/repositories";
import { AdminSpaceHeader } from "./admin-space-header";

const mirror: LearningSpaceSource = {
  id: "space-6:mirror", learningSpaceId: "space-6", role: "mirror", providerType: "google_drive", storageConnectionId: null, isActive: true,
  localSourcePath: null, oneDriveDriveId: null, oneDriveFolderId: null, oneDriveFolderPath: null,
  googleDriveFolderId: "folder", googleDriveFolderLabel: "Mirror 6", lastValidatedAt: null,
  lastValidationStatus: "valid", lastValidationMessage: null, mirrorCompletedAt: "2026-08-20T12:00:00.000Z",
};
const space: LearningSpace = {
  id: "space-6", name: "Zesde jaar wiskunde", slug: "6", shortLabel: "6WIS", description: "Oefenmateriaal", cardColor: "#DCEFE9",
  sortOrder: 60, isActive: true, archivedAt: null, sourceType: "google_drive", localSourcePath: null,
  oneDriveDriveId: null, oneDriveFolderId: null, oneDriveFolderPath: null, googleDriveFolderId: "folder",
  googleDriveFolderLabel: "Mirror 6", sources: [mirror], activeSourceId: mirror.id, primarySource: null, mirrorSource: mirror,
};

describe("shared LearningSpace admin header", () => {
  it("shows the agreed heading, mirror warning, report count, sync and compact navigation", async () => {
    vi.mocked(getLatestSyncSummary).mockResolvedValue({
      startedAt: "2026-08-20T12:00:00.000Z", finishedAt: "2026-08-20T12:01:00.000Z", portfolioCount: 3,
      warningCount: 0, status: "completed", providerType: "google_drive", addedCount: 0, updatedCount: 0, missingCount: 0, failureMessage: null,
    });
    vi.mocked(getOpenErrorReportCount).mockResolvedValue(4);

    const markup = renderToStaticMarkup(await AdminSpaceHeader({ current: space, section: "settings", user: { id: "admin", displayName: "Admin", firstName: null, lastName: null, email: null, role: "superadmin", status: "active", classGroupOverrideId: null } }));
    expect(markup).toContain("Beheer");
    expect(markup).toContain("Zesde jaar wiskunde");
    expect(markup).toContain("Laatste synchronisatie");
    expect(markup).toContain("Mirror actief");
    expect(markup).toContain("Foutmeldingen");
    expect(markup).toContain("notification-badge");
    expect(markup).toContain("Nu synchroniseren");
    expect(markup).not.toContain("space-switcher");
    expect(markup).not.toContain(">Foutmeldingen</a></div>");
  });
});
