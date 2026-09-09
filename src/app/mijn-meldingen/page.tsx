import { notFound } from "next/navigation";

import { PageBanner } from "@/app/components/page-banner";
import { StudentErrorReportCenter } from "@/app/components/student-error-report-center";
import { getMyErrorReports } from "@/lib/student-error-reports";

export const dynamic = "force-dynamic";

export default async function MyErrorReportsPage() {
  const reports = await getMyErrorReports();
  if (reports === null) notFound();

  return <main className="page-shell student-page my-reports-page">
    <PageBanner variant="main" />
    <header className="page-header">
      <p className="eyebrow">Foutmeldingen</p>
      <h1>Mijn meldingen</h1>
      <p>Bekijk je openstaande en recent afgewerkte meldingen.</p>
    </header>
    <StudentErrorReportCenter reports={reports} />
  </main>;
}
