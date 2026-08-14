import Link from "next/link";
import { notFound } from "next/navigation";

import { LearningSpaceNav } from "@/app/components/learning-space-nav";
import { LearningSpaceSettingsForm } from "@/app/components/learning-space-settings-form";
import { ConfirmActionButton } from "@/app/components/confirm-action-button";
import { requireAdmin } from "@/lib/auth";
import { getAdminLearningSpaceBySlug, getLearningSpaces } from "@/lib/repositories";

import { archiveLearningSpaceAction, permanentlyDeleteLearningSpaceAction, restoreLearningSpaceAction, saveLearningSpaceAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function LearningSpaceSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ spaceSlug: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireAdmin();
  const { spaceSlug } = await params;
  const [{ saved }, space, spaces] = await Promise.all([
    searchParams,
    getAdminLearningSpaceBySlug(spaceSlug),
    getLearningSpaces(true),
  ]);
  if (!space) notFound();

  return <main className="page-shell narrow-page">
    <Link href={space.isActive ? `/admin/${encodeURIComponent(space.slug)}` : "/admin/instellingen"} className="back-link">{space.isActive ? "Terug naar portfolio's" : "Terug naar leeromgevingen"}</Link>
    <LearningSpaceNav spaces={spaces} current={space} section="settings" />
    <header className="settings-heading">
      <p className="eyebrow">Leeromgeving</p>
      <h1>{space.name}</h1>
      <p>Deze bron wordt uitsluitend gelezen. Synchronisatie beinvloedt alleen deze leeromgeving.</p>
    </header>
    {!space.isActive ? <p className="archived-message" role="status">Gearchiveerd. Deze leeromgeving is niet publiek zichtbaar en wordt niet gesynchroniseerd.</p> : null}
    {saved === "1" ? <p className="success-message" role="status">Instellingen opgeslagen.</p> : null}
    <LearningSpaceSettingsForm space={space} action={saveLearningSpaceAction} />
    <section className="settings-section" aria-labelledby="lifecycle-heading"><h2 id="lifecycle-heading">Status leeromgeving</h2><p>{space.isActive ? "Archiveer deze leeromgeving om alle instellingen te bewaren zonder ze publiek te tonen of te synchroniseren." : "Herstel deze leeromgeving om ze opnieuw publiek beschikbaar en synchroniseerbaar te maken."}</p><div className="space-list-actions">{space.isActive ? <form action={archiveLearningSpaceAction}><input type="hidden" name="id" value={space.id} /><button className="secondary-button" type="submit">Archiveren</button></form> : <form action={restoreLearningSpaceAction}><input type="hidden" name="id" value={space.id} /><button className="primary-button" type="submit">Herstellen</button></form>}<ConfirmActionButton action={permanentlyDeleteLearningSpaceAction} fields={{ id: space.id, confirmationSlug: space.slug }} className="danger-button" label="Permanent verwijderen" confirmTitle={`Leeromgeving "${space.slug}" permanent verwijderen?`} confirmText={`Alle instellingen en geïndexeerde metadata van leeromgeving "${space.slug}" worden verwijderd. Bronbestanden worden niet verwijderd.`} /></div></section>
  </main>;
}
