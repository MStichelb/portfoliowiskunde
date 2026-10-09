import { MutationFeedbackForm } from "@/app/components/mutation-feedback-form";
import { Info, Save, Trash2 } from "lucide-react";
import { PortfolioInfoDialog } from "@/app/components/portfolio-info-dialog";
import infoStyles from "@/app/components/portfolio-resource-admin.module.css";
import { ThemeCreateModal } from "@/app/components/theme-create-modal";
import { getActiveSourceProfileConfigForLearningSpace } from "@/lib/source-profiles";
import { notFound } from "next/navigation";

import { AdminSpaceHeader } from "@/app/components/admin-space-header";
import { ConfirmActionButton } from "@/app/components/confirm-action-button";
import { OrderControls } from "@/app/components/order-controls";
import { requireAdminUser } from "@/lib/auth";
import { canManageLearningSpace } from "@/lib/authorization";
import { getAdminLearningSpaceBySlug, getAdminPortfolios, getThemes } from "@/lib/repositories";
import { formatTerminologyLabel, learningSpaceTerminologyLabel, withoutThemeLabel } from "@/lib/collection-terminology";

import { createThemeAction, deleteThemeAction, moveThemeAction, saveThemeAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function ThemesPage({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const user = await requireAdminUser();
  const { spaceSlug } = await params;
  const space = await getAdminLearningSpaceBySlug(spaceSlug);
  if (!space || !await canManageLearningSpace(user, space.id)) notFound();
  const [themes, portfolios, sourceProfile] = await Promise.all([getThemes(space.id), getAdminPortfolios(space.id), getActiveSourceProfileConfigForLearningSpace(space.id)]);
  const singular = learningSpaceTerminologyLabel(space, "theme", "singular");
  const plural = learningSpaceTerminologyLabel(space, "theme", "plural");
  const collectionPlural = learningSpaceTerminologyLabel(space, "collection", "plural");
  const inline = learningSpaceTerminologyLabel(space, "theme", "singular", "inline");
  const rootLabel = withoutThemeLabel(singular);
  const rootPortfolios = portfolios.filter((portfolio) => !portfolio.themeId);
  const countLabel = (count: number) => `${count} ${learningSpaceTerminologyLabel(space, "collection", count === 1 ? "singular" : "plural", "inline")}`;

  return <main className="page-shell admin-page admin-space-page themes-page">
    <AdminSpaceHeader current={space} section="themes" user={user} />
    <section aria-labelledby="existing-themes-heading">
      <div className="theme-section-heading"><h2 id="existing-themes-heading">{plural}</h2><ThemeCreateModal action={createThemeAction} learningSpaceId={space.id} singular={singular} /></div>
      {themes.some((theme) => theme.sourceTheme) ? <aside className="theme-source-info">
        <h3>{plural} uit je bronmap</h3>
        <p>De bron bepaalt welke {formatTerminologyLabel(collectionPlural, "inline")} bij deze {formatTerminologyLabel(plural, "inline")} horen. Je kunt hier de weergavenaam en volgorde aanpassen.</p>
      </aside> : null}
      {sourceProfile.scanner.portfolio.themeMode === "none" ? <>
        <div className="theme-manual-help"><p>Je kunt {formatTerminologyLabel(plural, "inline")} definiëren om verschillende {formatTerminologyLabel(collectionPlural, "inline")} te groeperen.</p><a className={infoStyles.infoButton} href="#automatic-theme-info" aria-label="Meer over automatisch groeperen" title="Automatisch groeperen"><Info size={17} aria-hidden /></a></div>
        <PortfolioInfoDialog dialogId="automatic-theme-info" title="Automatisch groeperen"><p>Je kunt deze indeling ook automatisch laten volgen uit je mappenstructuur. Stel dit in bij Bronprofiel onder “{plural}”, met de instelling “Groepering uit mappen”.</p></PortfolioInfoDialog>
      </> : null}
      {themes.length ? <div className="theme-editor-list">{themes.map((theme, index) => {
        const members = portfolios.filter((portfolio) => portfolio.themeId === theme.id);
        return <article className="theme-editor-card" key={theme.id}>
          <div className="theme-item-summary"><span className="theme-origin-label">{theme.sourceTheme ? "Uit bronmap" : "Handmatig"}</span><span>· {countLabel(members.length)}</span></div>
          <div className="theme-edit-row">
            <MutationFeedbackForm id={`theme-${theme.id}`} action={saveThemeAction} className="theme-name-form" successMessage="Thema opgeslagen." errorMessage="De wijziging kon niet worden opgeslagen. Probeer opnieuw.">
              <input type="hidden" name="id" value={theme.id} />
              <input type="hidden" name="learningSpaceId" value={space.id} />
              <label htmlFor={`theme-name-${theme.id}`}>Weergavenaam<span className="sr-only"> ({inline})</span></label>
              <input id={`theme-name-${theme.id}`} name="name" defaultValue={theme.name} required maxLength={100} />
              <button className="icon-button" type="submit" aria-label={`${singular} opslaan`} title={`${singular} opslaan`}><Save size={16} aria-hidden /></button>
            </MutationFeedbackForm>
            <div className="theme-row-actions">
              <OrderControls action={moveThemeAction} fields={{ id: theme.id, learningSpaceId: space.id }} canMoveUp={index > 0} canMoveDown={index < themes.length - 1} itemLabel={singular} />
              <ConfirmActionButton action={deleteThemeAction} errorMessage="Verwijderen is niet gelukt. Probeer opnieuw." fields={{ id: theme.id, learningSpaceId: space.id }} className="icon-button danger-icon-button" label={<Trash2 size={16} aria-hidden />} confirmTitle={`${singular} verwijderen`} confirmText={`“${theme.name}” wordt verwijderd. ${collectionPlural} blijven bestaan en komen onder ${rootLabel}.`} disabled={Boolean(theme.sourceTheme)} disabledTitle={theme.sourceTheme ? `${singular} uit de bronmap kan hier niet worden verwijderd.` : undefined} />
            </div>
          </div>
          {theme.sourceTheme ? <p className="theme-source-description">Bronmap: {theme.sourceTheme.name}</p> : !members.length ? <p className="theme-source-description">Nog geen {formatTerminologyLabel(collectionPlural, "inline")} gekoppeld.</p> : null}
        </article>;
      })}</div> : <p className="empty-state compact-empty">Nog geen {learningSpaceTerminologyLabel(space, "theme", "plural", "inline")} aangemaakt.</p>}
    </section>
    {rootPortfolios.length ? <section className="admin-card theme-root-group" aria-labelledby="root-portfolios-heading">
      <h2 id="root-portfolios-heading">{rootLabel}</h2>
      <p>{countLabel(rootPortfolios.length)} rechtstreeks in deze leeromgeving.</p>
    </section> : null}
  </main>;
}
