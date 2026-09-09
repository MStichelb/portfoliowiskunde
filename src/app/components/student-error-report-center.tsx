import type { StudentErrorReport } from "@/lib/student-error-reports";

export function StudentErrorReportCenter({ reports }: { reports: StudentErrorReport[] }) {
  if (reports.length === 0) {
    return <p className="empty-state my-reports-empty">Je hebt momenteel geen openstaande of recent afgewerkte meldingen.</p>;
  }

  return <div className="my-reports-list">{reports.map((report) => {
    const handled = report.status === "HANDLED";
    return <article className="my-report-card" key={report.reportId}>
      <p className="my-report-space">{report.learningSpaceName} · Portfolio {report.portfolioCode}: {report.portfolioTitle}</p>
      <h2>Oefening {report.exerciseCode} · {report.locationLabel}</h2>
      <p className="my-report-message">{report.message}</p>
      <div className="my-report-status-row">
        <strong className={`my-report-status ${handled ? "is-handled" : "is-in-progress"}`}>{handled ? "Afgewerkt" : "In behandeling"}</strong>
        {handled
          ? report.effectiveHandledAt ? <span>{formatStudentReportDate(report.effectiveHandledAt)}</span> : null
          : <span>Gemeld: {formatStudentReportDate(report.createdAt)}</span>}
      </div>
      {handled && report.teacherResponse ? <div className="my-report-teacher-response">
        <strong>Reactie van je leraar</strong>
        <p>{report.teacherResponse}</p>
      </div> : null}
    </article>;
  })}</div>;
}

export function formatStudentReportDate(value: string): string {
  return new Intl.DateTimeFormat("nl-BE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Brussels",
  }).format(new Date(value));
}
