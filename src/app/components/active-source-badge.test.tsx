import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { LearningSpace, LearningSpaceSource } from "@/lib/repositories";

import { ActiveSourceBadge, LearningSpaceSourceSummary } from "./active-source-badge";

describe("ActiveSourceBadge", () => {
  it("makes a mirror-active LearningSpace explicit in admin", () => {
    const markup = renderToStaticMarkup(<ActiveSourceBadge space={spaceWithActiveSource("mirror", "google_drive")} />);
    expect(markup).toContain("mirror-active-badge");
    expect(markup).toContain("Mirror actief • Google Drive • Mirror test");
  });

  it("shows the primary provider without a fallback warning style", () => {
    const markup = renderToStaticMarkup(<ActiveSourceBadge space={spaceWithActiveSource("primary", "onedrive")} />);
    expect(markup).toContain("source-role-badge");
    expect(markup).toContain("Bron • OneDrive • PORTFOLIO/TEST");
    expect(markup).not.toContain("mirror-active-badge");
  });

  it("shows the active source only once and keeps the configured mirror on a separate line", () => {
    const space = spaceWithActiveSource("primary", "onedrive");
    const mirror = source("mirror", "google_drive", false);
    space.sources.push(mirror);
    space.mirrorSource = mirror;

    const markup = renderToStaticMarkup(<LearningSpaceSourceSummary space={space} />);
    expect(markup.match(/Bron • OneDrive/g)).toHaveLength(1);
    expect(markup).toContain("Bron • OneDrive • PORTFOLIO/TEST");
    expect(markup).toContain("Mirror</strong> • Google Drive • Mirror test");
  });
});

function spaceWithActiveSource(role: LearningSpaceSource["role"], providerType: LearningSpaceSource["providerType"]): LearningSpace {
  const activeSource = source(role, providerType, true);
  return {
    id: "space-test", name: "Test", slug: "test", shortLabel: "T", description: "Testomgeving", cardColor: "#DCEFE9", sortOrder: 1, isActive: true,
    archivedAt: null, sourceType: providerType, localSourcePath: null, oneDriveDriveId: null,
    oneDriveFolderId: null, oneDriveFolderPath: null, googleDriveFolderId: null,
    googleDriveFolderLabel: null, sources: [activeSource], activeSourceId: activeSource.id,
    primarySource: role === "primary" ? activeSource : null, mirrorSource: role === "mirror" ? activeSource : null,
  };
}

function source(role: LearningSpaceSource["role"], providerType: LearningSpaceSource["providerType"], isActive: boolean): LearningSpaceSource {
  return {
    id: `space-test:${role}`, learningSpaceId: "space-test", role, providerType,
    storageConnectionId: providerType === "onedrive" ? "connection-test" : null, isActive,
    localSourcePath: providerType === "local" ? "C:\\Portfolio\\Test" : null,
    oneDriveDriveId: providerType === "onedrive" ? "drive" : null,
    oneDriveFolderId: providerType === "onedrive" ? "folder" : null,
    oneDriveFolderPath: providerType === "onedrive" ? "PORTFOLIO/TEST" : null,
    googleDriveFolderId: providerType === "google_drive" ? "google-folder" : null,
    googleDriveFolderLabel: providerType === "google_drive" ? "Mirror test" : null,
    lastValidatedAt: null, lastValidationStatus: null, lastValidationMessage: null, mirrorCompletedAt: null,
  };
}
