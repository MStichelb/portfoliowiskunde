import { notFound } from "next/navigation";

import { AdminSpaceHeader } from "@/app/components/admin-space-header";
import { LearningSpaceSettingsForm } from "@/app/components/learning-space-settings-form";
import { SourceProfileCard } from "@/app/components/source-profile-card";
import { SourceSwitchPanel } from "@/app/components/source-switch-panel";
import { requireAdminUser } from "@/lib/auth";
import { canConfigureLearningSpace, canManageLearningSpace } from "@/lib/authorization";
import { getAdminLearningSpaceBySlug } from "@/lib/repositories";
import { getSourceProfileAdminModel } from "@/lib/source-profiles";

import { saveLearningSpaceAction } from "../../actions";
import { copySourceProfileAction, createOwnSourceProfileAction, renameSourceProfileAction, switchSourceProfileAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function LearningSpaceSettingsPage({ params, searchParams }: { params: Promise<{ spaceSlug: string }>; searchParams: Promise<{ saved?: string; profileSaved?: string; profileError?: string }> }) {
  const user = await requireAdminUser();
  const { spaceSlug } = await params;
  const [query, space] = await Promise.all([searchParams, getAdminLearningSpaceBySlug(spaceSlug)]);
  if (!space || !await canManageLearningSpace(user, space.id)) notFound();
  const [canConfigure, sourceProfiles] = await Promise.all([
    canConfigureLearningSpace(user, space.id),
    getSourceProfileAdminModel(user, space.id),
  ]);
  return <main className="page-shell admin-page admin-space-page learning-space-settings-page">
    <AdminSpaceHeader current={space} section="settings" user={user} />
    {!space.isActive ? <p className="archived-message" role="status">Gearchiveerd. Deze leeromgeving is niet publiek zichtbaar en wordt niet gesynchroniseerd.</p> : null}
    {query.saved === "1" ? <p className="success-message save-feedback" role="status">Instellingen opgeslagen.</p> : null}
    {canConfigure ? <LearningSpaceSettingsForm space={space} canPermanentlyDelete={user.role === "superadmin"} action={saveLearningSpaceAction} /> : null}
    <SourceProfileCard learningSpaceId={space.id} model={sourceProfiles} actions={{
      switchProfile: switchSourceProfileAction,
      createOwnProfile: createOwnSourceProfileAction,
      copyProfile: copySourceProfileAction,
      renameProfile: renameSourceProfileAction,
    }} feedback={profileFeedback(query.profileSaved)} error={query.profileError} />
    {canConfigure && space.isActive ? <SourceSwitchPanel space={space} /> : null}
  </main>;
}

function profileFeedback(value: string | undefined): string | undefined {
  if (value === "created") return "Eigen bronprofiel gemaakt en geactiveerd.";
  if (value === "copied") return "Bronprofiel onafhankelijk gekopieerd en geactiveerd.";
  if (value === "renamed") return "Profielnaam gewijzigd.";
  if (value === "switched") return "Bronprofiel gewijzigd.";
  return undefined;
}
