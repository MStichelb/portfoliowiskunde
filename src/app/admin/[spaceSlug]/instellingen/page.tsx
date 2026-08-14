import Link from "next/link";
import { notFound } from "next/navigation";

import { LearningSpaceLifecycleActions } from "@/app/components/learning-space-lifecycle-actions";
import { LearningSpaceNav } from "@/app/components/learning-space-nav";
import { LearningSpaceSettingsForm } from "@/app/components/learning-space-settings-form";
import { requireAdmin } from "@/lib/auth";
import { getAdminLearningSpaceBySlug, getLearningSpaces } from "@/lib/repositories";

import { saveLearningSpaceAction } from "../../actions";

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
    <section className="settings-section" aria-labelledby="lifecycle-heading">
      <h2 id="lifecycle-heading">Status leeromgeving</h2>
      <p>{space.isActive ? "Archiveer deze leeromgeving om alle instellingen te bewaren zonder ze publiek te tonen of te synchroniseren." : "Herstel deze leeromgeving om ze opnieuw publiek beschikbaar en synchroniseerbaar te maken. Permanent verwijderen wist alleen de databasegegevens; bronbestanden blijven onaangeraakt."}</p>
      <LearningSpaceLifecycleActions space={space} showManage={false} />
    </section>
  </main>;
}
