import Link from "next/link";

import { requireAdmin } from "@/lib/auth";
import { getLearningSpaces } from "@/lib/repositories";

import { logoutAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin();
  const spaces = await getLearningSpaces(true);
  return <main className="page-shell admin-page"><header className="admin-header"><div><p className="eyebrow">Beheer wiskunde</p><h1>Leeromgevingen</h1><p>Kies een leeromgeving om portfolio&apos;s, thema&apos;s, synchronisatie en foutmeldingen afzonderlijk te beheren.</p></div><div className="admin-actions"><Link className="secondary-button link-button" href="/admin/instellingen">Leeromgevingen beheren</Link><form action={logoutAction}><button className="secondary-button" type="submit">Uitloggen</button></form></div></header><div className="portfolio-cards">{spaces.map((space) => <Link className="portfolio-card" key={space.id} href={`/admin/${encodeURIComponent(space.slug)}`}><span>Leeromgeving</span><strong>{space.name}</strong><small>{space.sourceType === "local" ? "Lokale bronmap" : space.sourceType === "google_drive" ? "Google Drive" : "OneDrive"}</small></Link>)}</div></main>;
}
