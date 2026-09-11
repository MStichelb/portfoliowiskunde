import { notFound } from "next/navigation";

import { AdminSpaceHeader } from "@/app/components/admin-space-header";
import { LearningSpaceSettingsForm } from "@/app/components/learning-space-settings-form";
import { SourceProfileCard } from "@/app/components/source-profile-card";
import { SourceSwitchPanel } from "@/app/components/source-switch-panel";
import { requireAdminUser } from "@/lib/auth";
import { canConfigureLearningSpace, canManageLearningSpace } from "@/lib/authorization";
import { getAdminLearningSpaceBySlug } from "@/lib/repositories";
import { getSourceProfileForLearningSpaceCard } from "@/lib/source-profiles";

import { saveLearningSpaceAction } from "../../actions";
export const dynamic = "force-dynamic";

export default async function LearningSpaceSettingsPage({ params, searchParams }: { params: Promise<{ spaceSlug: string }>; searchParams: Promise<{ saved?: string }> }) {
  const user = await requireAdminUser();
  const { spaceSlug } = await params;
  const [query, space] = await Promise.all([searchParams, getAdminLearningSpaceBySlug(spaceSlug)]);
  if (!space || !await canManageLearningSpace(user, space.id)) notFound();
  const [canConfigure, sourceProfile] = await Promise.all([
    canConfigureLearningSpace(user, space.id),
    getSourceProfileForLearningSpaceCard(user, space.id),
  ]);
  return <main className="page-shell admin-page admin-space-page learning-space-settings-page">
    <AdminSpaceHeader current={space} section="settings" user={user} />
    {!space.isActive ? <p className="archived-message" role="status">Gearchiveerd. Deze leeromgeving is niet publiek zichtbaar en wordt niet gesynchroniseerd.</p> : null}
    {query.saved === "1" ? <p className="success-message save-feedback" role="status">Instellingen opgeslagen.</p> : null}
    {canConfigure ? <LearningSpaceSettingsForm space={space} canPermanentlyDelete={user.role === "superadmin"} action={saveLearningSpaceAction} /> : null}
    <SourceProfileCard profile={sourceProfile} canConfigure={canConfigure} />
    {canConfigure && space.isActive ? <SourceSwitchPanel space={space} /> : null}
  </main>;
}
