import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { LearningSpace, LearningSpaceSource } from "@/lib/repositories";

import { ActiveSourceBadge } from "./active-source-badge";

describe("ActiveSourceBadge", () => {
  it("makes a mirror-active LearningSpace explicit in admin", () => {
    const markup = renderToStaticMarkup(<ActiveSourceBadge space={spaceWithActiveSource("mirror", "google_drive")} />);
    expect(markup).toContain("mirror-active-badge");
    expect(markup).toContain("Mirror actief · Google Drive");
  });

  it("shows the primary provider without a fallback warning style", () => {
    const markup = renderToStaticMarkup(<ActiveSourceBadge space={spaceWithActiveSource("primary", "onedrive")} />);
    expect(markup).toContain("source-role-badge");
    expect(markup).toContain("Primary · OneDrive");
    expect(markup).not.toContain("mirror-active-badge");
  });
});

function spaceWithActiveSource(role: LearningSpaceSource["role"], providerType: LearningSpaceSource["providerType"]): LearningSpace {
  const source: LearningSpaceSource = {
    id: `space-test:${role}`, learningSpaceId: "space-test", role, providerType, isActive: true,
    localSourcePath: null, oneDriveDriveId: null, oneDriveFolderId: null, oneDriveFolderPath: null,
    googleDriveFolderId: null, googleDriveFolderLabel: null, lastValidatedAt: null,
    lastValidationStatus: null, lastValidationMessage: null, mirrorCompletedAt: null,
  };
  return {
    id: "space-test", name: "Test", slug: "test", shortLabel: "T", sortOrder: 1, isActive: true,
    archivedAt: null, sourceType: providerType, localSourcePath: null, oneDriveDriveId: null,
    oneDriveFolderId: null, oneDriveFolderPath: null, googleDriveFolderId: null,
    googleDriveFolderLabel: null, sources: [source], activeSourceId: source.id,
    primarySource: role === "primary" ? source : null, mirrorSource: role === "mirror" ? source : null,
  };
}
