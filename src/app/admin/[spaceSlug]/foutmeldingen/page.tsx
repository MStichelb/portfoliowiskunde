import { Check, Pin, PinOff, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ConfirmActionButton } from "@/app/components/confirm-action-button";
import { LearningSpaceNav } from "@/app/components/learning-space-nav";
import { PublicationStatus } from "@/app/components/publication-status";
import { requireAdmin } from "@/lib/auth";
import { getAdminErrorReports, getLearningSpaceBySlug, getLearningSpaces, getOldDoneErrorReportCount, type AdminErrorReport } from "@/lib/repositories";

import { deleteErrorReportAction, deleteOldDoneErrorReportsAction, errorReportPinAction, errorReportStatusAction, toggleReportedExerciseVisibilityAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function SpaceReportsPage({ params }: { params: Promise<{ spaceSlug: string }> }) {
  await requireAdmin();
  const { spaceSlug } = await params;
  const space = await getLearningSpaceBySlug(spaceSlug);
  if (!space) notFound();
  const [spaces, reports, oldDone] = await Promise.all([getLearningSpaces(true), getAdminErrorReports(space.id), getOldDoneErrorReportCount(undefined, space.id)]);
  const pinned = reports.filter((report) => report.status === "TODO" && report.pinned);
  const todo = reports.filter((report) => report.status === "TODO" && !report.pinned);
  const done = reports.filter((report) => report.status === "DONE");
  return <main className="page-shell admin-page reports-page"><Link href={`/admin/${encodeURIComponent(space.slug)}`} className="back-link">Terug naar portfolio&apos;s</Link><LearningSpaceNav spaces={spaces} current={space} section="reports" /><h1>Foutmeldingen</h1><Group title="PINNED" reports={pinned} spaceSlug={space.slug} /><Group title="TO DO" reports={todo} spaceSlug={space.slug} /><details className="report-group done-group"><summary><h2>DONE <span>{done.length}</span></h2></summary>{oldDone > 0 && <div className="done-group-actions"><ConfirmActionButton action={deleteOldDoneErrorReportsAction} fields={{ learningSpaceId: space.id }} className="danger-button" label={<><Trash2 size={16} aria-hidden />Verwijder ouder dan 2 weken</>} confirmTitle="Afgewerkte meldingen verwijderen" confirmText={`${oldDone} meldingen worden verwijderd.`} /></div>}<Cards reports={done} spaceSlug={space.slug} /></details></main>;
}

function Group({ title, reports, spaceSlug }: { title: string; reports: AdminErrorReport[]; spaceSlug: string }) { return <section className="report-group"><h2>{title} <span>{reports.length}</span></h2><Cards reports={reports} spaceSlug={spaceSlug} /></section>; }
function Cards({ reports, spaceSlug }: { reports: AdminErrorReport[]; spaceSlug: string }) { return reports.length === 0 ? <p className="empty-state">Geen meldingen.</p> : <div className="report-card-list">{reports.map((report) => <Card key={report.id} report={report} spaceSlug={spaceSlug} />)}</div>; }
function Card({ report, spaceSlug }: { report: AdminErrorReport; spaceSlug: string }) { const todo = report.status === "TODO"; const label = report.variant === "alternative" ? "Alternatieve uitwerking" : "Uitwerking"; return <article className="report-card"><div className="report-card-heading"><div><strong>Portfolio {report.portfolioCode}: {report.portfolioTitle}</strong><span>{report.sectionTitle} - Oefening {report.exerciseCode} - {label}</span><Link className="exercise-admin-link" href={`/admin/${encodeURIComponent(spaceSlug)}/oefening/${encodeURIComponent(report.exerciseId)}`}>Adminpreview openen</Link></div><div className="report-actions"><form action={toggleReportedExerciseVisibilityAction}><input type="hidden" name="exerciseId" value={report.exerciseId} /><input type="hidden" name="portfolioId" value={report.portfolioId} /><input type="hidden" name="visible" value={String(!report.solutionConfiguredVisible)} /><button className="status-action" title="Zichtbaarheid wisselen"><PublicationStatus status={report.solutionStatus} /></button></form><form action={errorReportPinAction}><input type="hidden" name="id" value={report.id} /><button className="icon-button" title="Melding pinnen">{report.pinned ? <PinOff size={16} /> : <Pin size={16} />}</button></form><form action={errorReportStatusAction}><input type="hidden" name="id" value={report.id} /><input type="hidden" name="status" value={todo ? "DONE" : "TODO"} /><button className="icon-button" title="Status wisselen">{todo ? <Check size={16} /> : <RotateCcw size={16} />}</button></form><ConfirmActionButton action={deleteErrorReportAction} fields={{ id: report.id }} label={<Trash2 size={16} />} confirmTitle="Foutmelding verwijderen" confirmText="Deze foutmelding wordt permanent verwijderd." /></div></div><p className="report-message">{report.message}</p></article>; }
