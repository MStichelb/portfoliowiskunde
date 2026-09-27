import { Plus, Save, Trash2 } from "lucide-react";
import { notFound } from "next/navigation";

import { AdminSpaceHeader } from "@/app/components/admin-space-header";
import { ConfirmActionButton } from "@/app/components/confirm-action-button";
import { OrderControls } from "@/app/components/order-controls";
import { requireAdminUser } from "@/lib/auth";
import { canManageLearningSpace } from "@/lib/authorization";
import { getAdminLearningSpaceBySlug, getThemes } from "@/lib/repositories";
import { formatTerminologyLabel, miscellaneousCollectionLabel } from "@/lib/collection-terminology";

import { createThemeAction, deleteThemeAction, moveThemeAction, saveThemeAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function ThemesPage({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const user = await requireAdminUser();
  const { spaceSlug } = await params;
  const space = await getAdminLearningSpaceBySlug(spaceSlug);
  if (!space || !await canManageLearningSpace(user, space.id)) notFound();
  const themes = await getThemes(space.id);
  return <main className="page-shell admin-page admin-space-page themes-page">
    <AdminSpaceHeader current={space} section="themes" user={user} />
    <section className="admin-card theme-create-card"><div className="card-heading"><div><h2>Nieuw thema</h2><p>{formatTerminologyLabel(space.collectionLabelPlural, "standalone")}: groepeer ze onder een herkenbare titel.</p></div></div><form action={createThemeAction} className="theme-create-form"><input type="hidden" name="learningSpaceId" value={space.id} /><label>Naam<input name="name" required maxLength={100} /></label><button className="primary-button" type="submit"><Plus size={17} aria-hidden />Thema toevoegen</button></form></section>
    <section aria-labelledby="existing-themes-heading"><h2 id="existing-themes-heading">Bestaande thema&apos;s</h2>{themes.length ? <div className="theme-editor-list">{themes.map((theme, index) => <article className="theme-editor-card" key={theme.id}><form id={`theme-${theme.id}`} action={saveThemeAction} className="theme-name-form"><input type="hidden" name="id" value={theme.id} /><input type="hidden" name="learningSpaceId" value={space.id} /><label className="sr-only" htmlFor={`theme-name-${theme.id}`}>Naam van thema</label><input id={`theme-name-${theme.id}`} name="name" defaultValue={theme.name} required maxLength={100} /><button className="icon-button" type="submit" aria-label="Themanaam opslaan" title="Themanaam opslaan"><Save size={16} aria-hidden /></button></form><div className="theme-row-actions"><OrderControls action={moveThemeAction} fields={{ id: theme.id, learningSpaceId: space.id }} canMoveUp={index > 0} canMoveDown={index < themes.length - 1} itemLabel="Thema" /><ConfirmActionButton action={deleteThemeAction} fields={{ id: theme.id, learningSpaceId: space.id }} className="icon-button danger-icon-button" label={<Trash2 size={16} aria-hidden />} confirmTitle="Thema verwijderen" confirmText={`Het thema “${theme.name}” wordt verwijderd. ${formatTerminologyLabel(space.collectionLabelPlural, "standalone")} blijven bestaan en komen onder ${miscellaneousCollectionLabel(space.collectionLabelPlural)}.`} /></div></article>)}</div> : <p className="empty-state compact-empty">Nog geen thema&apos;s.</p>}</section>
  </main>;
}
