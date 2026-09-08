"use client";

import { Check, Pin, PinOff, RotateCcw, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useReducer } from "react";

import { errorReportIssuePinAction, errorReportIssueStatusAction, toggleReportedExerciseVisibilityAction } from "@/app/admin/actions";
import { ErrorReportNoteForm } from "@/app/components/error-report-note-form";
import { ErrorReportSortControls } from "@/app/components/error-report-sort-controls";
import { PublicationStatus } from "@/app/components/publication-status";
import {
  errorReportViewReducer,
  filterGroupedErrorReportIssues,
  groupedErrorReportPortfolioFilterOptions,
  initialErrorReportViewState,
  openGroupedErrorReportIssueGroups,
  sortGroupedErrorReportIssues,
} from "@/lib/error-report-sort";
import type { ErrorReportDocumentKind, ErrorReportIssueDetail, GroupedErrorReportIssue } from "@/lib/repositories";

export function GroupedErrorReportInbox({ issues, reportsByIssue, spaceSlug }: {
  issues: GroupedErrorReportIssue[];
  reportsByIssue: Record<string, ErrorReportIssueDetail[]>;
  spaceSlug: string;
}) {
  const [state, dispatch] = useReducer(errorReportViewReducer, initialErrorReportViewState);
  const portfolios = useMemo(() => groupedErrorReportPortfolioFilterOptions(issues), [issues]);
  const openGroups = useMemo(
    () => openGroupedErrorReportIssueGroups(issues, state.sortMode, state.selectedPortfolio),
    [issues, state.sortMode, state.selectedPortfolio],
  );
  const done = useMemo(
    () => sortGroupedErrorReportIssues(
      filterGroupedErrorReportIssues(issues, state.selectedPortfolio).filter((issue) => issue.status === "DONE"),
      state.sortMode,
    ),
    [issues, state.sortMode, state.selectedPortfolio],
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
    <GroupedErrorReportGroup title="PINNED" issues={openGroups.pinned} reportsByIssue={reportsByIssue} spaceSlug={spaceSlug} />
    <GroupedErrorReportGroup title="TO DO" issues={openGroups.todo} reportsByIssue={reportsByIssue} spaceSlug={spaceSlug} />
    <details className="report-group done-group">
      <summary><h2>DONE <span>{done.length}</span></h2></summary>
      <GroupedErrorReportCards issues={done} reportsByIssue={reportsByIssue} spaceSlug={spaceSlug} />
    </details>
  </>;
}

function GroupedErrorReportGroup({ title, issues, reportsByIssue, spaceSlug }: {
  title: string;
  issues: GroupedErrorReportIssue[];
  reportsByIssue: Record<string, ErrorReportIssueDetail[]>;
  spaceSlug: string;
}) {
  return <section className="report-group"><h2>{title} <span>{issues.length}</span></h2><GroupedErrorReportCards issues={issues} reportsByIssue={reportsByIssue} spaceSlug={spaceSlug} /></section>;
}

export function GroupedErrorReportCards({ issues, reportsByIssue, spaceSlug }: {
  issues: GroupedErrorReportIssue[];
  reportsByIssue: Record<string, ErrorReportIssueDetail[]>;
  spaceSlug: string;
}) {
  return issues.length === 0
    ? <p className="empty-state">Geen meldingen.</p>
    : <div className="report-card-list">{issues.map((issue) => <GroupedErrorReportCard key={issue.id} issue={issue} reports={reportsByIssue[issue.id] ?? []} spaceSlug={spaceSlug} />)}</div>;
}

export function errorReportDocumentLabel(kind: ErrorReportDocumentKind): string {
  if (kind === "assignment") return "Opgaven";
  if (kind === "hints") return "Hints";
  return "Eindoplossingen";
}

function GroupedErrorReportCard({ issue, reports, spaceSlug }: {
  issue: GroupedErrorReportIssue;
  reports: ErrorReportIssueDetail[];
  spaceSlug: string;
}) {
  const todo = issue.status === "TODO";
  const canOpenExercise = issue.documentKind === "final_solutions" && issue.exerciseId !== null;
  const previewHref = canOpenExercise ? `/admin/${encodeURIComponent(spaceSlug)}/oefening/${encodeURIComponent(issue.exerciseId!)}` : null;
  const description = [
    issue.isMatchedExercise ? issue.sectionTitle : null,
    errorReportDocumentLabel(issue.documentKind),
    `Oefening ${issue.exerciseCode}`,
    issue.variant === "alternative" ? "Alternatieve uitwerking" : null,
  ].filter(Boolean).join(" - ");
  const reportLabel = `${issue.reportCount} ${issue.reportCount === 1 ? "melding" : "meldingen"}`;
  const activityDate = issue.latestReportAt ?? issue.updatedAt;

  return <article className="report-card">
    <div className="report-card-heading">
      <div>
        <strong>Portfolio {issue.portfolioCode}: {issue.portfolioTitle}</strong>
        <span>{description}</span>
        {!issue.isMatchedExercise ? <span className="report-unmatched">Niet automatisch gekoppeld</span> : null}
      </div>
      <div className="report-actions">
        {canOpenExercise && issue.solutionStatus && issue.solutionConfiguredVisible !== null ? <form action={toggleReportedExerciseVisibilityAction}>
          <input type="hidden" name="exerciseId" value={issue.exerciseId!} />
          <input type="hidden" name="portfolioId" value={issue.portfolioId} />
          <input type="hidden" name="visible" value={String(!issue.solutionConfiguredVisible)} />
          <button className="status-action" title="Zichtbaarheid wisselen" aria-label="Zichtbaarheid wisselen"><PublicationStatus status={issue.solutionStatus} /></button>
        </form> : null}
        {previewHref ? <Link href={previewHref} className="icon-button" title="Uitwerking als admin bekijken" aria-label="Uitwerking als admin bekijken"><Search size={16} aria-hidden /></Link> : null}
        <form action={errorReportIssuePinAction}>
          <input type="hidden" name="issueId" value={issue.id} />
          <button className="icon-button" title={issue.pinned ? "Melding losmaken" : "Melding pinnen"} aria-label={issue.pinned ? "Melding losmaken" : "Melding pinnen"}>{issue.pinned ? <PinOff size={16} aria-hidden /> : <Pin size={16} aria-hidden />}</button>
        </form>
        <form action={errorReportIssueStatusAction}>
          <input type="hidden" name="issueId" value={issue.id} />
          <input type="hidden" name="status" value={todo ? "DONE" : "TODO"} />
          <button className="icon-button" title={todo ? "Markeren als afgewerkt" : "Terugzetten naar TO DO"} aria-label={todo ? "Markeren als afgewerkt" : "Terugzetten naar TO DO"}>{todo ? <Check size={16} aria-hidden /> : <RotateCcw size={16} aria-hidden />}</button>
        </form>
      </div>
    </div>
    <div className="report-issue-summary">
      <strong>{reportLabel}</strong>
      <span>Laatste melding: {formatReportDate(activityDate)}</span>
      <span>Status: {todo ? "TO DO" : "DONE"}</span>
    </div>
    <div className="report-content">
      <IssueReportDetails reports={reports} reportLabel={reportLabel} />
      <ErrorReportNoteForm issueId={issue.id} note={issue.adminNote} />
    </div>
  </article>;
}

function IssueReportDetails({ reports, reportLabel }: { reports: ErrorReportIssueDetail[]; reportLabel: string }) {
  return <details className="issue-report-details">
    <summary>Bekijk {reportLabel}</summary>
    <div className="issue-report-list">{reports.map((report) => <article key={report.id} className="issue-report-item">
      <p className="report-message">{report.message}</p>
      <p className="report-reporter">Gemeld door: {report.reporterDisplayName ?? report.reporterName ?? "Onbekende melder"}</p>
      <p className="report-date">Gemeld op {formatReportDate(report.createdAt)}</p>
    </article>)}</div>
  </details>;
}

function formatReportDate(value: string) {
  return new Intl.DateTimeFormat("nl-BE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(value));
}
