import Link from "next/link";

import { SubmitButton } from "@/app/components/submit-button";
import { requireAdmin } from "@/lib/auth";
import { getAdminErrorReports } from "@/lib/repositories";

import { errorReportStatusAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function ErrorReportsPage() {
  await requireAdmin();
  const reports = await getAdminErrorReports();
  return <main className="page-shell admin-page"><Link href="/admin" className="back-link">Terug naar beheer</Link><p className="eyebrow">Beheer</p><h1>Foutmeldingen</h1>{reports.length === 0 ? <p className="empty-state">Nog geen foutmeldingen.</p> : <div className="admin-summary-table" role="region" aria-label="Foutmeldingen" tabIndex={0}><table><thead><tr><th>Oefening</th><th>Melding</th><th>Datum</th><th>Status</th></tr></thead><tbody>{reports.map((report) => <tr key={report.id}><td><strong>PF{report.portfolioCode}, oef. {report.exerciseCode}</strong><span>{report.sectionTitle} · {report.variant}</span></td><td>{report.message}</td><td>{new Intl.DateTimeFormat("nl-BE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(report.createdAt))}</td><td><form action={errorReportStatusAction} className="inline-form"><input type="hidden" name="id" value={report.id} /><select name="status" defaultValue={report.status === "NEW" ? "VIEWED" : report.status}><option value="VIEWED">Bekeken</option><option value="RESOLVED">Opgelost</option></select><SubmitButton className="secondary-button" pendingLabel="...">Opslaan</SubmitButton></form></td></tr>)}</tbody></table></div>}</main>;
}
