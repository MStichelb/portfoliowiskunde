import "server-only";

import { requireAuthenticatedUser } from "@/lib/auth";
import { getAccessibleLearningSpaceIds } from "@/lib/authorization";
import { getDatabase, type DatabaseRow } from "@/lib/database";
import { isPortfolioPublished } from "@/lib/publication";
import type { ErrorReportDocumentKind } from "@/lib/repositories";

export const HANDLED_ERROR_REPORT_VISIBILITY_DAYS = 14;

export type StudentErrorReportStatus = "IN_PROGRESS" | "HANDLED";

export interface StudentErrorReport {
  reportId: string;
  createdAt: string;
  handledAt: string | null;
  teacherResponse: string | null;
  message: string;
  status: StudentErrorReportStatus;
  exerciseCode: string;
  isMatchedExercise: boolean;
  portfolioCode: string;
  portfolioTitle: string;
  learningSpaceName: string;
  locationLabel: string;
}

export interface StudentHandledReportNotification {
  reportIds: string[];
  count: number;
  exerciseCode: string | null;
  singleLearningSpaceId: string | null;
}

interface CurrentStudentErrorReportContext {
  userId: string;
  accessibleLearningSpaceIds: string[];
  reports: CurrentStudentErrorReport[];
}

interface CurrentStudentErrorReport {
  report: StudentErrorReport;
  studentDismissedAt: string | null;
}

export async function getMyErrorReports(now = new Date()): Promise<StudentErrorReport[] | null> {
  const context = await getCurrentStudentErrorReportContext(now);
  if (!context) return null;
  return context.reports.map(({ report }) => report);
}

export async function listPendingHandledReportNotificationsForCurrentUser(now = new Date()): Promise<StudentHandledReportNotification | null> {
  const context = await getCurrentStudentErrorReportContext(now);
  if (!context) return null;
  const reports = context.reports.filter(({ report, studentDismissedAt }) => report.handledAt !== null && studentDismissedAt === null);
  if (reports.length === 0) return null;
  return {
    reportIds: reports.map(({ report }) => report.reportId),
    count: reports.length,
    exerciseCode: reports.length === 1 && reports[0].report.isMatchedExercise ? reports[0].report.exerciseCode : null,
    singleLearningSpaceId: context.accessibleLearningSpaceIds.length === 1 ? context.accessibleLearningSpaceIds[0] : null,
  };
}

export async function dismissPendingHandledReportNotificationsForCurrentUser(candidateReportIds: unknown[], now = new Date()): Promise<number> {
  const requestedIds = [...new Set(candidateReportIds
    .filter((value): value is string => typeof value === "string" && value.length > 0 && value.length <= 200))];
  if (requestedIds.length === 0) return 0;

  const context = await getCurrentStudentErrorReportContext(now);
  if (!context) return 0;
  const currentPendingIds = new Set(context.reports
    .filter(({ report, studentDismissedAt }) => report.handledAt !== null && studentDismissedAt === null)
    .map(({ report }) => report.reportId));
  const reportIds = requestedIds.filter((id) => currentPendingIds.has(id));
  if (reportIds.length === 0) return 0;

  const statements = chunk(reportIds, 400).map((ids) => ({
    sql: `UPDATE error_reports SET student_dismissed_at = ?
      WHERE id IN (${ids.map(() => "?").join(", ")}) AND reporter_user_id = ?
        AND handled_at IS NOT NULL AND student_dismissed_at IS NULL`,
    args: [now.toISOString(), ...ids, context.userId],
  }));
  await (await getDatabase()).batch(statements);
  return reportIds.length;
}

