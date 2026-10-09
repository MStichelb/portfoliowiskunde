import { FlashToast } from "@/app/components/flash-toast";
import { notFound } from "next/navigation";

import { AdminSpaceHeader } from "@/app/components/admin-space-header";
import { LearningSpaceSettingsForm } from "@/app/components/learning-space-settings-form";
import { LearningSpaceSettingsNavigation, LearningSpaceSettingsPanel } from "@/app/components/learning-space-settings-navigation";
import { SourceProfileCard } from "@/app/components/source-profile-card";
import { SourceSwitchPanel } from "@/app/components/source-switch-panel";
import { requireAdminUser } from "@/lib/auth";
import { canConfigureLearningSpace } from "@/lib/authorization";
import { getAdminLearningSpaceBySlug } from "@/lib/repositories";
import { getSourceProfileForLearningSpaceCard } from "@/lib/source-profiles";
import { listActiveSubjects } from "@/lib/subjects";
import { listSourceProfileTemplates } from "@/lib/source-profile-templates";

import { saveLearningSpaceAction } from "../../actions";
export const dynamic = "force-dynamic";

export default async function LearningSpaceSettingsPage({ params, searchParams }: { params: Promise<{ spaceSlug: string }>; searchParams: Promise<{ saved?: string }> }) {
  const user = await requireAdminUser();
  const { spaceSlug } = await params;
  const [query, space] = await Promise.all([searchParams, getAdminLearningSpaceBySlug(spaceSlug)]);
  const canConfigure = space ? await canConfigureLearningSpace(user, space.id) : false;
  if (!space || !canConfigure) notFound();
  const [sourceProfile, subjects, templates] = await Promise.all([
    getSourceProfileForLearningSpaceCard(user, space.id),
    listActiveSubjects(),
    listSourceProfileTemplates(user),
  ]);
  return <main className="page-shell admin-page admin-space-page learning-space-settings-page">
    <AdminSpaceHeader current={space} section="settings" user={user} canConfigure={canConfigure} />
    {!space.isActive ? <p className="archived-message" role="status">Gearchiveerd. Deze leeromgeving is niet publiek zichtbaar en wordt niet gesynchroniseerd.</p> : null}
    {query.saved === "1" ? <FlashToast type="success" message="Instellingen opgeslagen." feedbackKey="saved" /> : null}
    <LearningSpaceSettingsNavigation>
      <LearningSpaceSettingsForm
        space={space}
        subjects={subjects}
        canPermanentlyDelete={user.role === "superadmin"}
        action={saveLearningSpaceAction}
      />
      <LearningSpaceSettingsPanel section="profile">
        <SourceProfileCard profile={sourceProfile} canConfigure learningSpaceId={space.id} templates={templates} />
      </LearningSpaceSettingsPanel>
      {space.isActive ? <LearningSpaceSettingsPanel section="source" continuation><SourceSwitchPanel space={space} /></LearningSpaceSettingsPanel> : null}
    </LearningSpaceSettingsNavigation>
  </main>;
}
