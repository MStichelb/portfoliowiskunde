import Link from "next/link";
import { notFound } from "next/navigation";

import { LearningSpaceNav } from "@/app/components/learning-space-nav";
import { requireAdmin } from "@/lib/auth";
import { getLearningSpaceBySlug, getLearningSpaces, getThemes } from "@/lib/repositories";

import { createThemeAction, deleteThemeAction, saveThemeAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function ThemesPage({ params }: { params: Promise<{ spaceSlug: string }> }) {
  await requireAdmin();
  const { spaceSlug } = await params;
  const [space, spaces] = await Promise.all([getLearningSpaceBySlug(spaceSlug), getLearningSpaces(true)]);
  if (!space) notFound();
  const themes = await getThemes(space.id);
  return <main className="page-shell narrow-page"><Link href={`/admin/${encodeURIComponent(space.slug)}`} className="back-link">Terug naar portfolio&apos;s</Link><LearningSpaceNav spaces={spaces} current={space} section="themes" /><h1>Thema&apos;s</h1><form action={createThemeAction} className="settings-form"><input type="hidden" name="learningSpaceId" value={space.id} /><label>Nieuw thema<input name="name" required maxLength={100} /></label><label>Sortering<input name="sortOrder" type="number" defaultValue={themes.length + 1} /></label><button className="primary-button" type="submit">Thema toevoegen</button></form><div className="theme-editor-list">{themes.map((theme) => <form action={saveThemeAction} className="theme-editor" key={theme.id}><input type="hidden" name="id" value={theme.id} /><input type="hidden" name="learningSpaceId" value={space.id} /><label>Naam<input name="name" defaultValue={theme.name} required /></label><label>Sortering<input name="sortOrder" type="number" defaultValue={theme.sortOrder} /></label><button className="secondary-button">Opslaan</button><button className="text-button" formAction={deleteThemeAction}>Verwijderen</button></form>)}</div></main>;
}