async function getCurrentStudentErrorReportContext(now: Date): Promise<CurrentStudentErrorReportContext | null> {
  const user = await requireAuthenticatedUser();
  if (user.role !== "student") return null;
  const accessibleLearningSpaceIds = await getAccessibleLearningSpaceIds(user);
  if (accessibleLearningSpaceIds.length === 0) return { userId: user.id, accessibleLearningSpaceIds, reports: [] };

  const placeholders = accessibleLearningSpaceIds.map(() => "?").join(", ");
  const result = await (await getDatabase()).execute({
    sql: `SELECT error_reports.id AS report_id, error_reports.created_at, error_reports.handled_at,
      error_reports.student_dismissed_at,
      error_reports.teacher_response, error_reports.message,
      error_report_issues.exercise_id, error_report_issues.exercise_code,
      error_report_issues.document_kind, error_report_issues.variant_kind,
      portfolios.portfolio_code, COALESCE(portfolios.title_override, portfolios.title) AS portfolio_title,
      portfolios.visible AS portfolio_visible, portfolios.publication_limited,
      portfolios.publish_from AS portfolio_publish_from, portfolios.publish_until AS portfolio_publish_until,
      portfolios.is_indexed AS portfolio_is_indexed, portfolios.archived_at AS portfolio_archived_at,
      learning_spaces.name AS learning_space_name
      FROM error_reports
      INNER JOIN error_report_issues ON error_report_issues.id = error_reports.issue_id
      INNER JOIN error_report_threads ON error_report_threads.id = error_report_issues.thread_id
      INNER JOIN portfolios ON portfolios.id = error_report_threads.portfolio_id
        AND portfolios.learning_space_id = error_report_threads.learning_space_id
      INNER JOIN learning_spaces ON learning_spaces.id = error_report_threads.learning_space_id
      WHERE error_reports.reporter_user_id = ?
        AND error_report_threads.learning_space_id IN (${placeholders})`,
    args: [user.id, ...accessibleLearningSpaceIds],
  });

  const reports = result.rows
    .filter((row) => isCurrentlyAccessiblePortfolio(row, now))
    .map(studentErrorReportFromRow)
    .filter(({ report }) => isStudentErrorReportVisible(report, now))
    .sort((left, right) => compareStudentErrorReports(left.report, right.report));
  return { userId: user.id, accessibleLearningSpaceIds, reports };
}

function isCurrentlyAccessiblePortfolio(row: DatabaseRow, now: Date): boolean {
  if (Number(row.portfolio_is_indexed) !== 1 || row.portfolio_archived_at != null) return false;
  return isPortfolioPublished({
    visible: Number(row.portfolio_visible) === 1,
    limited: Number(row.publication_limited) === 1,
    publishFrom: nullableText(row, "portfolio_publish_from"),
    publishUntil: nullableText(row, "portfolio_publish_until"),
  }, now);
}

export function studentErrorReportStatus(report: Pick<StudentErrorReport, "handledAt">): StudentErrorReportStatus {
  return report.handledAt === null ? "IN_PROGRESS" : "HANDLED";
}

export function isStudentErrorReportVisible(report: Pick<StudentErrorReport, "handledAt">, now = new Date()): boolean {
  if (report.handledAt === null) return true;
  const handledAt = Date.parse(report.handledAt);
  if (!Number.isFinite(handledAt)) return false;
  const visibleUntil = handledAt + HANDLED_ERROR_REPORT_VISIBILITY_DAYS * 24 * 60 * 60 * 1000;
  return now.getTime() <= visibleUntil;
}

export function compareStudentErrorReports(left: StudentErrorReport, right: StudentErrorReport): number {
  const leftHandled = left.handledAt !== null;
  const rightHandled = right.handledAt !== null;
  if (leftHandled !== rightHandled) return leftHandled ? 1 : -1;
  const leftDate = Date.parse(leftHandled ? left.handledAt! : left.createdAt);
  const rightDate = Date.parse(rightHandled ? right.handledAt! : right.createdAt);
  return (Number.isFinite(rightDate) ? rightDate : 0) - (Number.isFinite(leftDate) ? leftDate : 0);
}

function studentErrorReportFromRow(row: DatabaseRow): CurrentStudentErrorReport {
  const handledAt = nullableText(row, "handled_at");
  const documentKind = text(row, "document_kind") as ErrorReportDocumentKind;
  const variant = nullableText(row, "variant_kind") as "standard" | "alternative" | null;
  return {
    studentDismissedAt: nullableText(row, "student_dismissed_at"),
    report: {
      reportId: text(row, "report_id"),
      createdAt: text(row, "created_at"),
      handledAt,
      teacherResponse: nullableText(row, "teacher_response"),
      message: text(row, "message"),
      status: studentErrorReportStatus({ handledAt }),
      exerciseCode: text(row, "exercise_code"),
      isMatchedExercise: nullableText(row, "exercise_id") !== null,
      portfolioCode: text(row, "portfolio_code"),
      portfolioTitle: text(row, "portfolio_title"),
      learningSpaceName: text(row, "learning_space_name"),
      locationLabel: studentErrorReportLocationLabel(documentKind, variant),
    },
  };
}

function studentErrorReportLocationLabel(documentKind: ErrorReportDocumentKind, variant: "standard" | "alternative" | null): string {
  const base = documentKind === "assignment"
    ? "Opgaven"
    : documentKind === "final_solutions"
      ? "Eindoplossingen"
      : documentKind === "exercise_solution"
        ? "Uitwerking"
        : "Hints";
  return variant === "alternative" ? `${base} · alternatief` : base;
}

function text(row: DatabaseRow, key: string): string {
  return String(row[key]);
}

function nullableText(row: DatabaseRow, key: string): string | null {
  return row[key] == null ? null : String(row[key]);
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks;
}
