import { Bug, Check, Pin, PinOff, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";

import { ConfirmActionButton } from "@/app/components/confirm-action-button";
import { PublicationStatus } from "@/app/components/publication-status";
import { SubmitButton } from "@/app/components/submit-button";
import { requireAdmin } from "@/lib/auth";
import { getAdminErrorReports, getOldDoneErrorReportCount, type AdminErrorReport } from "@/lib/repositories";

import { deleteErrorReportAction, deleteOldDoneErrorReportsAction, errorReportNoteAction, errorReportPinAction, errorReportStatusAction, toggleReportedExerciseVisibilityAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function ErrorReportsPage({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  await requireAdmin();
  const [{ sort }, reports, oldDoneCount] = await Promise.all([searchParams, getAdminErrorReports(), getOldDoneErrorReportCount()]);
  const order = sort === "portfolio" ? "portfolio" : "date";
  const pinned = sortReports(reports.filter((report) => report.status === "TODO" && report.pinned), order);
  const todo = sortReports(reports.filter((report) => report.status === "TODO" && !report.pinned), order);
  const done = reports.filter((report) => report.status === "DONE").sort((a, b) => Date.parse(b.completedAt ?? b.createdAt) - Date.parse(a.completedAt ?? a.createdAt));

  return <main className="page-shell admin-page reports-page">
    <Link href="/admin" className="back-link">Terug naar beheer</Link>
    <header className="portfolio-detail-heading">
      <p className="eyebrow">Beheer</p>
      <h1 className="heading-with-icon"><Bug size={24} aria-hidden />Foutmeldingen</h1>
      <div className="report-sort"><span>Sorteer open meldingen:</span><Link className={order === "date" ? "sort-active" : ""} href="/admin/meldingen">Datum</Link><Link className={order === "portfolio" ? "sort-active" : ""} href="/admin/meldingen?sort=portfolio">Portfolio</Link></div>
    </header>
    <ReportGroup title="PINNED" reports={pinned} />
    <ReportGroup title="TO DO" reports={todo} />
    <details className="report-group done-group">
      <summary><h2>DONE <span>{done.length}</span></h2></summary>
      <div className="done-group-actions">
        {oldDoneCount > 0 && <ConfirmActionButton action={deleteOldDoneErrorReportsAction} label={<><Trash2 size={16} aria-hidden />Verwijder ouder dan 2 weken</>} className="danger-button" confirmTitle="Afgewerkte meldingen verwijderen" confirmText={`${oldDoneCount} ${oldDoneCount === 1 ? "melding is" : "meldingen zijn"} langer dan twee weken geleden afgewerkt en wordt verwijderd.`} />}
      </div>
      {done.length === 0 ? <p className="empty-state">Geen meldingen.</p> : <div className="report-card-list">{done.map((report) => <ReportCard key={report.id} report={report} />)}</div>}
    </details>
  </main>;
}

function ReportGroup({ title, reports }: { title: string; reports: AdminErrorReport[] }) {
  return <section className="report-group" aria-labelledby={`reports-${title}`}><h2 id={`reports-${title}`}>{title} <span>{reports.length}</span></h2>{reports.length === 0 ? <p className="empty-state">Geen meldingen.</p> : <div className="report-card-list">{reports.map((report) => <ReportCard key={report.id} report={report} />)}</div>}</section>;
}

function ReportCard({ report }: { report: AdminErrorReport }) {
  const todo = report.status === "TODO";
  const variantLabel = report.variant === "alternative" ? "Alternatieve uitwerking" : "Uitwerking";
  return <article className="report-card">
    <div className="report-card-heading">
      <div><Link href={`/admin/portfolio/${encodeURIComponent(report.portfolioId)}#exercise-${encodeURIComponent(report.exerciseId)}`}><strong>Portfolio {report.portfolioCode}: {report.portfolioTitle}</strong></Link><span>{report.sectionTitle} - Oefening {report.exerciseCode} - {variantLabel}</span></div>
      <div className="report-actions">
        <form action={toggleReportedExerciseVisibilityAction}><input type="hidden" name="exerciseId" value={report.exerciseId} /><input type="hidden" name="portfolioId" value={report.portfolioId} /><input type="hidden" name="visible" value={String(!report.solutionConfiguredVisible)} /><button className="status-action" title={report.solutionConfiguredVisible ? "Oefening verbergen" : "Oefening zichtbaar maken"}><PublicationStatus status={report.solutionStatus} /></button></form>
        <form action={errorReportPinAction}><input type="hidden" name="id" value={report.id} /><button className="icon-button" title={report.pinned ? "Pin verwijderen" : "Melding pinnen"} aria-label={report.pinned ? "Pin verwijderen" : "Melding pinnen"}>{report.pinned ? <PinOff size={16} aria-hidden /> : <Pin size={16} aria-hidden />}</button></form>
        <form action={errorReportStatusAction}><input type="hidden" name="id" value={report.id} /><input type="hidden" name="status" value={todo ? "DONE" : "TODO"} /><button className="icon-button" title={todo ? "Markeer als DONE" : "Zet terug op TO DO"} aria-label={todo ? "Markeer als DONE" : "Zet terug op TO DO"}>{todo ? <Check size={16} aria-hidden /> : <RotateCcw size={16} aria-hidden />}</button></form>
        <ConfirmActionButton action={deleteErrorReportAction} fields={{ id: report.id }} label={<Trash2 size={16} aria-hidden />} confirmTitle="Foutmelding verwijderen" confirmText="Deze foutmelding wordt permanent verwijderd." />
      </div>
    </div>
    <div className="report-content"><div><p className="report-message">{report.message}</p><p className="file-reference">Gemeld op {formatDate(report.createdAt)}{report.completedAt ? ` - Afgewerkt op ${formatDate(report.completedAt)}` : ""}</p></div><form action={errorReportNoteAction} className="report-note"><input type="hidden" name="id" value={report.id} /><label>Adminnotitie<textarea name="note" defaultValue={report.adminNote} maxLength={4000} /></label><SubmitButton className="secondary-button" pendingLabel="Opslaan...">Notitie opslaan</SubmitButton></form></div>
  </article>;
}

function sortReports(reports: AdminErrorReport[], order: "date" | "portfolio") {
  return [...reports].sort((a, b) => order === "date" ? Date.parse(b.createdAt) - Date.parse(a.createdAt) : a.portfolioCode.localeCompare(b.portfolioCode, "nl", { numeric: true }) || a.exerciseCode.localeCompare(b.exerciseCode, "nl", { numeric: true }) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-BE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(value));
}
