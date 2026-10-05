import { Settings, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminSpaceHeader } from "@/app/components/admin-space-header";
import { ConfirmActionButton } from "@/app/components/confirm-action-button";
import { PublicationStatus } from "@/app/components/publication-status";
import { requireAdminUser } from "@/lib/auth";
import { canConfigureLearningSpace, canManageLearningSpace } from "@/lib/authorization";
import { getLearningSpaceSourceStatus } from "@/lib/learning-space-source-status";
import { formatTerminologyLabel, miscellaneousCollectionLabel } from "@/lib/collection-terminology";
import { buildPortfolioThemeGroups } from "@/lib/portfolio-theme-groups";
import { getActiveWarningCounts, getAdminLearningSpaceBySlug, getAdminPortfolios, getMissingIndexCounts, getThemes } from "@/lib/repositories";

import { archiveMissingIndexAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function LearningSpaceAdminPage({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const user = await requireAdminUser();
  const { spaceSlug } = await params;
  const space = await getAdminLearningSpaceBySlug(spaceSlug);
  if (!space || !await canManageLearningSpace(user, space.id)) notFound();
  const canConfigure = await canConfigureLearningSpace(user, space.id);
  const [portfolios, themes, warnings, missing, sourceStatus] = await Promise.all([
    getAdminPortfolios(space.id), getThemes(space.id), getActiveWarningCounts(space.id), getMissingIndexCounts(space.id),
    getLearningSpaceSourceStatus(user, space.id),
  ]);
  const groups = buildPortfolioThemeGroups(portfolios, themes, miscellaneousCollectionLabel(space.collectionLabelPlural));

  return <main className="page-shell admin-page admin-space-page">
    <AdminSpaceHeader
      current={space}
      section="portfolios"
      user={user}
      canConfigure={canConfigure}
      sourceStatus={sourceStatus}
    />
    {!space.isActive ? <p className="archived-message" role="status">Gearchiveerd. De laatst opgeslagen metadata blijft beschikbaar; synchronisatie is uitgeschakeld.</p> : null}
    {missing.exercises > 0 || missing.assets > 0 ? <div className="missing-index-action"><span>{missing.exercises} verdwenen oefeningen en {missing.assets} verdwenen bestanden wachten op opschoning.</span><ConfirmActionButton action={archiveMissingIndexAction} fields={{ learningSpaceId: space.id }} className="danger-button" label="Index opschonen" confirmTitle="Verdwenen items uit overzicht verwijderen" confirmText={`${missing.exercises} oefeningen en ${missing.assets} bestanden verdwijnen uit het actieve overzicht. Meldingen en notities blijven behouden; bronbestanden worden nooit gewijzigd.`} /></div> : null}
    {groups.length === 0 ? <p className="empty-state">Nog geen items in deze leeromgeving. Configureer een bron en synchroniseer.</p> : groups.map((group) => <section className="theme-admin-group" key={group.id}>
      {group.name ? <h2>{group.name}</h2> : null}
      <div className="admin-summary-table" role="region" aria-label={group.name ? `${group.name} — ${formatTerminologyLabel(space.collectionLabelPlural, "standalone")}` : formatTerminologyLabel(space.collectionLabelPlural, "standalone")} tabIndex={0}><table><thead><tr><th>Nr</th><th>Titel</th><th>Status</th><th>Onderdelen</th><th>{formatTerminologyLabel(space.exerciseLabelPlural, "standalone")}</th><th>Waarschuwingen</th><th><span className="sr-only">Beheren</span></th></tr></thead><tbody>{group.portfolios.map((portfolio) => <tr key={portfolio.id}><td><strong>{portfolio.code}</strong></td><td>{portfolio.title}</td><td><PublicationStatus status={portfolio.effectiveStatus} /></td><td>{portfolio.sections.length}</td><td>{portfolio.sections.reduce((sum, section) => sum + section.exercises.length, portfolio.exercises?.length ?? 0)}</td><td>{warnings.get(portfolio.id) ? <Link className="warning-count" href={`/admin/${encodeURIComponent(space.slug)}/portfolio/${encodeURIComponent(portfolio.id)}#portfolio-warnings-title`} aria-label={`${warnings.get(portfolio.id)} waarschuwingen`}><TriangleAlert size={16} aria-hidden /><span>{warnings.get(portfolio.id)}</span></Link> : null}</td><td><Link className="icon-button gear-button" href={`/admin/${encodeURIComponent(space.slug)}/portfolio/${encodeURIComponent(portfolio.id)}`} aria-label={`${formatTerminologyLabel(space.collectionLabelSingular, "standalone")} beheren`} title={`${formatTerminologyLabel(space.collectionLabelSingular, "standalone")} beheren`}><Settings size={17} aria-hidden /></Link></td></tr>)}</tbody></table></div>
    </section>)}
  </main>;
}
