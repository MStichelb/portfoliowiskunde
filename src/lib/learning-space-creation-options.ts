import "server-only";
import { getManageableLearningSpaceIds } from "./authorization";
import type { AppUser } from "./identity";
import { getSourceProfileOverview } from "./source-profiles";
import { listSourceProfileTemplates } from "./source-profile-templates";
import { creationProfileSummary } from "./learning-space-creation-summary";
import type { LearningSpaceCreationOptions } from "./learning-space-creation-wizard";

export async function getLearningSpaceCreationOptions(user: AppUser): Promise<LearningSpaceCreationOptions> {
  const [templates, overview, spaceIds] = await Promise.all([
    listSourceProfileTemplates(user, { includeConfig: true }), getSourceProfileOverview(user), getManageableLearningSpaceIds(user),
  ]);
  const allowedSpaces = new Set(spaceIds);
  const profiles = [...overview.ownedProfiles, ...overview.editorAccessibleActiveProfiles, ...overview.otherUserProfiles];
  return {
    templates: templates.map((template) => ({ id: template.id, name: template.name, description: template.description, summary: template.config ? creationProfileSummary(template.config) : [], config: template.config })),
    copies: profiles.flatMap((profile) => profile.usages.filter((usage) => allowedSpaces.has(usage.learningSpaceId)).map((usage) => ({ id: usage.learningSpaceId, name: `${usage.learningSpaceName} — ${profile.name}`, description: profile.description, summary: creationProfileSummary(profile.config), config: profile.config }))),
    newProfileConfig: templates.find((template) => template.isDefault)?.config,
    links: overview.ownedProfiles.map((profile) => ({ id: profile.id, name: profile.name, description: profile.description, summary: creationProfileSummary(profile.config), config: profile.config })),
  };
}

