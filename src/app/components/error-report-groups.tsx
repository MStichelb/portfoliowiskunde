"use client";

import { Check, Pin, PinOff, RotateCcw, Search, Trash2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useMemo, useReducer } from "react";

import { deleteErrorReportAction, deleteOldDoneErrorThreadsAction, errorReportThreadPinAction, errorReportThreadStatusAction, toggleReportedExerciseVisibilityAction } from "@/app/admin/actions";
import { ConfirmActionButton } from "@/app/components/confirm-action-button";
import { ErrorReportNoteForm } from "@/app/components/error-report-note-form";
import { ErrorReportSortControls } from "@/app/components/error-report-sort-controls";
import { PublicationStatus } from "@/app/components/publication-status";
import {
  errorReportViewReducer,
  filterGroupedErrorReportThreads,
  groupedErrorReportThreadPortfolioFilterOptions,
  initialErrorReportViewState,
  openGroupedErrorReportThreadGroups,
  sortGroupedErrorReportThreads,
} from "@/lib/error-report-sort";
import type { ErrorReportDocumentKind, ErrorReportIssueDetail, ErrorReportThreadIssueDetail, GroupedErrorReportThread } from "@/lib/repositories";

export function GroupedErrorReportThreadInbox({ threads, issuesByThread, learningSpaceId, oldDoneCount, spaceSlug }: {
  threads: GroupedErrorReportThread[];
  issuesByThread: Record<string, ErrorReportThreadIssueDetail[]>;
  learningSpaceId: string;
  oldDoneCount: number;
  spaceSlug: string;
}) {
  const [state, dispatch] = useReducer(errorReportViewReducer, initialErrorReportViewState);
  const portfolios = useMemo(() => groupedErrorReportThreadPortfolioFilterOptions(threads), [threads]);
  const openGroups = useMemo(
    () => openGroupedErrorReportThreadGroups(threads, state.sortMode, state.selectedPortfolio),
    [threads, state.sortMode, state.selectedPortfolio],
  );
  const done = useMemo(
    () => sortGroupedErrorReportThreads(
      filterGroupedErrorReportThreads(threads, state.selectedPortfolio).filter((thread) => thread.status === "DONE"),
      state.sortMode,
    ),
    [threads, state.sortMode, state.selectedPortfolio],
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
    <GroupedErrorReportThreadGroup title="PINNED" threads={openGroups.pinned} issuesByThread={issuesByThread} spaceSlug={spaceSlug} />
    <GroupedErrorReportThreadGroup title="TO DO" threads={openGroups.todo} issuesByThread={issuesByThread} spaceSlug={spaceSlug} />
    <details className="report-group done-group">
      <summary><h2>DONE <span>{done.length}</span></h2></summary>
      {oldDoneCount > 0 ? <div className="done-group-actions"><ConfirmActionButton
        action={deleteOldDoneErrorThreadsAction}
        fields={{ learningSpaceId }}
        className="danger-button"
        label={<><Trash2 size={16} aria-hidden />Verwijder DONE ouder dan 2 weken</>}
        confirmTitle="Afgewerkte meldingen verwijderen"
        confirmText={`${oldDoneCount} ${oldDoneCount === 1 ? "afgewerkte thread wordt" : "afgewerkte threads worden"} permanent verwijderd, inclusief alle onderliggende meldingen.`}
      /></div> : null}
      <GroupedErrorReportThreadCards threads={done} issuesByThread={issuesByThread} spaceSlug={spaceSlug} />
    </details>
  </>;
}

function GroupedErrorReportThreadGroup({ title, threads, issuesByThread, spaceSlug }: {
  title: string;
  threads: GroupedErrorReportThread[];
  issuesByThread: Record<string, ErrorReportThreadIssueDetail[]>;
  spaceSlug: string;
}) {
  return <section className="report-group"><h2>{title} <span>{threads.length}</span></h2><GroupedErrorReportThreadCards threads={threads} issuesByThread={issuesByThread} spaceSlug={spaceSlug} /></section>;
}

export function GroupedErrorReportThreadCards({ threads, issuesByThread, spaceSlug }: {
  threads: GroupedErrorReportThread[];
  issuesByThread: Record<string, ErrorReportThreadIssueDetail[]>;
  spaceSlug: string;
}) {
  return threads.length === 0
    ? <p className="empty-state">Geen meldingen.</p>
    : <div className="report-card-list">{threads.map((thread) => <GroupedErrorReportThreadCard key={thread.id} thread={thread} issues={issuesByThread[thread.id] ?? []} spaceSlug={spaceSlug} />)}</div>;
}

export function errorReportDocumentLabel(kind: ErrorReportDocumentKind): string {
  if (kind === "assignment") return "Opgaven";
  if (kind === "final_solutions") return "Eindoplossingen";
  if (kind === "exercise_solution") return "Uitwerking";
  return "Hints";
}

export function errorReportLocationLabel(issue: Pick<ErrorReportThreadIssueDetail, "documentKind" | "variant">): string {
  if (issue.variant !== "alternative") return errorReportDocumentLabel(issue.documentKind);
  if (issue.documentKind === "exercise_solution") return "Alternatieve uitwerking";
  return `${errorReportDocumentLabel(issue.documentKind)} - Alternatieve uitwerking`;
}

function GroupedErrorReportThreadCard({ thread, issues, spaceSlug }: {
  thread: GroupedErrorReportThread;
  issues: ErrorReportThreadIssueDetail[];
  spaceSlug: string;
}) {
  const todo = thread.status === "TODO";
  const previewHref = thread.exerciseId
    ? `/admin/${encodeURIComponent(spaceSlug)}/oefening/${encodeURIComponent(thread.exerciseId)}`
    : null;
  const reportLabel = `${thread.reportCount} ${thread.reportCount === 1 ? "melding" : "meldingen"}`;
  const canToggleVisibility = thread.exerciseId !== null && thread.solutionStatus !== null && thread.solutionConfiguredVisible !== null;

  return <article className="report-card">
    <div className="report-card-heading">
      <div>
        <strong>Portfolio {thread.portfolioCode}: {thread.portfolioTitle}</strong>
        <span className="report-exercise-context">
          {thread.isMatchedExercise ? `${thread.sectionTitle} - ` : ""}Oefening {thread.exerciseCode}
          {!thread.isMatchedExercise ? <span className="report-unmatched-warning" title="Niet automatisch gekoppeld" aria-label="Niet automatisch gekoppeld" role="img"><TriangleAlert size={17} aria-hidden /></span> : null}
        </span>
      </div>
      <div className="report-actions">
        {previewHref ? <Link href={previewHref} className="icon-button" title="Oefening als admin bekijken" aria-label="Oefening als admin bekijken"><Search size={16} aria-hidden /></Link> : null}
        {canToggleVisibility ? <form action={toggleReportedExerciseVisibilityAction}>
          <input type="hidden" name="exerciseId" value={thread.exerciseId!} />
          <input type="hidden" name="portfolioId" value={thread.portfolioId} />
          <input type="hidden" name="visible" value={String(!thread.solutionConfiguredVisible)} />
          <button className="status-action" title="Zichtbaarheid wisselen" aria-label="Zichtbaarheid wisselen"><PublicationStatus status={thread.solutionStatus!} /></button>
        </form> : null}
        <form action={errorReportThreadPinAction}>
          <input type="hidden" name="threadId" value={thread.id} />
          <button className="icon-button" title={thread.pinned ? "Melding losmaken" : "Melding pinnen"} aria-label={thread.pinned ? "Melding losmaken" : "Melding pinnen"}>{thread.pinned ? <PinOff size={16} aria-hidden /> : <Pin size={16} aria-hidden />}</button>
        </form>
        <form action={errorReportThreadStatusAction}>
          <input type="hidden" name="threadId" value={thread.id} />
          <input type="hidden" name="status" value={todo ? "DONE" : "TODO"} />
          <button className="icon-button" title={todo ? "Markeren als afgewerkt" : "Terugzetten naar TO DO"} aria-label={todo ? "Markeren als afgewerkt" : "Terugzetten naar TO DO"}>{todo ? <Check size={16} aria-hidden /> : <RotateCcw size={16} aria-hidden />}</button>
        </form>
      </div>
    </div>
    <div className="report-location-summary" aria-label="Foutlocaties">
      {issues.map((issue) => <span key={issue.issueId} className="report-location-chip">
        {errorReportLocationLabel(issue)}{issues.length > 1 || issue.reportCount > 1 ? ` · ${issue.reportCount}` : ""}
      </span>)}
    </div>
    <div className="report-content">
      <ThreadReportDetails thread={thread} issues={issues} reportLabel={reportLabel} />
      <ErrorReportNoteForm threadId={thread.id} note={thread.adminNote} />
    </div>
  </article>;
}

function ThreadReportDetails({ thread, issues, reportLabel }: {
  thread: GroupedErrorReportThread;
  issues: ErrorReportThreadIssueDetail[];
  reportLabel: string;
}) {
  const activityDate = thread.latestReportAt ?? thread.updatedAt;
  return <details className="issue-report-details">
    <summary>{reportLabel} • laatste: {formatReportDate(activityDate)}{thread.status === "DONE" && thread.completedAt ? ` • afgewerkt: ${formatReportCompletionDate(thread.completedAt)}` : ""}</summary>
    <div className="issue-report-list">{issues.map((issue) => <section key={issue.issueId} className="issue-report-location">
      <h3>{errorReportLocationLabel(issue)}</h3>
      <div className="issue-report-stack">{issue.reports.map((report) => {
        const treated = isErrorReportTreated(thread, report);
        return <article key={report.id} className={`issue-report-item ${treated ? "is-treated" : "is-unhandled"}`} aria-label={treated ? "Eerder afgehandelde melding" : "Onbehandelde melding"}>
          <div className="issue-report-item-heading">
            <p className="report-message">{report.message}</p>
            <ConfirmActionButton
              action={deleteErrorReportAction}
              fields={{ id: report.id }}
              className="icon-button report-delete-button"
              label={<Trash2 size={15} aria-hidden />}
              confirmTitle="Melding verwijderen"
              confirmText={errorReportDeleteConfirmText(thread)}
            />
          </div>
          <p className="report-reporter">{report.reporterDisplayName ?? report.reporterName ?? "Onbekende melder"} · {formatReportDate(report.createdAt)}</p>
        </article>;
      })}</div>
    </section>)}</div>
  </details>;
}

export function isErrorReportTreated(
  thread: Pick<GroupedErrorReportThread, "status" | "completedAt">,
  report: Pick<ErrorReportIssueDetail, "createdAt">,
): boolean {
  if (thread.status === "DONE") return true;
  if (!thread.completedAt) return false;
  const completedAt = Date.parse(thread.completedAt);
  const createdAt = Date.parse(report.createdAt);
  return Number.isFinite(completedAt) && Number.isFinite(createdAt) && createdAt <= completedAt;
}

export function errorReportDeleteConfirmText(thread: Pick<GroupedErrorReportThread, "reportCount" | "adminNote">): string {
  if (thread.reportCount !== 1) return "Deze individuele melding wordt permanent verwijderd.";
  if (thread.adminNote.trim()) return "Deze individuele melding wordt permanent verwijderd. Dit is de laatste melding in de thread; ook de volledige thread en de bijbehorende adminnotitie verdwijnen permanent.";
  return "Deze individuele melding wordt permanent verwijderd. Omdat dit de laatste melding is, verdwijnt ook de lege thread.";
}

function formatReportDate(value: string) {
  return new Intl.DateTimeFormat("nl-BE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(value));
}

function formatReportCompletionDate(value: string) {
  return new Intl.DateTimeFormat("nl-BE", { dateStyle: "medium", timeZone: "Europe/Brussels" }).format(new Date(value));
}
