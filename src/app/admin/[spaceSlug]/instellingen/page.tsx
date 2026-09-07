import { notFound } from "next/navigation";

import { AdminSpaceHeader } from "@/app/components/admin-space-header";
import { LearningSpaceLifecycleActions } from "@/app/components/learning-space-lifecycle-actions";
import { LearningSpaceSettingsForm } from "@/app/components/learning-space-settings-form";
import { SourceSwitchPanel } from "@/app/components/source-switch-panel";
import { requireAdminUser } from "@/lib/auth";
import { canConfigureLearningSpace } from "@/lib/authorization";
import { getAdminLearningSpaceBySlug } from "@/lib/repositories";

import { saveLearningSpaceAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function LearningSpaceSettingsPage({ params, searchParams }: { params: Promise<{ spaceSlug: string }>; searchParams: Promise<{ saved?: string }> }) {
  const user = await requireAdminUser();
  const { spaceSlug } = await params;
  const [query, space] = await Promise.all([searchParams, getAdminLearningSpaceBySlug(spaceSlug)]);
  if (!space || !await canConfigureLearningSpace(user, space.id)) notFound();
  return <main className="page-shell admin-page admin-space-page learning-space-settings-page">
    <AdminSpaceHeader current={space} section="settings" user={user} />
    {!space.isActive ? <p className="archived-message" role="status">Gearchiveerd. Deze leeromgeving is niet publiek zichtbaar en wordt niet gesynchroniseerd.</p> : null}
    {query.saved === "1" ? <p className="success-message save-feedback" role="status">Instellingen opgeslagen.</p> : null}
    <LearningSpaceSettingsForm space={space} action={saveLearningSpaceAction} />
    {space.isActive ? <SourceSwitchPanel space={space} /> : null}
    {user.role === "superadmin" ? <section className="settings-section" aria-labelledby="lifecycle-heading"><h2 id="lifecycle-heading">Status leeromgeving</h2><p>{space.isActive ? "Archiveer deze leeromgeving om alle instellingen te bewaren zonder ze publiek te tonen of te synchroniseren." : "Herstel deze leeromgeving om ze opnieuw publiek beschikbaar en synchroniseerbaar te maken. Permanent verwijderen wist alleen de databasegegevens; bronbestanden blijven onaangeraakt."}</p><LearningSpaceLifecycleActions space={space} showManage={false} /></section> : null}
  </main>;
}
