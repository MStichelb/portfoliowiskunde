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

  return <main className="page-shell portfolio-admin-page">
    <Link href="/admin" className="back-link">Terug naar overzicht</Link>
    <header className="portfolio-detail-heading"><p className="eyebrow">Portfolio {portfolio.code}</p><h1>{portfolio.title}</h1><p className="file-reference">Gedetecteerde titel: {portfolio.detectedTitle}</p></header>

    <section className="admin-card" aria-labelledby="portfolio-settings-title">
      <div className="card-heading"><div><h2 id="portfolio-settings-title">Portfolio-instellingen</h2><p>Portfolio&apos;s blijven standaard verborgen. Onderdelen en oefeningen nemen deze keuze standaard over.</p></div><EffectiveStatus visible={portfolio.effectivePublished} /></div>
      <form action={savePortfolioAction} className="portfolio-settings-form"><input type="hidden" name="id" value={portfolio.id} />
        <label className="field-wide">Titel<input name="title" defaultValue={portfolio.title} maxLength={180} /></label>
        <label>Status<select name="mode" defaultValue={portfolio.visible ? "visible" : "hidden"}><option value="hidden">Verborgen</option><option value="visible">Zichtbaar</option></select></label>
        <label>Publiceren vanaf<input name="publishFrom" type="datetime-local" defaultValue={formatBrusselsDateTimeInput(portfolio.publishFrom)} /></label>
        <label>Verbergen na<input name="publishUntil" type="datetime-local" defaultValue={formatBrusselsDateTimeInput(portfolio.publishUntil)} /></label>
        <div className="form-action-row"><SubmitButton pendingLabel="Opslaan...">Instellingen opslaan</SubmitButton></div>
      </form>
    </section>

    <section className="admin-card" aria-labelledby="documents-title">
      <div className="card-heading"><div><h2 id="documents-title">Documenten</h2><p>Herkenning uit de read-only bronmap.</p></div></div>
      <div className="document-grid"><DocumentItem title="Opgaven-PDF" href={assignmentUrl} /><DocumentItem title="Eindoplossingen-PDF" href={finalSolutionsUrl} /></div>
    </section>

    <section className="admin-card" aria-labelledby="sections-title">
      <div className="card-heading"><div><h2 id="sections-title">Onderdelen</h2><p>Alle onderdelen volgen standaard het portfolio. Geef alleen uitzonderingen een eigen status of planning.</p></div></div>
      <div className="section-card-list">{portfolio.sections.map((section) => <article className="section-settings-card" key={section.id}>
        <div className="section-card-title"><h3>{section.order}. {section.title}</h3><EffectiveStatus visible={section.effectivePublished} inherited={section.visibilityMode === "inherit"} /></div>
        <form action={saveSectionPublicationAction} className="section-settings-form"><input type="hidden" name="id" value={section.id} /><input type="hidden" name="portfolioId" value={portfolio.id} />
          <label>Status<select name="mode" defaultValue={section.visibilityMode}><option value="inherit">Overnemen van portfolio</option><option value="visible">Zichtbaar</option><option value="hidden">Verborgen</option></select></label>
          <label>Publiceren vanaf<input name="publishFrom" type="datetime-local" defaultValue={formatBrusselsDateTimeInput(section.publishFrom)} /></label>
          <label>Verbergen na<input name="publishUntil" type="datetime-local" defaultValue={formatBrusselsDateTimeInput(section.publishUntil)} /></label>
          <SubmitButton className="secondary-button" pendingLabel="Opslaan...">Opslaan</SubmitButton>
        </form>
      </article>)}</div>
    </section>

    <section className="admin-card exercises-card" aria-labelledby="exercises-title">
      <div className="card-heading"><div><h2 id="exercises-title">Oefeningen</h2><p>Alternatieven horen bij dezelfde oefening. De tabel volgt de volgorde van de onderdelen.</p></div></div>
      <ExerciseBulkTable portfolioId={portfolio.id} sections={portfolio.sections.map((section) => ({ id: section.id, title: section.title, order: section.order, exercises: section.exercises.map((exercise) => ({ id: exercise.id, code: exercise.code, status: exercise.effectivePublished ? "published" : exercise.visibilityMode === "inherit" ? "inherit" : exercise.visibilityMode, statusLabel: exercise.effectivePublished ? (exercise.visibilityMode === "inherit" ? "Overnemen · zichtbaar" : "Zichtbaar") : exercise.visibilityMode === "inherit" ? "Overnemen · verborgen" : "Verborgen", assets: exercise.assets.filter((asset) => asset.isIndexed).length, hasAlternative: exercise.assets.some((asset) => asset.variant === "alternative" && asset.isIndexed), isIndexed: exercise.isIndexed })) }))} />
    </section>
  </main>;
}

function DocumentItem({ title, href }: { title: string; href: string | null }) {
  return <div className="document-item"><div><strong>{title}</strong><span>{href ? "Herkend in de bronmap" : "Niet herkend"}</span></div>{href ? <a className="secondary-button" href={href} target="_blank" rel="noreferrer">Openen</a> : <span className="status-badge missing">Ontbreekt</span>}</div>;
}

function EffectiveStatus({ visible, inherited = false }: { visible: boolean; inherited?: boolean }) {
  return <span className={`status-badge ${visible ? "published" : "hidden"}`}>{inherited ? "Overnemen · " : ""}{visible ? "Zichtbaar" : "Verborgen"}</span>;
}
