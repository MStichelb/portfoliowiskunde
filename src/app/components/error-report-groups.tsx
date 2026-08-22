"use client";

import { Check, Pin, PinOff, RotateCcw, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useReducer } from "react";

import { deleteErrorReportAction, errorReportPinAction, errorReportStatusAction, toggleReportedExerciseVisibilityAction } from "@/app/admin/actions";
import { ConfirmActionButton } from "@/app/components/confirm-action-button";
import { ErrorReportNoteForm } from "@/app/components/error-report-note-form";
import { ErrorReportSortControls } from "@/app/components/error-report-sort-controls";
import { PublicationStatus } from "@/app/components/publication-status";
import { errorReportViewReducer, initialErrorReportViewState, openErrorReportGroups, portfolioFilterOptions } from "@/lib/error-report-sort";
import type { AdminErrorReport } from "@/lib/repositories";

export function ErrorReportOpenGroups({ reports, spaceSlug, learningSpaceId }: { reports: AdminErrorReport[]; spaceSlug: string; learningSpaceId: string }) {
  const [state, dispatch] = useReducer(errorReportViewReducer, initialErrorReportViewState);
  const portfolios = useMemo(() => portfolioFilterOptions(reports), [reports]);
  const groups = useMemo(
    () => openErrorReportGroups(reports, state.sortMode, state.selectedPortfolio),
    [reports, state.sortMode, state.selectedPortfolio],
  );

  return <>
    <ErrorReportSortControls
      sort={state.sortMode}
      selectedPortfolio={state.selectedPortfolio}
      portfolios={portfolios}
      onSort={(sortMode) => dispatch({ type: "sort", sortMode })}
      onPortfolioChange={(portfolioId) => dispatch({ type: "filter", portfolioId })}
      onReset={() => dispatch({ type: "reset-filter" })}
    />
    <ErrorReportGroup title="PINNED" reports={groups.pinned} spaceSlug={spaceSlug} learningSpaceId={learningSpaceId} />
    <ErrorReportGroup title="TO DO" reports={groups.todo} spaceSlug={spaceSlug} learningSpaceId={learningSpaceId} />
  </>;
}

function ErrorReportGroup({ title, reports, spaceSlug, learningSpaceId }: { title: string; reports: AdminErrorReport[]; spaceSlug: string; learningSpaceId: string }) {
  return <section className="report-group"><h2>{title} <span>{reports.length}</span></h2><ErrorReportCards reports={reports} spaceSlug={spaceSlug} learningSpaceId={learningSpaceId} /></section>;
}

export function ErrorReportCards({ reports, spaceSlug, learningSpaceId }: { reports: AdminErrorReport[]; spaceSlug: string; learningSpaceId: string }) {
  return reports.length === 0 ? <p className="empty-state">Geen meldingen.</p> : <div className="report-card-list">{reports.map((report) => <ErrorReportCard key={report.id} report={report} spaceSlug={spaceSlug} learningSpaceId={learningSpaceId} />)}</div>;
}

function formatReportDate(value: string) {
  return new Intl.DateTimeFormat("nl-BE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(value));
}

function ErrorReportCard({ report, spaceSlug, learningSpaceId }: { report: AdminErrorReport; spaceSlug: string; learningSpaceId: string }) {
  const todo = report.status === "TODO";
  const label = report.variant === "alternative" ? "Alternatieve uitwerking" : "Uitwerking";
  const previewHref = `/admin/${encodeURIComponent(spaceSlug)}/oefening/${encodeURIComponent(report.exerciseId)}`;
  return <article className="report-card">
    <div className="report-card-heading"><div><strong>Portfolio {report.portfolioCode}: {report.portfolioTitle}</strong><span>{report.sectionTitle} - Oefening {report.exerciseCode} - {label}</span></div><div className="report-actions">
      <form action={toggleReportedExerciseVisibilityAction}><input type="hidden" name="exerciseId" value={report.exerciseId} /><input type="hidden" name="portfolioId" value={report.portfolioId} /><input type="hidden" name="visible" value={String(!report.solutionConfiguredVisible)} /><button className="status-action" title="Zichtbaarheid wisselen"><PublicationStatus status={report.solutionStatus} /></button></form>
      <Link href={previewHref} className="icon-button" title="Uitwerking als admin bekijken" aria-label="Uitwerking als admin bekijken"><Search size={16} /></Link>
      <form action={errorReportPinAction}><input type="hidden" name="id" value={report.id} /><button className="icon-button" title="Melding pinnen" aria-label="Melding pinnen">{report.pinned ? <PinOff size={16} /> : <Pin size={16} />}</button></form>
      <form action={errorReportStatusAction}><input type="hidden" name="id" value={report.id} /><input type="hidden" name="status" value={todo ? "DONE" : "TODO"} /><button className="icon-button" title="Status wisselen" aria-label="Status wisselen">{todo ? <Check size={16} /> : <RotateCcw size={16} />}</button></form>
      <ConfirmActionButton action={deleteErrorReportAction} fields={{ id: report.id }} label={<Trash2 size={16} />} confirmTitle="Foutmelding verwijderen" confirmText="Deze foutmelding wordt permanent verwijderd." />
    </div></div>
    <div className="report-content"><div><p className="report-message">{report.message}</p>{report.reporterName ? <p className="report-reporter">Gemeld door: {report.reporterName}</p> : null}<p className="report-date">Gemeld op {formatReportDate(report.createdAt)}</p>{report.status === "DONE" && report.completedAt ? <p className="report-date">Afgewerkt op {formatReportDate(report.completedAt)}</p> : null}</div><ErrorReportNoteForm reportId={report.id} learningSpaceId={learningSpaceId} note={report.adminNote} /></div>
  </article>;
}
