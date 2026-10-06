import "server-only";
import { getManageableLearningSpaceIds } from "./authorization";
import type { AppUser } from "./identity";
import { getLearningSpace } from "./repositories";
import type { SourceProfileUsage } from "./source-profiles";
import { sourceProfilePresentationSpaces, type SourceProfilePresentationSpace } from "./source-profile-presentation";

export async function loadSourceProfilePresentationSpaces(user: AppUser, usages: readonly SourceProfileUsage[]): Promise<SourceProfilePresentationSpace[]> {
  if (!usages.length) return [];
  const allowedIds = await getManageableLearningSpaceIds(user);
  const linkedIds = usages.map((usage) => usage.learningSpaceId);
  const rows = await Promise.all(linkedIds.filter((id) => allowedIds.includes(id)).map(getLearningSpace));
  const spaces = rows.flatMap((space) => space ? [{
    id: space.id, name: space.name, shortLabel: space.shortLabel, sortOrder: space.sortOrder,
    themeLabelSingular: space.themeLabelSingular, themeLabelPlural: space.themeLabelPlural,
    collectionLabelSingular: space.collectionLabelSingular, collectionLabelPlural: space.collectionLabelPlural,
    sectionLabelSingular: space.sectionLabelSingular, sectionLabelPlural: space.sectionLabelPlural,
    exerciseLabelSingular: space.exerciseLabelSingular, exerciseLabelPlural: space.exerciseLabelPlural,
  }] : []);
  return sourceProfilePresentationSpaces(spaces, linkedIds, allowedIds);
}
