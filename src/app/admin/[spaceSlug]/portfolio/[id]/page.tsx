import { FileText } from "lucide-react";
import { notFound } from "next/navigation";

import { AdminSpaceHeader } from "@/app/components/admin-space-header";
import { ExerciseBulkTable } from "@/app/components/exercise-bulk-table";
import { PortfolioPublicationForm } from "@/app/components/portfolio-publication-form";
import { PublicationStatus } from "@/app/components/publication-status";
import { SectionPublicationForm } from "@/app/components/section-publication-form";
import { requireAdmin } from "@/lib/auth";
import { formatBrusselsDateTimeInput } from "@/lib/publication";
import { getAdminLearningSpaceBySlug, getAdminPortfolio, getPortfolioWarnings, getThemes } from "@/lib/repositories";

import { savePortfolioAction, saveSectionPublicationAction, setPortfolioThemeAction } from "../../../actions";

export const dynamic = "force-dynamic";

export default async function LearningSpacePortfolioAdminPage({ params }: { params: Promise<{ spaceSlug: string; id: string }> }) {
  await requireAdmin();
  const { spaceSlug, id } = await params;
  const space = await getAdminLearningSpaceBySlug(spaceSlug);
  if (!space) notFound();
  const [portfolio, warnings, themes] = await Promise.all([getAdminPortfolio(id, space.id), getPortfolioWarnings(id, space.id), getThemes(space.id)]);
  if (!portfolio) notFound();
  const assetBase = `/api/admin/portfolio-assets/${encodeURIComponent(portfolio.id)}`;

  return <main className="page-shell admin-page portfolio-admin-page">
    <AdminSpaceHeader current={space} section="portfolios" />
    <header className="portfolio-detail-heading"><p className="eyebrow">Portfolio {portfolio.code}</p><h2>{portfolio.title}</h2><p className="file-reference">Naam van de map: {portfolio.detectedTitle}</p></header>
    <section className="admin-card"><div className="card-heading"><h2>Portfolio-instellingen</h2><PublicationStatus status={portfolio.effectiveStatus} /></div><PortfolioPublicationForm id={portfolio.id} title={portfolio.title} cardColor={portfolio.cardColor} visible={portfolio.visible} limited={portfolio.limited} publishFrom={formatBrusselsDateTimeInput(portfolio.publishFrom)} publishUntil={formatBrusselsDateTimeInput(portfolio.publishUntil)} action={savePortfolioAction} /><form action={setPortfolioThemeAction} className="theme-assignment"><input type="hidden" name="id" value={portfolio.id} /><input type="hidden" name="learningSpaceId" value={space.id} /><label>Thema<select name="themeId" defaultValue={portfolio.themeId ?? ""}><option value="">Overige portfolio&apos;s</option>{themes.map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</select></label><button className="secondary-button">Thema opslaan</button></form></section>
    <section className="admin-card"><h2>Documenten</h2><div className="document-actions"><a className="document-button admin-document-button" href={`${assetBase}/assignment?space=${encodeURIComponent(space.slug)}`} target="_blank" rel="noreferrer"><FileText size={17} aria-hidden />Opgaven-PDF</a><a className="document-button admin-document-button" href={`${assetBase}/final-solutions?space=${encodeURIComponent(space.slug)}`} target="_blank" rel="noreferrer"><FileText size={17} aria-hidden />Eindoplossingen-PDF</a></div></section>
    <section className="admin-card"><h2>Onderdelen</h2><div className="section-card-list">{portfolio.sections.map((section) => <details className="section-settings-card" key={section.id}><summary className="section-card-title"><span><strong>{section.order}. {section.title}</strong><small>{section.exercises.length} oefeningen</small></span><PublicationStatus status={section.effectiveStatus} /></summary><SectionPublicationForm id={section.id} portfolioId={portfolio.id} visible={section.visibilityMode === "visible"} limited={section.limited} publishFrom={formatBrusselsDateTimeInput(section.publishFrom)} publishUntil={formatBrusselsDateTimeInput(section.publishUntil)} action={saveSectionPublicationAction} /></details>)}</div></section>
    <section className="admin-card exercises-card"><h2>Oefeningen</h2><ExerciseBulkTable portfolioId={portfolio.id} spaceSlug={space.slug} sections={portfolio.sections.map((section) => ({ id: section.id, title: section.title, order: section.order, exercises: section.exercises.map((exercise) => ({ id: exercise.id, code: exercise.code, configuredVisible: exercise.visibilityMode === "visible", status: exercise.effectiveStatus, standardAssets: exercise.standardAssets, alternativeAssets: exercise.alternativeAssets, missingAssets: exercise.missingAssets, showAlternativeToStudents: exercise.showAlternativeToStudents, isIndexed: exercise.isIndexed })) }))} /></section>
    <section className="admin-card portfolio-warnings" aria-labelledby="portfolio-warnings-title"><h2 id="portfolio-warnings-title">Synchronisatiewaarschuwingen ({warnings.length})</h2>{warnings.length === 0 ? <p className="empty-state">Geen waarschuwingen in de laatste geslaagde synchronisatie.</p> : <ul>{warnings.map((warning, index) => <li key={`${warning.relativePath}-${index}`}>{warning.message}<span className="file-reference">{warning.relativePath}</span></li>)}</ul>}</section>
  </main>;
}
