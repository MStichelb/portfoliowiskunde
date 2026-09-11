import { notFound } from "next/navigation";

import { AdminSpaceHeader } from "@/app/components/admin-space-header";
import { LearningSpaceSettingsForm } from "@/app/components/learning-space-settings-form";
import { SourceProfileCard, type SourceProfileModal } from "@/app/components/source-profile-card";
import { SourceSwitchPanel } from "@/app/components/source-switch-panel";
import { requireAdminUser } from "@/lib/auth";
import { canConfigureLearningSpace, canManageLearningSpace } from "@/lib/authorization";
import { getAdminLearningSpaceBySlug } from "@/lib/repositories";
import { getSourceProfileAdminModel } from "@/lib/source-profiles";
import { listSourceProfileTemplates } from "@/lib/source-profile-templates";

import { saveLearningSpaceAction } from "../../actions";
import { copySelectedSourceProfileAction, copySourceProfileAction, copySourceProfileTemplateAction, createOwnSourceProfileAction, linkSourceProfileAction, renameSourceProfileAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function LearningSpaceSettingsPage({ params, searchParams }: { params: Promise<{ spaceSlug: string }>; searchParams: Promise<{ saved?: string; profileSaved?: string; profileError?: string; profileModal?: string }> }) {
  const user = await requireAdminUser();
  const { spaceSlug } = await params;
  const [query, space] = await Promise.all([searchParams, getAdminLearningSpaceBySlug(spaceSlug)]);
  if (!space || !await canManageLearningSpace(user, space.id)) notFound();
  const [canConfigure, sourceProfiles, templates] = await Promise.all([
    canConfigureLearningSpace(user, space.id),
    getSourceProfileAdminModel(user, space.id),
    listSourceProfileTemplates(user),
  ]);
  return <main className="page-shell admin-page admin-space-page learning-space-settings-page">
    <AdminSpaceHeader current={space} section="settings" user={user} />
    {!space.isActive ? <p className="archived-message" role="status">Gearchiveerd. Deze leeromgeving is niet publiek zichtbaar en wordt niet gesynchroniseerd.</p> : null}
    {query.saved === "1" ? <p className="success-message save-feedback" role="status">Instellingen opgeslagen.</p> : null}
    {canConfigure ? <LearningSpaceSettingsForm space={space} canPermanentlyDelete={user.role === "superadmin"} action={saveLearningSpaceAction} /> : null}
    <SourceProfileCard key={`${sourceProfiles.activeProfile.id}:${sourceProfiles.activeProfile.name}:${query.profileSaved ?? query.profileError ?? ""}`} learningSpaceId={space.id} model={sourceProfiles} templates={templates} canConfigure={canConfigure} actions={{
      linkProfile: linkSourceProfileAction,
      copySelectedProfile: copySelectedSourceProfileAction,
      copyTemplate: copySourceProfileTemplateAction,
      createOwnProfile: createOwnSourceProfileAction,
      copyProfile: copySourceProfileAction,
      renameProfile: renameSourceProfileAction,
    }} feedback={profileFeedback(query.profileSaved)} error={query.profileError} initialModal={sourceProfileModal(query.profileModal)} />
    {canConfigure && space.isActive ? <SourceSwitchPanel space={space} /> : null}
  </main>;
}

function sourceProfileModal(value: string | undefined): SourceProfileModal | null {
  return value === "switch" || value === "rename" || value === "copy" ? value : null;
}

function profileFeedback(value: string | undefined): string | undefined {
  if (value === "created") return "Eigen bronprofiel gemaakt en geactiveerd.";
  if (value === "copied") return "Profiel gekopieerd en actief gemaakt in de gekozen leeromgeving.";
  if (value === "copiedInactive") return "Profiel gekopieerd. Een eigenaar moet het profiel nog activeren.";
  if (value === "templateCopied") return "Sjabloon gekopieerd naar een onafhankelijk profiel en geactiveerd.";
  if (value === "renamed") return "Profielnaam gewijzigd.";
  if (value === "linked") return "Bronprofiel gekoppeld en actief gemaakt.";
  return undefined;
}
