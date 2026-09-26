import { ArrowLeft, BookOpen } from "lucide-react";
import Link from "next/link";

import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SystemPage() {
  await requireAdmin();
  return <main className="page-shell admin-page system-page">
    <Link className="secondary-button compact-back-button" href="/admin"><ArrowLeft size={16} aria-hidden />Terug naar beheer</Link>
    <header className="page-header"><p className="eyebrow">Systeem</p><h1>Appbrede instellingen</h1><p>Beheer instellingen die voor de volledige applicatie gelden.</p></header>
    <div className="system-settings-grid">
      <Link className="admin-card system-setting-tile" href="/admin/systeem/vakken">
        <BookOpen size={24} aria-hidden />
        <span><strong>Vakken</strong><small>Beheer de vakken die binnen de applicatie beschikbaar zijn.</small></span>
      </Link>
    </div>
  </main>;
}
