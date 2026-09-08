import { Plus, Save, Trash2 } from "lucide-react";
import { notFound } from "next/navigation";

import { AdminSpaceHeader } from "@/app/components/admin-space-header";
import { ConfirmActionButton } from "@/app/components/confirm-action-button";
import { requireAdminUser } from "@/lib/auth";
import { canManageLearningSpace } from "@/lib/authorization";
import { getAdminLearningSpaceBySlug, getThemes } from "@/lib/repositories";

import { createThemeAction, deleteThemeAction, saveThemeAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function ThemesPage({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const user = await requireAdminUser();
  const { spaceSlug } = await params;
  const space = await getAdminLearningSpaceBySlug(spaceSlug);
  if (!space || !await canManageLearningSpace(user, space.id)) notFound();
  const themes = await getThemes(space.id);
  return <main className="page-shell admin-page admin-space-page themes-page">
    <AdminSpaceHeader current={space} section="themes" user={user} />
    <section className="admin-card theme-create-card"><div className="card-heading"><div><h2>Nieuw thema</h2><p>Groepeer portfolio&apos;s onder een herkenbare titel.</p></div></div><form action={createThemeAction} className="theme-form-row"><input type="hidden" name="learningSpaceId" value={space.id} /><label>Naam<input name="name" required maxLength={100} /></label><label className="sort-field">Sortering<input name="sortOrder" type="number" defaultValue={themes.length + 1} /></label><button className="primary-button" type="submit"><Plus size={17} aria-hidden />Thema toevoegen</button></form></section>
    <section aria-labelledby="existing-themes-heading"><h2 id="existing-themes-heading">Bestaande thema&apos;s</h2>{themes.length ? <div className="theme-editor-list">{themes.map((theme) => <article className="theme-editor-card" key={theme.id}><form id={`theme-${theme.id}`} action={saveThemeAction} className="theme-form-row"><input type="hidden" name="id" value={theme.id} /><input type="hidden" name="learningSpaceId" value={space.id} /><label>Naam<input name="name" defaultValue={theme.name} required /></label><label className="sort-field">Sortering<input name="sortOrder" type="number" defaultValue={theme.sortOrder} /></label><button className="secondary-button" type="submit"><Save size={17} aria-hidden />Opslaan</button></form><ConfirmActionButton action={deleteThemeAction} fields={{ id: theme.id, learningSpaceId: space.id }} className="danger-button" label={<><Trash2 size={17} aria-hidden />Verwijderen</>} confirmTitle="Thema verwijderen" confirmText={`Het thema “${theme.name}” wordt verwijderd. Portfolio's blijven bestaan en komen onder Overige portfolio's.`} /></article>)}</div> : <p className="empty-state compact-empty">Nog geen thema&apos;s.</p>}</section>
  </main>;
}
