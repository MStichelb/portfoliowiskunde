import type { AppUser, LearningSpaceMemberRole } from "@/lib/identity";
import type { LearningSpace } from "@/lib/repositories";
import { isClassGroupName, type ManagedGroupMapping, type ManagedMembership } from "@/lib/user-management";

export interface AdminLearningSpaceCardData {
  id: string;
  slug: string;
  shortLabel: string;
  displayName: string;
  cardColor: string;
  isArchived: boolean;
  ownerNames: string[];
  editorNames: string[];
  classGroups: string[];
  extraGroups: string[];
  primarySource: string;
  mirrorSource: string | null;
  currentUserRole: LearningSpaceMemberRole | null;
}

export function buildAdminLearningSpaceCards({
  spaces,
  activeManageableIds,
  memberships,
  groupMappings,
  user,
}: {
  spaces: LearningSpace[];
  activeManageableIds: string[];
  memberships: ManagedMembership[];
  groupMappings: ManagedGroupMapping[];
  user: AppUser;
}): AdminLearningSpaceCardData[] {
  const activeIds = new Set(activeManageableIds);
  const currentMemberships = new Map(
    memberships
      .filter((membership) => membership.userId === user.id)
      .map((membership) => [membership.learningSpaceId, membership.role]),
  );

  return spaces
    .filter((space) => space.isActive
      ? activeIds.has(space.id)
      : user.role === "superadmin" || currentMemberships.has(space.id))
    .map((space) => {
      const spaceMemberships = memberships.filter((membership) => membership.learningSpaceId === space.id);
      const groupNames = groupMappings
        .filter((mapping) => mapping.learningSpaceId === space.id && mapping.provider === "smartschool" && mapping.externalGroupName)
        .map((mapping) => mapping.externalGroupName!)
        .filter((name, index, names) => names.indexOf(name) === index);
      return {
        id: space.id,
        slug: space.slug,
        shortLabel: space.shortLabel,
        displayName: space.name,
        cardColor: space.cardColor,
        isArchived: !space.isActive,
        ownerNames: spaceMemberships.filter((membership) => membership.role === "owner").map((membership) => membership.displayName),
        editorNames: spaceMemberships.filter((membership) => membership.role === "editor").map((membership) => membership.displayName),
        classGroups: groupNames.filter(isClassGroupName),
        extraGroups: groupNames.filter((name) => !isClassGroupName(name)),
        primarySource: providerLabel(space.primarySource?.providerType ?? space.sourceType),
        mirrorSource: space.mirrorSource ? providerLabel(space.mirrorSource.providerType) : null,
        currentUserRole: currentMemberships.get(space.id) ?? null,
      };
    });
}

export function providerLabel(provider: LearningSpace["sourceType"]): string {
  if (provider === "onedrive") return "OneDrive";
  if (provider === "google_drive") return "Google Drive";
  return "Lokale bestanden (test)";
}
