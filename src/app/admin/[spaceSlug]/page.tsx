import { Settings, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LearningSpaceNav } from "@/app/components/learning-space-nav";
import { PublicationStatus } from "@/app/components/publication-status";
import { SubmitButton } from "@/app/components/submit-button";
import { requireAdmin } from "@/lib/auth";
import { getActiveWarningCounts, getAdminPortfolios, getLatestSyncSummary, getLearningSpaceBySlug, getLearningSpaces, getOpenErrorReportCount, getThemes } from "@/lib/repositories";

import { syncSpaceAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function LearningSpaceAdminPage({ params }: { params: Promise<{ spaceSlug: string }> }) {
  await requireAdmin();
  const { spaceSlug } = await params;
  const space = await getLearningSpaceBySlug(spaceSlug);
  if (!space) notFound();
  const [spaces, portfolios, themes, warnings, reports, sync] = await Promise.all([getLearningSpaces(true), getAdminPortfolios(space.id), getThemes(space.id), getActiveWarningCounts(space.id), getOpenErrorReportCount(space.id), getLatestSyncSummary(space.id)]);
  const groups = [...themes.map((theme) => ({ id: theme.id, name: theme.name, portfolios: portfolios.filter((portfolio) => portfolio.themeId === theme.id) })), { id: "other", name: "Overige portfolio's", portfolios: portfolios.filter((portfolio) => !portfolio.themeId) }].filter((group) => group.portfolios.length > 0);
  return <main className="page-shell admin-page"><header className="admin-header"><div><p className="eyebrow">Beheer wiskunde</p><h1>{space.name}</h1><p className="file-reference">{sync ? `Laatste synchronisatie: ${new Intl.DateTimeFormat("nl-BE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(sync.finishedAt ?? sync.startedAt))}.` : "Nog niet gesynchroniseerd."}</p></div><div className="admin-actions"><Link className="secondary-button link-button notification-link" href={`/admin/${encodeURIComponent(space.slug)}/foutmeldingen`}>Foutmeldingen{reports > 0 && <span className="notification-badge">{reports}</span>}</Link><form action={syncSpaceAction}><input type="hidden" name="learningSpaceId" value={space.id} /><SubmitButton pendingLabel="Synchroniseren...">Nu synchroniseren</SubmitButton></form></div></header><LearningSpaceNav spaces={spaces} current={space} section="portfolios" />{groups.length === 0 ? <p className="empty-state">Nog geen portfolio&apos;s in deze leeromgeving. Configureer een bronmap en synchroniseer.</p> : groups.map((group) => <section className="theme-admin-group" key={group.id}><h2>{group.name}</h2><div className="admin-summary-table" role="region" aria-label={`${group.name} portfolio's`} tabIndex={0}><table><thead><tr><th>Nr</th><th>Titel</th><th>Status</th><th>Onderdelen</th><th>Oefeningen</th><th><span className="sr-only">Waarschuwingen</span></th><th><span className="sr-only">Beheren</span></th></tr></thead><tbody>{group.portfolios.map((portfolio) => <tr key={portfolio.id}><td><strong>{portfolio.code}</strong></td><td>{portfolio.title}</td><td><PublicationStatus status={portfolio.effectiveStatus} /></td><td>{portfolio.sections.length}</td><td>{portfolio.sections.reduce((sum, section) => sum + section.exercises.length, 0)}</td><td>{warnings.get(portfolio.id) ? <Link className="warning-count" href={`/admin/${encodeURIComponent(space.slug)}/portfolio/${encodeURIComponent(portfolio.id)}#portfolio-warnings-title`} aria-label={`${warnings.get(portfolio.id)} waarschuwingen`}><TriangleAlert size={16} aria-hidden /><span>{warnings.get(portfolio.id)}</span></Link> : null}</td><td><Link className="icon-button gear-button" href={`/admin/${encodeURIComponent(space.slug)}/portfolio/${encodeURIComponent(portfolio.id)}`} aria-label="Portfolio beheren" title="Portfolio beheren"><Settings size={17} aria-hidden /></Link></td></tr>)}</tbody></table></div></section>)}</main>;
}
