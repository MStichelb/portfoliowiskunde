import { notFound } from "next/navigation";

import { AdminSpaceHeader } from "@/app/components/admin-space-header";
import { ExerciseBulkTable } from "@/app/components/exercise-bulk-table";
import { PortfolioDocumentLinks } from "@/app/components/portfolio-document-links";
import { PortfolioPublicationForm } from "@/app/components/portfolio-publication-form";
import { PublicationStatus } from "@/app/components/publication-status";
import { SectionPublicationForm } from "@/app/components/section-publication-form";
import { requireAdminUser } from "@/lib/auth";
import { canManageLearningSpace } from "@/lib/authorization";
import { formatBrusselsDateTimeInput } from "@/lib/publication";
import { getAdminLearningSpaceBySlug, getAdminPortfolio, getPortfolioWarnings, getThemes } from "@/lib/repositories";

import { savePortfolioAction, saveSectionPublicationAction } from "../../../actions";

export const dynamic = "force-dynamic";

export default async function LearningSpacePortfolioAdminPage({ params }: { params: Promise<{ spaceSlug: string; id: string }> }) {
  const user = await requireAdminUser();
  const { spaceSlug, id } = await params;
  const space = await getAdminLearningSpaceBySlug(spaceSlug);
  if (!space || !await canManageLearningSpace(user, space.id)) notFound();
  const [portfolio, warnings, themes] = await Promise.all([getAdminPortfolio(id, space.id), getPortfolioWarnings(id, space.id), getThemes(space.id)]);
  if (!portfolio) notFound();
  return <main className="page-shell admin-page admin-space-page portfolio-admin-page">
    <AdminSpaceHeader current={space} section="portfolios" user={user} />
    <header className="portfolio-detail-heading"><p className="eyebrow">Portfolio {portfolio.code}</p><h2>{portfolio.title}</h2><p className="file-reference">Naam van de map: {portfolio.detectedTitle}</p></header>
    <section className="admin-card"><div className="card-heading"><h2>Portfolio-instellingen</h2><PublicationStatus status={portfolio.effectiveStatus} /></div><PortfolioPublicationForm id={portfolio.id} title={portfolio.title} cardColor={portfolio.cardColor} visible={portfolio.visible} limited={portfolio.limited} publishFrom={formatBrusselsDateTimeInput(portfolio.publishFrom)} publishUntil={formatBrusselsDateTimeInput(portfolio.publishUntil)} customText={portfolio.customText} customTextPosition={portfolio.customTextPosition} themeId={portfolio.themeId} themes={themes} action={savePortfolioAction} /></section>
    <section className="admin-card"><h2>Documenten</h2><PortfolioDocumentLinks portfolioId={portfolio.id} spaceSlug={space.slug} hasHints={Boolean(portfolio.hintsDocumentPath)} admin /></section>
    <section className="admin-card"><h2>Onderdelen</h2><div className="section-card-list">{portfolio.sections.map((section) => <details className="section-settings-card" key={section.id}><summary className="section-card-title"><span><strong>{section.order}. {section.title}</strong><small>{section.exercises.length} oefeningen</small></span><PublicationStatus status={section.effectiveStatus} /></summary><SectionPublicationForm id={section.id} portfolioId={portfolio.id} visible={section.visibilityMode === "visible"} limited={section.limited} publishFrom={formatBrusselsDateTimeInput(section.publishFrom)} publishUntil={formatBrusselsDateTimeInput(section.publishUntil)} action={saveSectionPublicationAction} /></details>)}</div></section>
    <section className="admin-card exercises-card"><h2>Oefeningen</h2><ExerciseBulkTable portfolioId={portfolio.id} spaceSlug={space.slug} sections={portfolio.sections.map((section) => ({ id: section.id, title: section.title, order: section.order, exercises: section.exercises.map((exercise) => ({ id: exercise.id, code: exercise.code, configuredVisible: exercise.visibilityMode === "visible", status: exercise.effectiveStatus, standardAssets: exercise.standardAssets, alternativeAssets: exercise.alternativeAssets, missingAssets: exercise.missingAssets, showAlternativeToStudents: exercise.showAlternativeToStudents, isIndexed: exercise.isIndexed, noteLabel: exercise.noteLabel, customNote: exercise.customNote, notePosition: exercise.notePosition })) }))} /></section>
    <section className="admin-card portfolio-warnings" aria-labelledby="portfolio-warnings-title"><h2 id="portfolio-warnings-title">Synchronisatiewaarschuwingen ({warnings.length})</h2>{warnings.length === 0 ? <p className="empty-state">Geen waarschuwingen in de laatste geslaagde synchronisatie.</p> : <ul>{warnings.map((warning, index) => <li key={`${warning.relativePath}-${index}`}>{warning.message}<span className="file-reference">{warning.relativePath}</span></li>)}</ul>}</section>
  </main>;
}
