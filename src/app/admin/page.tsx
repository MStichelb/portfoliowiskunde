import { Folder, LogOut } from "lucide-react";
import Link from "next/link";

import { PageBanner } from "@/app/components/page-banner";
import { requireAdmin } from "@/lib/auth";
import { getLearningSpaces, type LearningSpace } from "@/lib/repositories";
import { cardColorStyle, DEFAULT_LEARNING_SPACE_COLOR } from "@/lib/ui-colors";

import { logoutAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin();
  const spaces = await getLearningSpaces(true);
  return <main className="page-shell admin-page">
    <PageBanner variant="admin" />
    <header className="admin-header">
      <div><p className="eyebrow">Beheer</p><h1>Leeromgevingen</h1><p>Kies een leeromgeving om portfolio&apos;s binnen deze leeromgeving te beheren.</p></div>
      <div className="admin-actions"><Link className="secondary-button link-button" href="/admin/instellingen"><Folder size={17} aria-hidden />Leeromgevingen beheren</Link><form action={logoutAction}><button className="secondary-button logout-button" type="submit"><LogOut size={17} aria-hidden />Uitloggen</button></form></div>
    </header>
    <div className="portfolio-cards learning-space-cards">{spaces.map((space) => <Link className="portfolio-card color-card admin-space-card" style={cardColorStyle(space.cardColor, DEFAULT_LEARNING_SPACE_COLOR)} key={space.id} href={`/admin/${encodeURIComponent(space.slug)}`}><span>{space.shortLabel}</span><strong>{space.name}</strong><small>{sourceSummary(space)}</small></Link>)}</div>
  </main>;
}

export function sourceSummary(space: LearningSpace): string {
  const primary = space.primarySource ? providerLabel(space.primarySource.providerType) : providerLabel(space.sourceType);
  const mirror = space.mirrorSource ? ` · Mirror • ${providerLabel(space.mirrorSource.providerType)}` : "";
  return `Bron • ${primary}${mirror}`;
}

function providerLabel(provider: LearningSpace["sourceType"]): string {
  if (provider === "onedrive") return "OneDrive";
  if (provider === "google_drive") return "Google Drive";
  return "Lokale bestanden (test)";
}
