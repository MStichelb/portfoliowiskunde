import { Bell, Info, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { LearningSpaceNav, type AdminSpaceSection } from "@/app/components/learning-space-nav";
import { SyncSpaceForm } from "@/app/components/sync-space-form";
import { canConfigureLearningSpace } from "@/lib/authorization";
import type { AppUser } from "@/lib/identity";
import type { LearningSpaceSourceStatus } from "@/lib/learning-space-source-status";
import { getLatestSyncSummary, getOpenErrorThreadCount, type LearningSpace } from "@/lib/repositories";

export async function AdminSpaceHeader({ current, section, user, canConfigure, sourceStatus }: {
  current: LearningSpace;
  section: AdminSpaceSection;
  user: AppUser;
  canConfigure?: boolean;
  sourceStatus?: LearningSpaceSourceStatus;
}) {
  const [sync, reportCount] = await Promise.all([
    sourceStatus ? Promise.resolve(null) : getLatestSyncSummary(current.id),
    getOpenErrorThreadCount(current.id),
  ]);
  const showSettings = canConfigure ?? await canConfigureLearningSpace(user, current.id);
  const syncSummary = sourceStatus ? sourceStatusSummaryLabel(sourceStatus) : sync ? syncSummaryLabel(sync) : "Nog niet gesynchroniseerd.";
  return <>
    <header className="admin-header admin-space-header">
      <div><p className="eyebrow">Beheer</p><h1>{current.name}</h1><p className="file-reference">{syncSummary}</p></div>
      <div className="admin-actions">
        {current.mirrorSource?.isActive ? <span className="mirror-heading-warning"><TriangleAlert size={17} aria-hidden />Mirror actief</span> : null}
        <Link
          className={`secondary-button link-button source-status-link${section === "status" ? " is-current" : ""}`}
          href={`/admin/${encodeURIComponent(current.slug)}/status`}
          aria-current={section === "status" ? "page" : undefined}
        ><Info size={17} aria-hidden />Status</Link>
        <Link className="secondary-button link-button notification-link" href={`/admin/${encodeURIComponent(current.slug)}/foutmeldingen`}><Bell size={17} aria-hidden />Foutmeldingen{reportCount > 0 ? <span className="notification-badge">{reportCount}</span> : null}</Link>
        {current.isActive ? <SyncSpaceForm learningSpaceId={current.id} /> : null}
      </div>
    </header>
    <LearningSpaceNav current={current} section={section} showSettings={showSettings} />
  </>;
}

function formatBrussels(value: string): string {
  return new Intl.DateTimeFormat("nl-BE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(value));
}

function syncSummaryLabel(sync: Awaited<ReturnType<typeof getLatestSyncSummary>>): string {
  if (!sync) return "Nog niet gesynchroniseerd.";
  const timestamp = formatBrussels(sync.finishedAt ?? sync.startedAt);
  if (sync.status === "completed") return `Laatste geslaagde synchronisatie: ${timestamp}.`;
  if (sync.status === "failed") return `Laatste synchronisatiepoging mislukt: ${timestamp}.`;
  return `Laatste synchronisatiepoging gestart: ${timestamp}.`;
}

function sourceStatusSummaryLabel(status: LearningSpaceSourceStatus): string {
  const attempt = status.synchronization.latestAttempt;
  if (!attempt) return "Nog niet gesynchroniseerd.";
  const timestamp = formatBrussels(attempt.finishedAt ?? attempt.startedAt);
  if (attempt.result === "succeeded") return `Laatste geslaagde synchronisatie: ${timestamp}.`;
  if (attempt.result === "failed" && status.synchronization.usableIndex.available) {
    return `Laatste synchronisatiepoging mislukt: ${timestamp}. De vorige gesynchroniseerde inhoud blijft beschikbaar.`;
  }
  if (attempt.result === "failed") {
    return `Laatste synchronisatiepoging mislukt: ${timestamp}. Er is nog geen bruikbare gesynchroniseerde inhoud beschikbaar.`;
  }
  if (attempt.result === "running") return `Laatste synchronisatiepoging gestart: ${timestamp}.`;
  return `Resultaat van de laatste synchronisatiepoging onbekend: ${timestamp}.`;
}
