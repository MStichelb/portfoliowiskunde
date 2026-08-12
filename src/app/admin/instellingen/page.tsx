import Link from "next/link";

import { requireAdmin } from "@/lib/auth";
import { getLearningSpaces } from "@/lib/repositories";

import { createLearningSpaceAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireAdmin();
  const spaces = await getLearningSpaces();
  return <main className="page-shell narrow-page"><Link href="/admin" className="back-link">Terug naar beheer</Link><p className="eyebrow">Globaal beheer</p><h1>Leeromgevingen</h1><p>Elke leeromgeving heeft een eigen bron, synchronisatie, portfolio&apos;s, thema&apos;s en foutmeldingen. Bronbestanden blijven read-only.</p><div className="space-list">{spaces.map((space) => <div className="space-list-item" key={space.id}><div><strong>{space.name}</strong><span>/{space.slug} · {space.storageProvider === "local" ? (space.localSourcePath || "Bronmap nog instellen") : "OneDrive"}</span></div><Link className="secondary-button link-button" href={`/admin/${encodeURIComponent(space.slug)}/instellingen`}>Beheren</Link></div>)}</div><section className="settings-section"><h2>Leeromgeving toevoegen</h2><form action={createLearningSpaceAction} className="settings-form"><label>Naam<input name="name" required maxLength={100} placeholder="4de jaar" /></label><label>Publieke slug<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="4" /></label><label>Kort label<input name="shortLabel" required maxLength={20} placeholder="4" /></label><label>Sortering<input name="sortOrder" type="number" defaultValue={40} /></label><label>Bron<select name="storageProvider"><option value="local">Local filesystem</option><option value="onedrive">OneDrive</option></select></label><label>Lokale bronmap<input name="localSourcePath" placeholder="C:\\..." /></label><label>OneDrive drive-ID<input name="oneDriveDriveId" /></label><label>OneDrive map-ID<input name="oneDriveFolderId" /></label><label>OneDrive mapnaam of pad<input name="oneDriveFolderPath" /></label><button className="primary-button" type="submit">Leeromgeving toevoegen</button></form></section></main>;
}
