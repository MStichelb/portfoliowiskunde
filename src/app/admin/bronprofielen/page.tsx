import { ArrowLeft, Copy, Eye, Link2, Pencil, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { SourceProfileSectionTabs } from "@/app/components/source-profile-section-tabs";
import { SourceProfileTemplateManager, type SourceProfileTemplateModal } from "@/app/components/source-profile-template-manager";
import { requireAdminUser } from "@/lib/auth";
import { getManagedSourceProfiles, getSourceProfileCopyTargets, sourceProfileUsageLabel } from "@/lib/source-profiles";
import { listSourceProfileTemplates } from "@/lib/source-profile-templates";
import { createSourceProfileTemplateAction, copyManagedSourceProfileAction, copyManagedSourceProfileTemplateAction, duplicateSourceProfileTemplateAction, linkManagedSourceProfileAction, renameManagedSourceProfileAction, setDefaultSourceProfileTemplateAction, updateSourceProfileTemplateAction } from "./actions";

export const dynamic = "force-dynamic";

interface Query { profile?: string; copyProfile?: string; linkProfile?: string; error?: string; saved?: string; template?: string; templateError?: string; templateModal?: string; templateSaved?: string }

export default async function SourceProfilesPage({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await requireAdminUser();
  const [profiles, copyTargets, query, templates] = await Promise.all([getManagedSourceProfiles(user), getSourceProfileCopyTargets(user), searchParams, listSourceProfileTemplates(user)]);
  const selectedProfile = profiles.find((profile) => profile.id === query.profile) ?? null;
  const copyProfile = profiles.find((profile) => profile.id === query.copyProfile) ?? null;
  const linkProfile = profiles.find((profile) => profile.id === query.linkProfile && profile.canRename) ?? null;
  const linkTargets = copyTargets.filter((target) => target.canConfigure);

  const profileSection = <section aria-labelledby="managed-source-profiles-heading">
    <div className="source-profile-overview-heading"><div><h2 id="managed-source-profiles-heading">Mijn bronprofielen</h2><p>Bekijk het actuele gebruik en beheer, kopieer of koppel een profiel volgens je rechten.</p></div><span className="source-role-badge">{profiles.length} {profiles.length === 1 ? "profiel" : "profielen"}</span></div>
    {profiles.length === 0 ? <p className="empty-state">Je beheert momenteel geen bronprofielen.</p> : <div className="source-profile-overview-list">{profiles.map((profile) => <article className="source-profile-overview-card" key={profile.id}>
      <div className="source-profile-overview-copy"><div className="source-profile-overview-title"><SlidersHorizontal size={18} aria-hidden /><h3>{profile.name}</h3>{profile.usageCount > 1 ? <span className="source-profile-shared-icon" title="Gedeeld profiel"><Link2 size={15} aria-hidden /><span className="sr-only">Gedeeld profiel</span></span> : null}</div><p className={profile.isInactive ? "source-profile-inactive" : undefined}>{profile.isInactive ? "Inactief" : <>Gebruikt in: <strong>{sourceProfileUsageLabel(profile.usages)}</strong></>}</p>{!profile.canRename && profile.ownerNames.length > 0 ? <small>{ownerLabel(profile.ownerNames)}</small> : null}</div>
      <div className="source-profile-card-actions"><Link className="secondary-button link-button source-profile-manage-button" href={`/admin/bronprofielen?profile=${encodeURIComponent(profile.id)}`}>{profile.canRename ? <Pencil size={16} aria-hidden /> : <Eye size={16} aria-hidden />}{profile.canRename ? "Beheren" : "Bekijken"}</Link><Link className="secondary-button link-button source-profile-copy-button" href={`/admin/bronprofielen?copyProfile=${encodeURIComponent(profile.id)}`}><Copy size={16} aria-hidden />Kopiëren</Link>{profile.canRename ? <Link className="secondary-button link-button source-profile-link-button" href={`/admin/bronprofielen?linkProfile=${encodeURIComponent(profile.id)}`}><Link2 size={16} aria-hidden />Koppelen</Link> : null}</div>
    </article>)}</div>}
  </section>;

  const templateSection = <SourceProfileTemplateManager key={`${query.templateSaved ?? ""}:${query.templateError ?? ""}:${query.templateModal ?? ""}:${query.template ?? ""}`} templates={templates} copyTargets={copyTargets} canManage={user.role === "superadmin"} actions={{ create: createSourceProfileTemplateAction, update: updateSourceProfileTemplateAction, duplicate: duplicateSourceProfileTemplateAction, setDefault: setDefaultSourceProfileTemplateAction, copy: copyManagedSourceProfileTemplateAction }} initialModal={templateModal(query.templateModal)} initialTemplateId={query.template} error={query.templateError} />;

  return <main className="page-shell admin-page source-profiles-page">
    <Link className="secondary-button compact-back-button" href="/admin"><ArrowLeft size={16} aria-hidden />Terug naar beheer</Link>
    <header className="page-header"><p className="eyebrow">Beheer</p><h1>Bronprofielen</h1><p>Bekijk en beheer concrete bronprofielen en appbrede sjablonen.</p></header>
    {profileFeedback(query.saved) ? <p className="success-message" role="status">{profileFeedback(query.saved)}</p> : null}
    {query.error && !selectedProfile && !copyProfile && !linkProfile ? <p className="form-message" role="alert">{query.error}</p> : null}
    {templateFeedback(query.templateSaved) ? <p className="success-message" role="status">{templateFeedback(query.templateSaved)}</p> : null}
    <SourceProfileSectionTabs profileSection={profileSection} templateSection={templateSection} templateLabel={user.role === "superadmin" ? "Appbrede sjablonen" : "Sjablonen"} initialTab={query.templateModal || query.template || query.templateError || query.templateSaved ? "templates" : "profiles"} />

    {selectedProfile ? <div className="confirm-backdrop" role="presentation"><div className="source-profile-dialog" role="dialog" aria-modal="true" aria-labelledby="manage-source-profile-title">
      <div className="source-profile-dialog-heading"><h2 id="manage-source-profile-title">Bronprofiel {selectedProfile.canRename ? "beheren" : "bekijken"}</h2><CloseLink /></div>
      <div className="source-profile-central-usage">{selectedProfile.canRename ? null : <strong>{selectedProfile.name}</strong>}<span>{selectedProfile.isInactive ? "Inactief" : `Gebruikt in: ${sourceProfileUsageLabel(selectedProfile.usages)}`}</span></div>
      {selectedProfile.usageCount > 1 ? <SharedWarning profile={selectedProfile} /> : null}
      {selectedProfile.canRename ? <form action={renameManagedSourceProfileAction} className="source-profile-dialog-form"><input type="hidden" name="sourceProfileId" value={selectedProfile.id} /><label>Profielnaam<input name="name" defaultValue={selectedProfile.name} maxLength={80} required /></label>{selectedProfile.usageCount > 1 ? <label className="source-profile-shared-confirm"><input type="checkbox" name="confirmShared" value="all" required />Ik bevestig dat de naam in alle gekoppelde leeromgevingen wijzigt.</label> : null}{query.error ? <ErrorMessage text={query.error} /> : null}<DialogLinks submit={selectedProfile.usageCount > 1 ? "Voor alle aanpassen" : "Opslaan"} /></form> : <div className="source-profile-dialog-form"><p>Als editor kun je dit profiel bekijken en kopiëren, maar niet wijzigen.</p><div className="source-profile-dialog-actions"><Link className="secondary-button link-button" href="/admin/bronprofielen">Sluiten</Link></div></div>}
    </div></div> : null}

    {copyProfile ? <div className="confirm-backdrop" role="presentation"><div className="source-profile-dialog" role="dialog" aria-modal="true" aria-labelledby="copy-source-profile-title"><div className="source-profile-dialog-heading"><h2 id="copy-source-profile-title">Bronprofiel kopiëren</h2><CloseLink /></div><form action={copyManagedSourceProfileAction} className="source-profile-dialog-form"><input type="hidden" name="sourceProfileId" value={copyProfile.id} /><ReadonlyProfile name={copyProfile.name} /><label>Doelleeromgeving<select name="targetLearningSpaceId" required defaultValue=""><option value="" disabled>Kies een leeromgeving</option>{copyTargets.map((target) => <option key={target.learningSpaceId} value={target.learningSpaceId}>{target.learningSpaceShortLabel} — {target.profile.name}</option>)}</select></label><p>Er wordt een onafhankelijke kopie gemaakt. Latere wijzigingen aan het oorspronkelijke profiel hebben geen invloed op deze kopie.</p><p>Als je de doelomgeving kunt configureren, wordt de kopie daar meteen actief. Anders moet een eigenaar ze nog activeren.</p>{query.error ? <ErrorMessage text={query.error} /> : null}<DialogLinks submit="Kopiëren" icon={<Copy size={16} aria-hidden />} /></form></div></div> : null}

    {linkProfile ? <div className="confirm-backdrop" role="presentation"><div className="source-profile-dialog" role="dialog" aria-modal="true" aria-labelledby="link-source-profile-title"><div className="source-profile-dialog-heading"><h2 id="link-source-profile-title">Bronprofiel koppelen</h2><CloseLink /></div><form action={linkManagedSourceProfileAction} className="source-profile-dialog-form"><input type="hidden" name="sourceProfileId" value={linkProfile.id} /><ReadonlyProfile name={linkProfile.name} /><label>Koppelen aan leeromgeving<select name="targetLearningSpaceId" required defaultValue=""><option value="" disabled>Kies een leeromgeving</option>{linkTargets.map((target) => <option key={target.learningSpaceId} value={target.learningSpaceId}>{target.learningSpaceShortLabel} — {target.profile.name}</option>)}</select></label><div className="source-profile-shared-warning"><strong><Link2 size={16} aria-hidden />Gedeeld profiel</strong><p>Dit bronprofiel wordt gedeeld. Latere wijzigingen aan dit profiel gelden voor alle gekoppelde leeromgevingen.</p></div>{query.error ? <ErrorMessage text={query.error} /> : null}<DialogLinks submit="Koppelen" icon={<Link2 size={16} aria-hidden />} /></form></div></div> : null}
  </main>;
}

function CloseLink() { return <Link className="icon-button" href="/admin/bronprofielen" aria-label="Sluiten" title="Sluiten"><X size={18} aria-hidden /></Link>; }
function ReadonlyProfile({ name }: { name: string }) { return <div className="source-profile-readonly-field"><span>Bronprofiel</span><strong>{name}</strong></div>; }
function ErrorMessage({ text }: { text: string }) { return <p className="form-message" role="alert">{text}</p>; }
function DialogLinks({ submit, icon }: { submit: string; icon?: ReactNode }) { return <div className="source-profile-dialog-actions"><Link className="secondary-button link-button" href="/admin/bronprofielen">Annuleren</Link><button className="primary-button" type="submit">{icon}{submit}</button></div>; }
function SharedWarning({ profile }: { profile: Awaited<ReturnType<typeof getManagedSourceProfiles>>[number] }) { return <div className="source-profile-shared-warning"><strong><Link2 size={16} aria-hidden />Dit profiel is gedeeld.</strong><p>Een wijziging hier geldt voor alle gekoppelde leeromgevingen:</p><ul>{profile.usages.map((usage) => <li key={usage.learningSpaceId}>{usage.learningSpaceShortLabel}</li>)}</ul></div>; }
function ownerLabel(ownerNames: string[]): string { return ownerNames.length === 1 ? `Eigenaar: ${ownerNames[0]}` : `Eigenaars: ${ownerNames[0]} +${ownerNames.length - 1}`; }

function profileFeedback(value: string | undefined): string | null {
  if (value === "renamed") return "Profielnaam gewijzigd.";
  if (value === "copied") return "Profiel gekopieerd en actief gemaakt in de gekozen leeromgeving.";
  if (value === "copiedInactive") return "Profiel gekopieerd. Een eigenaar moet het profiel nog activeren.";
  if (value === "linked") return "Profiel gekoppeld en actief gemaakt in de gekozen leeromgeving.";
  if (value === "templateCopied") return "Sjabloon gekopieerd en actief gemaakt in de gekozen leeromgeving.";
  if (value === "templateCopiedInactive") return "Sjabloon gekopieerd. Een eigenaar moet het profiel nog activeren.";
  return null;
}
function templateModal(value: string | undefined): SourceProfileTemplateModal | null { return value === "create" || value === "manage" || value === "default" || value === "copy" ? value : null; }
function templateFeedback(value: string | undefined): string | null { if (value === "created") return "Bronprofielsjabloon gemaakt."; if (value === "updated") return "Bronprofielsjabloon bijgewerkt."; if (value === "duplicated") return "Bronprofielsjabloon onafhankelijk gedupliceerd."; if (value === "default") return "Standaardsjabloon gewijzigd voor toekomstige leeromgevingen."; return null; }
