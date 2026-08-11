import { Check, Eye, EyeOff, Pin, PinOff, RotateCcw } from "lucide-react";
import Link from "next/link";

import { SubmitButton } from "@/app/components/submit-button";
import { requireAdmin } from "@/lib/auth";
import { getAdminErrorReports, type AdminErrorReport } from "@/lib/repositories";

import { errorReportNoteAction, errorReportPinAction, errorReportStatusAction, hideReportedExerciseAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function ErrorReportsPage({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  await requireAdmin();
  const [{ sort }, reports] = await Promise.all([searchParams, getAdminErrorReports()]);
  const order = sort === "portfolio" ? "portfolio" : "date";
  const pinned = sortReports(reports.filter((report) => report.status === "TODO" && report.pinned), order);
  const todo = sortReports(reports.filter((report) => report.status === "TODO" && !report.pinned), order);
  const done = reports.filter((report) => report.status === "DONE").sort((a, b) => Date.parse(b.completedAt ?? b.createdAt) - Date.parse(a.completedAt ?? a.createdAt));

  return <main className="page-shell admin-page reports-page">
    <Link href="/admin" className="back-link">Terug naar beheer</Link>
    <header className="portfolio-detail-heading"><p className="eyebrow">Beheer</p><h1>Foutmeldingen</h1><div className="report-sort"><span>Sorteer open meldingen:</span><Link className={order === "date" ? "sort-active" : ""} href="/admin/meldingen">Datum</Link><Link className={order === "portfolio" ? "sort-active" : ""} href="/admin/meldingen?sort=portfolio">Portfolio</Link></div></header>
    <ReportGroup title="PINNED" reports={pinned} />
    <ReportGroup title="TO DO" reports={todo} />
    <ReportGroup title="DONE" reports={done} />
  </main>;
}

function ReportGroup({ title, reports }: { title: string; reports: AdminErrorReport[] }) {
  return <section className="report-group" aria-labelledby={`reports-${title}`}>
    <h2 id={`reports-${title}`}>{title} <span>{reports.length}</span></h2>
    {reports.length === 0 ? <p className="empty-state">Geen meldingen.</p> : <div className="report-card-list">{reports.map((report) => <ReportCard key={report.id} report={report} />)}</div>}
  </section>;
}

function ReportCard({ report }: { report: AdminErrorReport }) {
  const statusLabel = report.status === "TODO" ? "Markeer als DONE" : "Zet terug op TO DO";
  return <article className="report-card">
    <div className="report-card-heading"><div><Link href={`/admin/portfolio/${encodeURIComponent(report.portfolioId)}#exercise-${encodeURIComponent(report.exerciseId)}`}><strong>Portfolio {report.portfolioCode}: {report.portfolioTitle}</strong></Link><span>{report.sectionTitle} - Oefening {report.exerciseCode} - {report.variant}</span></div><div className="report-actions"><form action={errorReportPinAction}><input type="hidden" name="id" value={report.id} /><button className="icon-button" title={report.pinned ? "Pin verwijderen" : "Melding pinnen"} aria-label={report.pinned ? "Pin verwijderen" : "Melding pinnen"}>{report.pinned ? <PinOff size={16} aria-hidden /> : <Pin size={16} aria-hidden />}</button></form><span className={`status-badge ${report.solutionVisible ? "published" : "hidden"}`} title={report.solutionVisible ? "Oplossing is zichtbaar" : "Oplossing is verborgen"}>{report.solutionVisible ? <Eye size={15} aria-hidden /> : <EyeOff size={15} aria-hidden />}{report.solutionVisible ? "Zichtbaar" : "Verborgen"}</span></div></div>
    <p className="report-message">{report.message}</p><p className="file-reference">Gemeld op {formatDate(report.createdAt)}{report.completedAt ? ` - Afgewerkt op ${formatDate(report.completedAt)}` : ""}</p>
    <form action={errorReportNoteAction} className="report-note"><input type="hidden" name="id" value={report.id} /><label>Adminnotitie<textarea name="note" defaultValue={report.adminNote} maxLength={4000} /></label><SubmitButton className="secondary-button" pendingLabel="Opslaan...">Notitie opslaan</SubmitButton></form>
    <div className="report-footer"><form action={errorReportStatusAction}><input type="hidden" name="id" value={report.id} /><input type="hidden" name="status" value={report.status === "TODO" ? "DONE" : "TODO"} /><SubmitButton className={report.status === "TODO" ? "primary-button" : "secondary-button"} pendingLabel="...">{report.status === "TODO" ? <><Check size={16} aria-hidden />{statusLabel}</> : <><RotateCcw size={16} aria-hidden />{statusLabel}</>}</SubmitButton></form>{report.solutionVisible && <form action={hideReportedExerciseAction}><input type="hidden" name="exerciseId" value={report.exerciseId} /><input type="hidden" name="portfolioId" value={report.portfolioId} /><SubmitButton className="secondary-button" pendingLabel="Verbergen...">Oplossing verbergen</SubmitButton></form>}</div>
  </article>;
}

function sortReports(reports: AdminErrorReport[], order: "date" | "portfolio") {
  return [...reports].sort((a, b) => order === "date" ? Date.parse(b.createdAt) - Date.parse(a.createdAt) : a.portfolioCode.localeCompare(b.portfolioCode, "nl", { numeric: true }) || a.exerciseCode.localeCompare(b.exerciseCode, "nl", { numeric: true }) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-BE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(value));
}
