import Link from "next/link";
import { notFound } from "next/navigation";

import { LearningSpaceNav } from "@/app/components/learning-space-nav";
import { LearningSpaceSettingsForm } from "@/app/components/learning-space-settings-form";
import { ConfirmActionButton } from "@/app/components/confirm-action-button";
import { requireAdmin } from "@/lib/auth";
import { getLearningSpaceBySlug, getLearningSpaces } from "@/lib/repositories";

import { deactivateLearningSpaceAction, saveLearningSpaceAction } from "../../actions";

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
    getLearningSpaceBySlug(spaceSlug),
    getLearningSpaces(true),
  ]);
  if (!space) notFound();

  return <main className="page-shell narrow-page">
    <Link href={`/admin/${encodeURIComponent(space.slug)}`} className="back-link">Terug naar portfolio&apos;s</Link>
    <LearningSpaceNav spaces={spaces} current={space} section="settings" />
    <header className="settings-heading">
      <p className="eyebrow">Leeromgeving</p>
      <h1>{space.name}</h1>
      <p>Deze bron wordt uitsluitend gelezen. Synchronisatie beinvloedt alleen deze leeromgeving.</p>
    </header>
    {saved === "1" ? <p className="success-message" role="status">Instellingen opgeslagen.</p> : null}
    <LearningSpaceSettingsForm space={space} action={saveLearningSpaceAction} />
    <section className="settings-section" aria-labelledby="remove-space-heading"><h2 id="remove-space-heading">Leeromgeving verwijderen</h2><p>De leeromgeving verdwijnt uit de actieve applicatie. Bestanden in de ingestelde bron worden nooit verwijderd.</p><ConfirmActionButton action={deactivateLearningSpaceAction} fields={{ id: space.id }} className="danger-button" label="Leeromgeving verwijderen" confirmTitle={`Leeromgeving '${space.name}' verwijderen?`} confirmText="De leeromgeving en de bijbehorende metadata worden uit de actieve applicatie verwijderd. Bestanden in Local filesystem, OneDrive of Google Drive worden NIET verwijderd." /></section>
  </main>;
}
