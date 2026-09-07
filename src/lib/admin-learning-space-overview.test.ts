import { describe, expect, it } from "vitest";

import type { AppUser } from "./identity";
import type { LearningSpace, LearningSpaceSource } from "./repositories";
import type { ManagedGroupMapping, ManagedMembership } from "./user-management";
import { buildAdminLearningSpaceCards } from "./admin-learning-space-overview";

describe("admin LearningSpace overview model", () => {
  it("keeps core card data and resolves owner, editor, class and source details in one model", () => {
    const cards = buildAdminLearningSpaceCards({
      spaces: [space("space-5", "5", "5WIS", "Vijfde jaar", true, "onedrive", { ...source("space-5", "mirror", "google_drive"), lastValidationStatus: "valid" })],
      activeManageableIds: ["space-5"],
      memberships: [membership("space-5", "owner", "Olivia Owner", "owner"), membership("space-5", "editor", "Elias Editor", "editor")],
      groupMappings: [mapping("space-5", "5WEWI6"), mapping("space-5", "Wetenschappen"), mapping("space-5", "Wetenschappen")],
      user: user("owner", "teacher"),
    });

    expect(cards).toEqual([expect.objectContaining({
      shortLabel: "5WIS",
      displayName: "Vijfde jaar",
      ownerNames: ["Olivia Owner"],
      editorNames: ["Elias Editor"],
      classGroups: ["5WEWI6"],
      extraGroups: ["Wetenschappen"],
      primarySource: "OneDrive",
      mirrorSource: "Google Drive",
      currentUserRole: "owner",
    })]);
  });

  it.each([
    ["owner", "owner"],
    ["editor", "editor"],
    ["viewer", null],
  ] as const)("keeps only an explicit %s management role for a teacher", (userId, expectedRole) => {
    const memberships = expectedRole ? [membership("space-5", userId, userId, expectedRole)] : [membership("space-5", "owner", "Owner", "owner")];
    const cards = buildAdminLearningSpaceCards({
      spaces: [space("space-5", "5", "5WIS", "Vijfde jaar")],
      activeManageableIds: ["space-5"],
      memberships,
      groupMappings: [],
      user: user(userId, "teacher"),
    });

    expect(cards[0]?.currentUserRole).toBe(expectedRole);
  });

  it("does not infer a role from global superadmin access but preserves explicit memberships", () => {
    const withoutMembership = buildAdminLearningSpaceCards({
      spaces: [space("space-5", "5", "5WIS", "Vijfde jaar")], activeManageableIds: ["space-5"], memberships: [], groupMappings: [], user: user("admin", "superadmin"),
    });
    const asOwner = buildAdminLearningSpaceCards({
      spaces: [space("space-5", "5", "5WIS", "Vijfde jaar")], activeManageableIds: ["space-5"], memberships: [membership("space-5", "admin", "Admin", "owner")], groupMappings: [], user: user("admin", "superadmin"),
    });
    const asEditor = buildAdminLearningSpaceCards({
      spaces: [space("space-5", "5", "5WIS", "Vijfde jaar")], activeManageableIds: ["space-5"], memberships: [membership("space-5", "admin", "Admin", "editor")], groupMappings: [], user: user("admin", "superadmin"),
    });

    expect(withoutMembership[0]?.currentUserRole).toBeNull();
    expect(asOwner[0]?.currentUserRole).toBe("owner");
    expect(asEditor[0]?.currentUserRole).toBe("editor");
  });

  it("keeps global active and archived visibility for a superadmin", () => {
    const cards = buildAdminLearningSpaceCards({
      spaces: [space("active", "5", "5WIS", "Actief"), space("archived", "6", "6WIS", "Archief", false)],
      activeManageableIds: ["active"],
      memberships: [],
      groupMappings: [],
      user: user("admin", "superadmin"),
    });

    expect(cards.map((card) => [card.id, card.currentUserRole])).toEqual([["active", null], ["archived", null]]);
  });

  it("preserves active visibility and includes only manageable archived spaces for a teacher", () => {
    const cards = buildAdminLearningSpaceCards({
      spaces: [
        space("active-owned", "5", "5WIS", "Actief"),
        space("active-other", "6", "6WIS", "Niet beheerbaar"),
        space("archived-owned", "7", "7WIS", "Archief", false),
        space("archived-other", "8", "8WIS", "Ander archief", false),
      ],
      activeManageableIds: ["active-owned"],
      memberships: [membership("active-owned", "teacher", "Teacher", "owner"), membership("archived-owned", "teacher", "Teacher", "editor")],
      groupMappings: [],
      user: user("teacher", "teacher"),
    });

    expect(cards.map((card) => card.id)).toEqual(["active-owned", "archived-owned"]);
  });

});

function user(id: string, role: AppUser["role"]): AppUser {
  return { id, displayName: id, firstName: null, lastName: null, email: null, role, status: "active", classGroupOverrideId: null };
}

function membership(learningSpaceId: string, userId: string, displayName: string, role: ManagedMembership["role"]): ManagedMembership {
  return { learningSpaceId, userId, displayName, role };
}

function mapping(learningSpaceId: string, externalGroupName: string): ManagedGroupMapping {
  return { id: `${learningSpaceId}:${externalGroupName}`, learningSpaceId, provider: "smartschool", externalGroupId: externalGroupName, externalGroupName };
}

function space(id: string, slug: string, shortLabel: string, name: string, isActive = true, sourceType: LearningSpace["sourceType"] = "local", mirrorSource: LearningSpaceSource | null = null): LearningSpace {
  const primarySource = source(id, "primary", sourceType);
  return {
    id, slug, shortLabel, name, description: "Oefenmateriaal", cardColor: "#DCEFE9", sortOrder: Number(slug) || 99,
    isActive, archivedAt: isActive ? null : "2026-09-01T00:00:00.000Z", editorsCanManageAccess: false, sourceType,
    localSourcePath: null, oneDriveDriveId: null, oneDriveFolderId: null, oneDriveFolderPath: null,
    googleDriveFolderId: null, googleDriveFolderLabel: null, sources: mirrorSource ? [primarySource, mirrorSource] : [primarySource],
    activeSourceId: primarySource.id, primarySource, mirrorSource,
  };
}

function source(learningSpaceId: string, role: LearningSpaceSource["role"], providerType: LearningSpaceSource["providerType"]): LearningSpaceSource {
  return {
    id: `${learningSpaceId}:${role}`, learningSpaceId, role, providerType, storageConnectionId: null, isActive: role === "primary",
    localSourcePath: null, oneDriveDriveId: null, oneDriveFolderId: null, oneDriveFolderPath: null,
    googleDriveFolderId: null, googleDriveFolderLabel: null, lastValidatedAt: null, lastValidationStatus: null,
    lastValidationMessage: null, mirrorCompletedAt: null,
  };
}
