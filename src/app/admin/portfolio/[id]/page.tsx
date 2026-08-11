import Link from "next/link";
import { notFound } from "next/navigation";

import { PortfolioPublicationForm } from "@/app/components/portfolio-publication-form";
import { PublicationStatus } from "@/app/components/publication-status";
import { SectionPublicationForm } from "@/app/components/section-publication-form";
import { requireAdmin } from "@/lib/auth";
import { formatBrusselsDateTimeInput } from "@/lib/publication";
import { getAdminPortfolio, getPortfolioWarnings } from "@/lib/repositories";

import { ExerciseBulkTable } from "../../../components/exercise-bulk-table";
import { savePortfolioAction, saveSectionPublicationAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function PortfolioAdminPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const [portfolio, warnings] = await Promise.all([getAdminPortfolio(id), getPortfolioWarnings(id)]);
  if (!portfolio) notFound();
  const assignmentUrl = portfolio.assignmentPdfPath ? `/api/admin/portfolio-assets/${encodeURIComponent(portfolio.id)}/assignment` : null;
  const finalSolutionsUrl = portfolio.finalSolutionsPdfPath ? `/api/admin/portfolio-assets/${encodeURIComponent(portfolio.id)}/final-solutions` : null;

  return <main className="page-shell portfolio-admin-page"><Link href="/admin" className="back-link">Terug naar overzicht</Link><header className="portfolio-detail-heading"><p className="eyebrow">Portfolio {portfolio.code}</p><h1>{portfolio.title}</h1><p className="file-reference">Gedetecteerde titel: {portfolio.detectedTitle}</p></header>
    <section className="admin-card" aria-labelledby="portfolio-settings-title"><div className="card-heading"><div><h2 id="portfolio-settings-title">Portfolio-instellingen</h2><p>Nieuwe portfolio&apos;s starten verborgen. Onderdelen en oefeningen hebben een eigen zichtbaarheid.</p></div><PublicationStatus status={portfolio.effectiveStatus} /></div><PortfolioPublicationForm id={portfolio.id} title={portfolio.title} visible={portfolio.visible} limited={portfolio.limited} publishFrom={formatBrusselsDateTimeInput(portfolio.publishFrom)} publishUntil={formatBrusselsDateTimeInput(portfolio.publishUntil)} action={savePortfolioAction} /></section>
    <section className="admin-card" aria-labelledby="documents-title"><div className="card-heading"><div><h2 id="documents-title">Documenten</h2><p>Herkenning uit de read-only bronmap.</p></div></div><div className="document-grid"><DocumentItem title="Opgaven-PDF" href={assignmentUrl} /><DocumentItem title="Eindoplossingen-PDF" href={finalSolutionsUrl} /></div></section>
    <section className="admin-card" aria-labelledby="sections-title"><div className="card-heading"><div><h2 id="sections-title">Onderdelen</h2><p>Een gepland onderdeel bewaart zijn tijden wanneer je tijdelijk een andere status kiest.</p></div></div><div className="section-card-list">{portfolio.sections.map((section) => <details className="section-settings-card" key={section.id}><summary className="section-card-title"><span><strong>{section.order}. {section.title}</strong><small>{section.exercises.length} oefeningen</small></span><PublicationStatus status={section.effectiveStatus} /></summary><SectionPublicationForm id={section.id} portfolioId={portfolio.id} visible={section.visibilityMode === "visible"} limited={section.limited} publishFrom={formatBrusselsDateTimeInput(section.publishFrom)} publishUntil={formatBrusselsDateTimeInput(section.publishUntil)} action={saveSectionPublicationAction} /></details>)}</div></section>
    <section className="admin-card exercises-card" aria-labelledby="exercises-title"><div className="card-heading"><div><h2 id="exercises-title">Oefeningen</h2><p>Alternatieven horen bij dezelfde oefening. Gebruik de directe knop voor een oefening of de bulkacties.</p></div></div><ExerciseBulkTable portfolioId={portfolio.id} sections={portfolio.sections.map((section) => ({ id: section.id, title: section.title, order: section.order, exercises: section.exercises.map((exercise) => ({ id: exercise.id, code: exercise.code, configuredVisible: exercise.visibilityMode === "visible", effectiveState: exercise.effectiveStatus.state, effectiveReason: exercise.effectiveStatus.reason, assets: exercise.assets.filter((asset) => asset.isIndexed).length, hasAlternative: exercise.assets.some((asset) => asset.variant === "alternative" && asset.isIndexed), isIndexed: exercise.isIndexed })) }))} /></section>
    <section className="admin-card portfolio-warnings" aria-labelledby="portfolio-warnings-title"><div className="card-heading"><div><h2 id="portfolio-warnings-title">Synchronisatiewaarschuwingen ({warnings.length})</h2><p>Alleen waarschuwingen die bij dit portfolio horen.</p></div></div>{warnings.length === 0 ? <p className="empty-state">Geen waarschuwingen in de laatste geslaagde synchronisatie.</p> : <ul>{warnings.map((warning, index) => <li key={`${warning.relativePath}-${index}`}><strong>{warning.severity === "warning" ? "Waarschuwing" : "Info"}:</strong> {warning.message}<span className="file-reference">{warning.relativePath}</span></li>)}</ul>}</section>
  </main>;
}

function DocumentItem({ title, href }: { title: string; href: string | null }) { return <div className="document-item"><div><strong>{title}</strong><span>{href ? "Herkend in de bronmap" : "Niet herkend"}</span></div>{href ? <a className="secondary-button" href={href} target="_blank" rel="noreferrer">Openen</a> : <span className="status-badge missing">Ontbreekt</span>}</div>; }
