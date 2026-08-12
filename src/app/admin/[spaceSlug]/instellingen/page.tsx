import Link from "next/link";
import { notFound } from "next/navigation";

import { LearningSpaceNav } from "@/app/components/learning-space-nav";
import { requireAdmin } from "@/lib/auth";
import { getLearningSpaceBySlug, getLearningSpaces } from "@/lib/repositories";

import { saveLearningSpaceAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function LearningSpaceSettingsPage({ params }: { params: Promise<{ spaceSlug: string }> }) {
  await requireAdmin();
  const { spaceSlug } = await params;
  const [space, spaces] = await Promise.all([getLearningSpaceBySlug(spaceSlug), getLearningSpaces(true)]);
  if (!space) notFound();
  return <main className="page-shell narrow-page"><Link href={`/admin/${encodeURIComponent(space.slug)}`} className="back-link">Terug naar portfolio&apos;s</Link><LearningSpaceNav spaces={spaces} current={space} section="settings" /><h1>Instellingen: {space.name}</h1><p>Deze bron wordt uitsluitend gelezen. Synchronisatie beïnvloedt alleen deze leeromgeving.</p><form action={saveLearningSpaceAction} className="settings-form"><input type="hidden" name="id" value={space.id} /><label>Naam<input name="name" defaultValue={space.name} required maxLength={100} /></label><label>Publieke slug<input name="slug" defaultValue={space.slug} required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /></label><label>Kort label<input name="shortLabel" defaultValue={space.shortLabel} required maxLength={20} /></label><label>Sortering<input name="sortOrder" type="number" defaultValue={space.sortOrder} required /></label><label>Bron<select name="storageProvider" defaultValue={space.storageProvider}><option value="local">Local filesystem</option><option value="onedrive">OneDrive</option></select></label><label>Lokale bronmap<input name="localSourcePath" defaultValue={space.localSourcePath ?? ""} placeholder="C:\\..." /></label><label>OneDrive drive-ID<input name="oneDriveDriveId" defaultValue={space.oneDriveDriveId ?? ""} /></label><label>OneDrive map-ID<input name="oneDriveFolderId" defaultValue={space.oneDriveFolderId ?? ""} /></label><label>OneDrive mapnaam of pad<input name="oneDriveFolderPath" defaultValue={space.oneDriveFolderPath ?? ""} /></label><button className="primary-button" type="submit">Opslaan</button></form></main>;
}
