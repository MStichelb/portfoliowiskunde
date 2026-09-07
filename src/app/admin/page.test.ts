import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SmartschoolConnectLink } from "@/app/components/smartschool-connect-link";
import type { LearningSpace, LearningSpaceSource } from "@/lib/repositories";

import { sourceSummary } from "./page";

describe("admin LearningSpace source summary", () => {
  it("uses Bron on the compact card while distinguishing an optional mirror", () => {
    expect(sourceSummary(spaceWithSources())).toBe("Bron • OneDrive · Mirror • Google Drive");
  });

  it("start de Smartschool-koppeling via een gewone browserlink zonder RSC-parameters", () => {
    const markup = renderToStaticMarkup(createElement(SmartschoolConnectLink));
    expect(markup).toContain('href="/api/auth/smartschool/link"');
    expect(markup).not.toContain("_rsc");
  });
});

function spaceWithSources(): LearningSpace {
  const primary = source("primary", "onedrive");
  const mirror = source("mirror", "google_drive");
  return {
    id: "space-6", name: "Zesde jaar", slug: "6", shortLabel: "6WIS", description: "Oefenmateriaal",
    cardColor: "#DCEFE9", sortOrder: 6, isActive: true, archivedAt: null, editorsCanManageAccess: false, sourceType: "onedrive",
    localSourcePath: null, oneDriveDriveId: "drive", oneDriveFolderId: "folder", oneDriveFolderPath: "6WIS",
    googleDriveFolderId: null, googleDriveFolderLabel: null, sources: [primary, mirror],
    activeSourceId: primary.id, primarySource: primary, mirrorSource: mirror,
  };
}

function source(role: LearningSpaceSource["role"], providerType: LearningSpaceSource["providerType"]): LearningSpaceSource {
  return {
    id: `space-6:${role}`, learningSpaceId: "space-6", role, providerType,
    storageConnectionId: providerType === "onedrive" ? "connection-test" : null, isActive: role === "primary",
    localSourcePath: null, oneDriveDriveId: providerType === "onedrive" ? "drive" : null,
    oneDriveFolderId: providerType === "onedrive" ? "folder" : null, oneDriveFolderPath: null,
    googleDriveFolderId: providerType === "google_drive" ? "google-folder" : null,
    googleDriveFolderLabel: null, lastValidatedAt: null, lastValidationStatus: null,
    lastValidationMessage: null, mirrorCompletedAt: null,
  };
}
