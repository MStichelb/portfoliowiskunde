import { Bell, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { LearningSpaceNav, type AdminSpaceSection } from "@/app/components/learning-space-nav";
import { SyncSpaceForm } from "@/app/components/sync-space-form";
import { getLatestSyncSummary, getLearningSpaces, getOpenErrorReportCount, type LearningSpace } from "@/lib/repositories";

export async function AdminSpaceHeader({ current, section }: { current: LearningSpace; section: AdminSpaceSection }) {
  const [allSpaces, sync, reportCount] = await Promise.all([
    getLearningSpaces(),
    getLatestSyncSummary(current.id),
    getOpenErrorReportCount(current.id),
  ]);
  const spaces = allSpaces.filter((space) => space.isActive || space.id === current.id);
  const syncedAt = sync?.finishedAt ?? sync?.startedAt;
  return <>
    <header className="admin-header admin-space-header">
      <div><p className="eyebrow">Beheer</p><h1>{current.name}</h1><p className="file-reference">{syncedAt ? `Laatste synchronisatie: ${formatBrussels(syncedAt)}.` : "Nog niet gesynchroniseerd."}</p></div>
      <div className="admin-actions">
        {current.mirrorSource?.isActive ? <span className="mirror-heading-warning"><TriangleAlert size={17} aria-hidden />Mirror actief</span> : null}
        <Link className="secondary-button link-button notification-link" href={`/admin/${encodeURIComponent(current.slug)}/foutmeldingen`}><Bell size={17} aria-hidden />Foutmeldingen{reportCount > 0 ? <span className="notification-badge">{reportCount}</span> : null}</Link>
        {current.isActive ? <SyncSpaceForm learningSpaceId={current.id} /> : null}
      </div>
    </header>
    <LearningSpaceNav spaces={spaces} current={current} section={section} />
  </>;
}

function formatBrussels(value: string): string {
  return new Intl.DateTimeFormat("nl-BE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(value));
}
