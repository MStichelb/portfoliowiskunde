import Link from "next/link";
import { notFound } from "next/navigation";

import { SubmitButton } from "@/app/components/submit-button";
import { requireAdmin } from "@/lib/auth";
import { formatBrusselsDateTimeInput } from "@/lib/publication";
import { getAdminPortfolio } from "@/lib/repositories";

import { ExerciseBulkTable } from "../../../components/exercise-bulk-table";
import { savePortfolioAction, saveSectionPublicationAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function PortfolioAdminPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const portfolio = await getAdminPortfolio(id);
  if (!portfolio) notFound();
  const assignmentUrl = portfolio.assignmentPdfPath ? `/api/admin/portfolio-assets/${encodeURIComponent(portfolio.id)}/assignment` : null;
  const finalSolutionsUrl = portfolio.finalSolutionsPdfPath ? `/api/admin/portfolio-assets/${encodeURIComponent(portfolio.id)}/final-solutions` : null;

  return <main className="page-shell admin-page">
    <Link href="/admin" className="back-link">Terug naar overzicht</Link>
    <header className="detail-header"><div><p className="eyebrow">Portfolio {portfolio.code}</p><h1>{portfolio.title}</h1><p className="file-reference">Gedetecteerde titel: {portfolio.detectedTitle}</p></div></header>

    <section className="admin-panel"><h2>Portfolio publiceren</h2>
      <form action={savePortfolioAction} className="publication-form"><input type="hidden" name="id" value={portfolio.id} />
        <label>Titel<input name="title" defaultValue={portfolio.title} maxLength={180} /></label>
        <label>Status<select name="mode" defaultValue={portfolio.visible ? "visible" : "hidden"}><option value="hidden">Verborgen</option><option value="visible">Zichtbaar</option></select></label>
        <label>Publiceren vanaf<input name="publishFrom" type="datetime-local" defaultValue={formatBrusselsDateTimeInput(portfolio.publishFrom)} /></label>
        <label>Verbergen na<input name="publishUntil" type="datetime-local" defaultValue={formatBrusselsDateTimeInput(portfolio.publishUntil)} /></label>
        <SubmitButton pendingLabel="Opslaan...">Portfolio opslaan</SubmitButton>
      </form>
      <div className="document-links"><strong>Documenten</strong>{assignmentUrl ? <a href={assignmentUrl} target="_blank" rel="noreferrer">Opgaven-PDF openen</a> : <span>Opgaven-PDF niet herkend</span>}{finalSolutionsUrl ? <a href={finalSolutionsUrl} target="_blank" rel="noreferrer">Eindoplossingen-PDF openen</a> : <span>Eindoplossingen-PDF niet herkend</span>}</div>
    </section>

    <section className="admin-panel"><h2>Onderdelen</h2>{portfolio.sections.map((section) => <form key={section.id} action={saveSectionPublicationAction} className="section-publication-form"><input type="hidden" name="id" value={section.id} /><input type="hidden" name="portfolioId" value={portfolio.id} />
      <strong>{section.order}. {section.title}</strong><label>Status<select name="mode" defaultValue={section.visibilityMode}><option value="inherit">Overnemen van portfolio</option><option value="hidden">Verborgen</option><option value="visible">Zichtbaar</option></select></label>
      <label>Vanaf<input name="publishFrom" type="datetime-local" defaultValue={formatBrusselsDateTimeInput(section.publishFrom)} /></label><label>Tot<input name="publishUntil" type="datetime-local" defaultValue={formatBrusselsDateTimeInput(section.publishUntil)} /></label><SubmitButton className="secondary-button" pendingLabel="Opslaan...">Opslaan</SubmitButton>
    </form>)}</section>

    <section className="admin-panel"><h2>Oefeningen</h2><p className="file-reference">Kies oefeningen, pas een status toe en gebruik een datum om ze in Europe/Brussels in te plannen. Alternatieven blijven onder dezelfde oefening gegroepeerd.</p>
      <ExerciseBulkTable portfolioId={portfolio.id} sections={portfolio.sections.map((section) => ({ id: section.id, title: section.title, order: section.order, exercises: section.exercises.map((exercise) => ({ id: exercise.id, code: exercise.code, status: exercise.effectivePublished ? "published" : exercise.visibilityMode === "inherit" ? "inherit" : exercise.visibilityMode, assets: exercise.assets.filter((asset) => asset.isIndexed).length, hasAlternative: exercise.assets.some((asset) => asset.variant === "alternative" && asset.isIndexed), isIndexed: exercise.isIndexed })) }))} />
    </section>
  </main>;
}
