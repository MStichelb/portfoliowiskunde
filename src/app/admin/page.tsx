import { TriangleAlert } from "lucide-react";
import Link from "next/link";

import { PublicationStatus } from "@/app/components/publication-status";
import { requireAdmin } from "@/lib/auth";
import { getActiveWarningCounts, getAdminPortfolios, getLatestSyncSummary, getLatestWarnings, getOpenErrorReportCount } from "@/lib/repositories";

import { logoutAction, syncAction } from "./actions";
import { SubmitButton } from "../components/submit-button";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin();
  const [portfolios, warnings, latestSync, openReports, warningCounts] = await Promise.all([getAdminPortfolios(), getLatestWarnings(), getLatestSyncSummary(), getOpenErrorReportCount(), getActiveWarningCounts()]);

  return (
    <main className="page-shell admin-page">
      <header className="admin-header">
        <div>
          <p className="eyebrow">Beheer</p>
          <h1>Portfolio-index</h1>
          <p>Bronbestanden blijven read-only. Nieuwe inhoud start verborgen; een synchronisatie bewaart bestaande publicatie-instellingen.</p>
          <p className="file-reference">{formatSync(latestSync)}</p>
        </div>
        <div className="admin-actions">
          <Link className="secondary-button link-button" href="/admin/instellingen">Instellingen</Link>
          <Link className="secondary-button link-button notification-link" href="/admin/meldingen">Foutmeldingen{openReports > 0 && <span className="notification-badge" aria-label={`${openReports} openstaande meldingen`}>{openReports}</span>}</Link>
          <form action={syncAction}><SubmitButton pendingLabel="Synchroniseren...">Synchroniseren</SubmitButton></form>
          <form action={logoutAction}><button className="secondary-button" type="submit">Uitloggen</button></form>
        </div>
      </header>

      {portfolios.length === 0 ? <p className="empty-state">Nog geen inhoud geindexeerd. Kies Synchroniseren.</p> : (
        <div className="admin-summary-table" role="region" aria-label="Portfolio-overzicht" tabIndex={0}>
          <table>
            <thead><tr><th>Portfolio</th><th>Titel</th><th>Status</th><th>Onderdelen</th><th>Oefeningen</th><th>Waarschuwingen</th><th>Actie</th></tr></thead>
            <tbody>{portfolios.map((portfolio) => {
              const exerciseCount = portfolio.sections.reduce((total, section) => total + section.exercises.length, 0);
              return <tr key={portfolio.id}>
                <td><strong>{portfolio.code}</strong></td><td>{portfolio.title}{!portfolio.isIndexed && <small>Ontbreekt in bron</small>}</td>
                <td>{portfolio.isIndexed ? <PublicationStatus status={portfolio.effectiveStatus} /> : <span className="status-badge missing">Bron ontbreekt</span>}</td>
                <td>{portfolio.sections.length}</td><td>{exerciseCount}</td>
                <td>{warningCounts.get(portfolio.id) ? <Link className="warning-count" href={`/admin/portfolio/${encodeURIComponent(portfolio.id)}#portfolio-warnings-title`} aria-label={`${warningCounts.get(portfolio.id)} waarschuwingen`}><TriangleAlert size={16} aria-hidden /><span>{warningCounts.get(portfolio.id)}</span></Link> : null}</td>
                <td><Link className="secondary-button link-button" href={`/admin/portfolio/${encodeURIComponent(portfolio.id)}`}>Open beheer</Link></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      )}

      <section className="warnings" aria-labelledby="warnings-title"><h2 id="warnings-title">Waarschuwingen ({warnings.length})</h2><p>{warnings.length === 0 ? "Geen waarschuwingen in de laatste geslaagde synchronisatie." : "Portfolio-specifieke waarschuwingen staan uitsluitend bij het relevante portfolio."}</p></section>
    </main>
  );
}

function formatSync(summary: Awaited<ReturnType<typeof getLatestSyncSummary>>) {
  if (!summary) return "Nog niet gesynchroniseerd.";
  if (summary.status === "failed") return `Laatste synchronisatie mislukte: ${summary.failureMessage ?? "onbekende fout"}`;
  const date = new Intl.DateTimeFormat("nl-BE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(summary.finishedAt ?? summary.startedAt));
  return `Laatste synchronisatie: ${date}. ${summary.addedCount} nieuw, ${summary.updatedCount} bijgewerkt, ${summary.missingCount} ontbrekend, ${summary.warningCount} waarschuwingen.`;
}
