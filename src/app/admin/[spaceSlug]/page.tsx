import { Settings, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminSpaceHeader } from "@/app/components/admin-space-header";
import { ConfirmActionButton } from "@/app/components/confirm-action-button";
import { PublicationStatus } from "@/app/components/publication-status";
import { requireAdminUser } from "@/lib/auth";
import { canManageLearningSpace } from "@/lib/authorization";
import { getActiveWarningCounts, getAdminLearningSpaceBySlug, getAdminPortfolios, getMissingIndexCounts, getThemes } from "@/lib/repositories";

import { archiveMissingIndexAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function LearningSpaceAdminPage({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const user = await requireAdminUser();
  const { spaceSlug } = await params;
  const space = await getAdminLearningSpaceBySlug(spaceSlug);
  if (!space || !await canManageLearningSpace(user, space.id)) notFound();
  const [portfolios, themes, warnings, missing] = await Promise.all([
    getAdminPortfolios(space.id), getThemes(space.id), getActiveWarningCounts(space.id), getMissingIndexCounts(space.id),
  ]);
  const groups = [
    ...themes.map((theme) => ({ id: theme.id, name: theme.name, portfolios: portfolios.filter((portfolio) => portfolio.themeId === theme.id) })),
    { id: "other", name: "Overige portfolio's", portfolios: portfolios.filter((portfolio) => !portfolio.themeId) },
  ].filter((group) => group.portfolios.length > 0);

  return <main className="page-shell admin-page admin-space-page">
    <AdminSpaceHeader current={space} section="portfolios" user={user} />
    {!space.isActive ? <p className="archived-message" role="status">Gearchiveerd. De laatst opgeslagen metadata blijft beschikbaar; synchronisatie is uitgeschakeld.</p> : null}
    {missing.exercises > 0 || missing.assets > 0 ? <div className="missing-index-action"><span>{missing.exercises} verdwenen oefeningen en {missing.assets} verdwenen bestanden wachten op opschoning.</span><ConfirmActionButton action={archiveMissingIndexAction} fields={{ learningSpaceId: space.id }} className="danger-button" label="Index opschonen" confirmTitle="Verdwenen items uit overzicht verwijderen" confirmText={`${missing.exercises} oefeningen en ${missing.assets} bestanden verdwijnen uit het actieve overzicht. Meldingen en notities blijven behouden; bronbestanden worden nooit gewijzigd.`} /></div> : null}
    {groups.length === 0 ? <p className="empty-state">Nog geen portfolio&apos;s in deze leeromgeving. Configureer een bronmap en synchroniseer.</p> : groups.map((group) => <section className="theme-admin-group" key={group.id}>
      <h2>{group.name}</h2>
      <div className="admin-summary-table" role="region" aria-label={`${group.name} portfolio's`} tabIndex={0}><table><thead><tr><th>Nr</th><th>Titel</th><th>Status</th><th>Onderdelen</th><th>Oefeningen</th><th>Waarschuwingen</th><th><span className="sr-only">Beheren</span></th></tr></thead><tbody>{group.portfolios.map((portfolio) => <tr key={portfolio.id}><td><strong>{portfolio.code}</strong></td><td>{portfolio.title}</td><td><PublicationStatus status={portfolio.effectiveStatus} /></td><td>{portfolio.sections.length}</td><td>{portfolio.sections.reduce((sum, section) => sum + section.exercises.length, 0)}</td><td>{warnings.get(portfolio.id) ? <Link className="warning-count" href={`/admin/${encodeURIComponent(space.slug)}/portfolio/${encodeURIComponent(portfolio.id)}#portfolio-warnings-title`} aria-label={`${warnings.get(portfolio.id)} waarschuwingen`}><TriangleAlert size={16} aria-hidden /><span>{warnings.get(portfolio.id)}</span></Link> : null}</td><td><Link className="icon-button gear-button" href={`/admin/${encodeURIComponent(space.slug)}/portfolio/${encodeURIComponent(portfolio.id)}`} aria-label="Portfolio beheren" title="Portfolio beheren"><Settings size={17} aria-hidden /></Link></td></tr>)}</tbody></table></div>
    </section>)}
  </main>;
}
