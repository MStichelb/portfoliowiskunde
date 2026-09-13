import { ArrowLeft, Copy, Eye, Link2, Pencil, RotateCcw, SlidersHorizontal, Trash2, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { ArchiveVisibilityToggle } from "@/app/components/archive-visibility-toggle";
import { ConfirmActionButton } from "@/app/components/confirm-action-button";
import { SourceProfileExerciseResourcesViewer } from "@/app/components/source-profile-exercise-resources-editor";
import { SourceProfileGlobalResourcesViewer } from "@/app/components/source-profile-global-resources-editor";
import { SourceProfileManageDialog } from "@/app/components/source-profile-manage-dialog";
import { SourceProfileOwnerFilter } from "@/app/components/source-profile-owner-filter";
import { SourceProfileSectionTabs, type SourceProfileSectionTab } from "@/app/components/source-profile-section-tabs";
import { SourceProfileTemplateManager, type SourceProfileTemplateModal } from "@/app/components/source-profile-template-manager";
import { requireAdminUser } from "@/lib/auth";
import { getSourceProfileOverview, sourceProfileUsageLabel, type ManagedSourceProfile } from "@/lib/source-profiles";
import { listSourceProfileTemplates } from "@/lib/source-profile-templates";
import { archiveManagedSourceProfileAction, archiveSourceProfileTemplateAction, copyManagedSourceProfileAction, copyManagedSourceProfileTemplateAction, createSourceProfileTemplateAction, duplicateSourceProfileTemplateAction, linkManagedSourceProfileAction, permanentlyDeleteManagedSourceProfileAction, permanentlyDeleteSourceProfileTemplateAction, restoreManagedSourceProfileAction, restoreSourceProfileTemplateAction, saveManagedSourceProfileAction, saveSourceProfileTemplateAction, setDefaultSourceProfileTemplateAction } from "./actions";

export const dynamic = "force-dynamic";

interface Query { tab?: string; owner?: string; archive?: string; templateArchive?: string; profile?: string; copyProfile?: string; linkProfile?: string; error?: string; saved?: string; template?: string; templateError?: string; templateModal?: string; templateSaved?: string }

export default async function SourceProfilesPage({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await requireAdminUser();
  const query = await searchParams;
  const showArchive = query.archive === "1";
  const showTemplateArchive = user.role === "superadmin" && query.templateArchive === "1";
  const [overview, templates] = await Promise.all([
    getSourceProfileOverview(user, { archivedOnly: showArchive }),
    listSourceProfileTemplates(user, { archivedOnly: showTemplateArchive, includeConfig: true }),
  ]);
  const relatedProfiles = user.role === "superadmin" ? overview.otherUserProfiles : overview.editorAccessibleActiveProfiles;
  const profiles = [...overview.ownedProfiles, ...relatedProfiles];
  const selectedProfile = profiles.find((profile) => profile.id === query.profile) ?? null;
  const copyProfile = profiles.find((profile) => profile.id === query.copyProfile && profile.canCopy) ?? null;
  const linkProfile = profiles.find((profile) => profile.id === query.linkProfile && profile.canLink) ?? null;
  const selectedOwnerId = user.role === "superadmin" && overview.otherProfileOwners.some((owner) => owner.id === query.owner) ? query.owner! : null;
  const visibleRelatedProfiles = selectedOwnerId ? relatedProfiles.filter((profile) => profile.ownerUserId === selectedOwnerId) : relatedProfiles;

  const ownedSection = <section className="source-profile-tab-section" aria-labelledby="owned-source-profiles-heading">
    <div className="source-profile-overview-heading">
      <div><h2 id="owned-source-profiles-heading">Mijn bronprofielen</h2><p>Bekijk en beheer alle bronprofielen waarvan jij eigenaar bent, ook wanneer ze inactief zijn.</p></div>
      <div className="source-profile-heading-controls"><span className="source-role-badge">{overview.ownedProfiles.length} {overview.ownedProfiles.length === 1 ? "profiel" : "profielen"}</span><ArchiveVisibilityToggle checked={showArchive} href={showArchive ? "/admin/bronprofielen" : "/admin/bronprofielen?archive=1"} /></div>
    </div>
    <ProfileList profiles={overview.ownedProfiles} showOwner={false} empty={showArchive ? "Geen gearchiveerde bronprofielen." : "Je hebt momenteel geen eigen bronprofielen."} />
  </section>;

  const editorSection = <section className="source-profile-tab-section" aria-labelledby="editor-source-profiles-heading">
    <div className="source-profile-overview-heading"><div><h2 id="editor-source-profiles-heading">{user.role === "superadmin" ? "Bronprofielen van andere gebruikers" : "Bronprofielen uit leeromgevingen"}</h2><p>{user.role === "superadmin" ? "Bekijk concrete bronprofielen van andere eigenaars binnen de globale beheerscope." : "Actieve profielen uit leeromgevingen waar je editor bent. Deze profielen blijven eigendom van een collega en zijn alleen te bekijken of onafhankelijk te kopiëren."}</p></div></div>
    {user.role === "superadmin" ? <div className="source-profile-related-controls"><SourceProfileOwnerFilter owners={overview.otherProfileOwners} selectedOwnerId={selectedOwnerId} /><ArchiveVisibilityToggle checked={showArchive} href={relatedArchiveHref(showArchive, selectedOwnerId)} /></div> : null}
    <ProfileList profiles={visibleRelatedProfiles} showOwner empty={user.role === "superadmin" && showArchive ? "Geen gearchiveerde bronprofielen van andere gebruikers." : user.role === "superadmin" ? "Er zijn geen bronprofielen van andere gebruikers voor deze filter." : "Je hebt momenteel geen actieve foreign bronprofielen via editor-leeromgevingen."} />
  </section>;

  const templateSection = <SourceProfileTemplateManager key={`${query.templateSaved ?? ""}:${query.templateError ?? ""}:${query.templateModal ?? ""}:${query.template ?? ""}`} templates={templates} copyTargets={overview.copyTargets} canManage={user.role === "superadmin"} showArchive={showTemplateArchive} actions={{ create: createSourceProfileTemplateAction, save: saveSourceProfileTemplateAction, duplicate: duplicateSourceProfileTemplateAction, setDefault: setDefaultSourceProfileTemplateAction, copy: copyManagedSourceProfileTemplateAction, archive: archiveSourceProfileTemplateAction, restore: restoreSourceProfileTemplateAction, permanentlyDelete: permanentlyDeleteSourceProfileTemplateAction }} initialModal={templateModal(query.templateModal)} initialTemplateId={query.template} error={query.templateError} />;

  return <main className="page-shell admin-page source-profiles-page">
    <Link className="secondary-button compact-back-button" href="/admin"><ArrowLeft size={16} aria-hidden />Terug naar beheer</Link>
    <header className="page-header"><p className="eyebrow">Beheer</p><h1>Bronprofielen</h1><p>Bekijk en beheer concrete bronprofielen en appbrede sjablonen.</p></header>
    {profileFeedback(query.saved) ? <p className="success-message" role="status">{profileFeedback(query.saved)}</p> : null}
    {query.error && !selectedProfile && !copyProfile && !linkProfile ? <p className="form-message" role="alert">{query.error}</p> : null}
    {templateFeedback(query.templateSaved) ? <p className="success-message" role="status">{templateFeedback(query.templateSaved)}</p> : null}
    <SourceProfileSectionTabs ownedSection={ownedSection} editorSection={editorSection} templateSection={templateSection} secondTabLabel={user.role === "superadmin" ? "Andere gebruikers" : "Uit leeromgevingen"} initialTab={initialSection(query, relatedProfiles)} />

    {selectedProfile ? selectedProfile.canRename
      ? <SourceProfileManageDialog profile={selectedProfile} saveAction={saveManagedSourceProfileAction} archiveAction={archiveManagedSourceProfileAction} error={query.error} />
      : <div className="confirm-backdrop" role="presentation"><div className="source-profile-dialog source-profile-dialog-wide" role="dialog" aria-modal="true" aria-labelledby="manage-source-profile-title">
        <div className="source-profile-dialog-heading"><h2 id="manage-source-profile-title">Bronprofiel bekijken</h2><CloseLink /></div>
        <div className="source-profile-central-usage"><strong>{selectedProfile.name}</strong><span>{selectedProfile.isInactive ? "Inactief" : `Gebruikt in: ${sourceProfileUsageLabel(selectedProfile.usages)}`}</span>{selectedProfile.ownerName ? <small>Eigenaar: {selectedProfile.ownerName}</small> : null}</div>
        <div className="source-profile-dialog-form"><p>Je kunt dit profiel bekijken{selectedProfile.canCopy ? " en onafhankelijk kopiëren" : ""}, maar niet wijzigen of koppelen.</p></div>
        <SourceProfileGlobalResourcesViewer resources={selectedProfile.config.globalResources} />
        <SourceProfileExerciseResourcesViewer
          resources={selectedProfile.config.exerciseResources}
          exerciseMode={selectedProfile.config.scanner.exercise.exerciseMode}
        />
        <div className="source-profile-dialog-actions"><Link className="secondary-button link-button" href="/admin/bronprofielen">Sluiten</Link></div>
      </div></div> : null}

    {copyProfile ? <div className="confirm-backdrop" role="presentation"><div className="source-profile-dialog" role="dialog" aria-modal="true" aria-labelledby="copy-source-profile-title"><div className="source-profile-dialog-heading"><h2 id="copy-source-profile-title">Bronprofiel kopiëren</h2><CloseLink /></div><form action={copyManagedSourceProfileAction} className="source-profile-dialog-form"><input type="hidden" name="sourceProfileId" value={copyProfile.id} /><ReadonlyProfile name={copyProfile.name} /><label>Doelleeromgeving<select name="targetLearningSpaceId" required defaultValue=""><option value="" disabled>Kies een leeromgeving</option>{overview.copyTargets.map((target) => <option key={target.learningSpaceId} value={target.learningSpaceId}>{target.learningSpaceShortLabel} — {target.profile.name}</option>)}</select></label><p>Er wordt een onafhankelijke kopie gemaakt waarvan jij eigenaar wordt. De kopie wordt actief in de gekozen leeromgeving.</p>{query.error ? <ErrorMessage text={query.error} /> : null}<DialogLinks submit="Kopiëren" icon={<Copy size={16} aria-hidden />} /></form></div></div> : null}

    {linkProfile ? <div className="confirm-backdrop" role="presentation"><div className="source-profile-dialog" role="dialog" aria-modal="true" aria-labelledby="link-source-profile-title"><div className="source-profile-dialog-heading"><h2 id="link-source-profile-title">Bronprofiel koppelen</h2><CloseLink /></div><form action={linkManagedSourceProfileAction} className="source-profile-dialog-form"><input type="hidden" name="sourceProfileId" value={linkProfile.id} /><ReadonlyProfile name={linkProfile.name} /><label>Koppelen aan leeromgeving<select name="targetLearningSpaceId" required defaultValue=""><option value="" disabled>Kies een leeromgeving</option>{linkProfile.linkTargets.map((target) => <option key={target.learningSpaceId} value={target.learningSpaceId}>{target.learningSpaceShortLabel} — {target.profile.name}</option>)}</select></label><div className="source-profile-shared-warning"><strong><Link2 size={16} aria-hidden />Gedeeld profiel</strong><p>Dit bronprofiel wordt gedeeld. Latere wijzigingen aan dit profiel gelden voor alle gekoppelde leeromgevingen.</p></div>{query.error ? <ErrorMessage text={query.error} /> : null}<DialogLinks submit="Koppelen" icon={<Link2 size={16} aria-hidden />} /></form></div></div> : null}
  </main>;
}

function ProfileList({ profiles, showOwner, empty }: { profiles: ManagedSourceProfile[]; showOwner: boolean; empty: string }) {
  if (profiles.length === 0) return empty ? <p className="empty-state">{empty}</p> : null;
  return <div className="source-profile-overview-list">{profiles.map((profile) => <article className="source-profile-overview-card" key={profile.id}>
    <div className="source-profile-overview-copy"><div className="source-profile-overview-title"><SlidersHorizontal size={18} aria-hidden /><h3>{profile.name}</h3>{profile.isArchived ? <span className="source-profile-archived-badge">Gearchiveerd</span> : profile.usageCount > 1 ? <span className="source-profile-shared-icon" title="Gedeeld profiel"><Link2 size={15} aria-hidden /><span className="sr-only">Gedeeld profiel</span></span> : null}</div><p className={profile.isInactive ? "source-profile-inactive" : undefined}>{profile.isArchived ? "Inactief" : profile.isInactive ? "Inactief" : <>Gebruikt in: <strong>{sourceProfileUsageLabel(profile.usages)}</strong></>}</p>{showOwner && profile.ownerName ? <small>Eigenaar: {profile.ownerName}</small> : null}</div>
    {profile.isArchived ? <div className="source-profile-card-actions"><Link className="secondary-button link-button source-profile-manage-button" href={`/admin/bronprofielen?archive=1&profile=${encodeURIComponent(profile.id)}`}><Eye size={16} aria-hidden />Bekijken</Link><form action={restoreManagedSourceProfileAction}><input type="hidden" name="sourceProfileId" value={profile.id} /><button className="secondary-button restore-button" type="submit"><RotateCcw size={16} aria-hidden />Herstellen</button></form><ConfirmActionButton action={permanentlyDeleteManagedSourceProfileAction} fields={{ sourceProfileId: profile.id }} className="danger-button" label={<><Trash2 size={16} aria-hidden />Permanent verwijderen</>} confirmTitle="Bronprofiel permanent verwijderen?" confirmText="Dit bronprofiel en zijn configuratie worden definitief verwijderd. Deze actie kan niet ongedaan worden gemaakt." confirmLabel="Permanent verwijderen" /></div> : <div className="source-profile-card-actions"><Link className="secondary-button link-button source-profile-manage-button" href={`/admin/bronprofielen?profile=${encodeURIComponent(profile.id)}`}>{profile.canRename ? <Pencil size={16} aria-hidden /> : <Eye size={16} aria-hidden />}{profile.canRename ? "Beheren" : "Bekijken"}</Link>{profile.canCopy ? <Link className="secondary-button link-button source-profile-copy-button" href={`/admin/bronprofielen?copyProfile=${encodeURIComponent(profile.id)}`}><Copy size={16} aria-hidden />Kopiëren</Link> : null}{profile.canLink ? <Link className="secondary-button link-button source-profile-link-button" href={`/admin/bronprofielen?linkProfile=${encodeURIComponent(profile.id)}`}><Link2 size={16} aria-hidden />Koppelen</Link> : null}</div>}
  </article>)}</div>;
}

function CloseLink() { return <Link className="icon-button" href="/admin/bronprofielen" aria-label="Sluiten" title="Sluiten"><X size={18} aria-hidden /></Link>; }
function ReadonlyProfile({ name }: { name: string }) { return <div className="source-profile-readonly-field"><span>Bronprofiel</span><strong>{name}</strong></div>; }
function ErrorMessage({ text }: { text: string }) { return <p className="form-message" role="alert">{text}</p>; }
function DialogLinks({ submit, icon }: { submit: string; icon?: ReactNode }) { return <div className="source-profile-dialog-actions"><Link className="secondary-button link-button" href="/admin/bronprofielen">Annuleren</Link><button className="primary-button" type="submit">{icon}{submit}</button></div>; }

function profileFeedback(value: string | undefined): string | null {
  if (value === "renamed") return "Profielnaam gewijzigd.";
  if (value === "copied") return "Profiel gekopieerd en actief gemaakt in de gekozen leeromgeving.";
  if (value === "linked") return "Profiel gekoppeld en actief gemaakt in de gekozen leeromgeving.";
  if (value === "templateCopied") return "Sjabloon gekopieerd en actief gemaakt in de gekozen leeromgeving.";
  if (value === "archived") return "Bronprofiel gearchiveerd.";
  if (value === "restored") return "Bronprofiel hersteld.";
  if (value === "deleted") return "Bronprofiel permanent verwijderd.";
  if (value === "resourcesUpdated") return "Globale documenten opgeslagen.";
  if (value === "exerciseResourcesUpdated") return "Onderdelen per oefening opgeslagen.";
  if (value === "profileUpdated") return "Bronprofiel opgeslagen.";
  if (value === "profileSplit") return "Onafhankelijke profielkopie gemaakt en actief gezet in de gekozen leeromgeving.";
  return null;
}
function templateModal(value: string | undefined): SourceProfileTemplateModal | null { return value === "create" || value === "manage" || value === "default" || value === "copy" ? value : null; }
function templateFeedback(value: string | undefined): string | null { if (value === "created") return "Bronprofielsjabloon gemaakt."; if (value === "updated") return "Bronprofielsjabloon bijgewerkt."; if (value === "duplicated") return "Bronprofielsjabloon onafhankelijk gedupliceerd."; if (value === "default") return "Standaardsjabloon gewijzigd voor toekomstige leeromgevingen."; if (value === "archived") return "Bronprofielsjabloon gearchiveerd."; if (value === "restored") return "Bronprofielsjabloon hersteld."; if (value === "deleted") return "Bronprofielsjabloon permanent verwijderd."; if (value === "resourcesUpdated") return "Globale documenten van het sjabloon opgeslagen."; if (value === "exerciseResourcesUpdated") return "Onderdelen per oefening van het sjabloon opgeslagen."; return null; }
function initialSection(query: Query, editorProfiles: ManagedSourceProfile[]): SourceProfileSectionTab {
  if (query.tab === "editor" || query.tab === "templates" || query.tab === "owned") return query.tab;
  if (query.templateModal || query.template || query.templateError || query.templateSaved) return "templates";
  if (query.owner) return "editor";
  const profileId = query.profile ?? query.copyProfile ?? query.linkProfile;
  return profileId && editorProfiles.some((profile) => profile.id === profileId) ? "editor" : "owned";
}

function relatedArchiveHref(showArchive: boolean, ownerId: string | null): string {
  if (showArchive) return "/admin/bronprofielen?tab=editor";
  const owner = ownerId ? `&owner=${encodeURIComponent(ownerId)}` : "";
  return `/admin/bronprofielen?tab=editor&archive=1${owner}`;
}
