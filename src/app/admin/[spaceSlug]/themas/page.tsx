import { Plus, Save, Trash2 } from "lucide-react";
import { notFound } from "next/navigation";

import { AdminSpaceHeader } from "@/app/components/admin-space-header";
import { ConfirmActionButton } from "@/app/components/confirm-action-button";
import { OrderControls } from "@/app/components/order-controls";
import { requireAdminUser } from "@/lib/auth";
import { canManageLearningSpace } from "@/lib/authorization";
import { getAdminLearningSpaceBySlug, getThemes } from "@/lib/repositories";
import { formatTerminologyLabel, learningSpaceTerminologyLabel, miscellaneousCollectionLabel } from "@/lib/collection-terminology";

import { createThemeAction, deleteThemeAction, moveThemeAction, saveThemeAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function ThemesPage({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const user = await requireAdminUser();
  const { spaceSlug } = await params;
  const space = await getAdminLearningSpaceBySlug(spaceSlug);
  if (!space || !await canManageLearningSpace(user, space.id)) notFound();
  const themes = await getThemes(space.id);
  const singular = learningSpaceTerminologyLabel(space, "theme", "singular");
  const plural = learningSpaceTerminologyLabel(space, "theme", "plural");
  const collectionPlural = learningSpaceTerminologyLabel(space, "collection", "plural");
  const inline = learningSpaceTerminologyLabel(space, "theme", "singular", "inline");
  return <main className="page-shell admin-page admin-space-page themes-page">
    <AdminSpaceHeader current={space} section="themes" user={user} />
    <section className="admin-card theme-create-card"><div className="card-heading"><div><h2>{singular} toevoegen</h2><p>Breng verschillende {formatTerminologyLabel(collectionPlural, "inline")} onder een gemeenschappelijke titel.</p></div></div><form action={createThemeAction} className="theme-create-form"><input type="hidden" name="learningSpaceId" value={space.id} /><label>Naam<input name="name" required maxLength={100} /></label><button className="primary-button" type="submit"><Plus size={17} aria-hidden />{singular} toevoegen</button></form></section>
    <section aria-labelledby="existing-themes-heading"><h2 id="existing-themes-heading">{plural}</h2>{themes.length ? <div className="theme-editor-list">{themes.map((theme, index) => <article className="theme-editor-card" key={theme.id}><form id={`theme-${theme.id}`} action={saveThemeAction} className="theme-name-form"><input type="hidden" name="id" value={theme.id} /><input type="hidden" name="learningSpaceId" value={space.id} /><label className="sr-only" htmlFor={`theme-name-${theme.id}`}>Naam ({inline})</label><input id={`theme-name-${theme.id}`} name="name" defaultValue={theme.name} required maxLength={100} /><button className="icon-button" type="submit" aria-label={`${singular} opslaan`} title={`${singular} opslaan`}><Save size={16} aria-hidden /></button></form><div className="theme-row-actions"><OrderControls action={moveThemeAction} fields={{ id: theme.id, learningSpaceId: space.id }} canMoveUp={index > 0} canMoveDown={index < themes.length - 1} itemLabel={singular} /><ConfirmActionButton action={deleteThemeAction} fields={{ id: theme.id, learningSpaceId: space.id }} className="icon-button danger-icon-button" label={<Trash2 size={16} aria-hidden />} confirmTitle={`${singular} verwijderen`} confirmText={`“${theme.name}” wordt verwijderd. ${formatTerminologyLabel(space.collectionLabelPlural, "standalone")} blijven bestaan en komen onder ${miscellaneousCollectionLabel(space.collectionLabelPlural)}.`} disabled={Boolean(theme.sourceTheme)} disabledTitle={theme.sourceTheme ? `Dit ${formatTerminologyLabel(singular, "inline")} wordt bepaald door de bronmap en kan hier niet worden verwijderd.` : undefined} /></div></article>)}</div> : <p className="empty-state compact-empty">Nog geen {learningSpaceTerminologyLabel(space, "theme", "plural", "inline")}.</p>}</section>
  </main>;
}
