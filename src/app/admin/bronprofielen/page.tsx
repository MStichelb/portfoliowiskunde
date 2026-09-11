import { ArrowLeft, Copy, Eye, Pencil, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";

import { SourceProfileTemplateManager, type SourceProfileTemplateModal } from "@/app/components/source-profile-template-manager";
import { requireAdminUser } from "@/lib/auth";
import { getManagedSourceProfiles, getSourceProfileCopyTargets, sourceProfileUsageLabel } from "@/lib/source-profiles";
import { listSourceProfileTemplates } from "@/lib/source-profile-templates";

import {
  createSourceProfileTemplateAction,
  copyManagedSourceProfileAction,
  copyManagedSourceProfileTemplateAction,
  duplicateSourceProfileTemplateAction,
  renameManagedSourceProfileAction,
  setDefaultSourceProfileTemplateAction,
  updateSourceProfileTemplateAction,
} from "./actions";

export const dynamic = "force-dynamic";

interface SourceProfilesPageQuery {
  profile?: string;
  error?: string;
  saved?: string;
  template?: string;
  templateError?: string;
  templateModal?: string;
  templateSaved?: string;
}

export default async function SourceProfilesPage({ searchParams }: { searchParams: Promise<SourceProfilesPageQuery> }) {
  const user = await requireAdminUser();
  const [profiles, copyTargets, query, templates] = await Promise.all([
    getManagedSourceProfiles(user),
    getSourceProfileCopyTargets(user),
    searchParams,
    listSourceProfileTemplates(user),
  ]);
  const selectedProfile = profiles.find((profile) => profile.id === query.profile) ?? null;

  return <main className="page-shell admin-page source-profiles-page">
    <Link className="secondary-button compact-back-button" href="/admin"><ArrowLeft size={16} aria-hidden />Terug naar beheer</Link>
    <header className="page-header">
      <p className="eyebrow">Beheer</p>
      <h1>Bronprofielen</h1>
      <p>Bekijk en beheer concrete bronprofielen en zie in welke leeromgevingen ze momenteel actief zijn.</p>
    </header>
    {profileFeedback(query.saved) ? <p className="success-message" role="status">{profileFeedback(query.saved)}</p> : null}
    {query.error && !selectedProfile ? <p className="form-message" role="alert">{query.error}</p> : null}
    {templateFeedback(query.templateSaved) ? <p className="success-message" role="status">{templateFeedback(query.templateSaved)}</p> : null}
    <section aria-labelledby="managed-source-profiles-heading">
      <div className="source-profile-overview-heading">
        <div><h2 id="managed-source-profiles-heading">Mijn bronprofielen</h2><p>De beheercontext bepaalt wie een profiel mag aanpassen; gebruik wordt afzonderlijk uit de actuele koppelingen afgeleid.</p></div>
        <span className="source-role-badge">{profiles.length} {profiles.length === 1 ? "profiel" : "profielen"}</span>
      </div>
      {profiles.length === 0 ? <p className="empty-state">Je beheert momenteel geen bronprofielen.</p> : <div className="source-profile-overview-list">
        {profiles.map((profile) => <article className="source-profile-overview-card" key={profile.id}>
          <div className="source-profile-overview-copy">
            <div className="source-profile-overview-title"><SlidersHorizontal size={18} aria-hidden /><h3>{profile.name}</h3></div>
            <p className={profile.isInactive ? "source-profile-inactive" : undefined}>
              {profile.isInactive ? "Inactief" : <>Gebruikt in: <strong>{sourceProfileUsageLabel(profile.usages)}</strong></>}
            </p>
            <small>{profile.usageCount} {profile.usageCount === 1 ? "actieve leeromgeving" : "actieve leeromgevingen"}</small>
          </div>
          <Link className="secondary-button link-button source-profile-manage-button" href={`/admin/bronprofielen?profile=${encodeURIComponent(profile.id)}`}>{profile.canRename ? <Pencil size={16} aria-hidden /> : <Eye size={16} aria-hidden />}{profile.canRename ? "Beheren" : "Bekijken"}</Link>
        </article>)}
      </div>}
    </section>

    {user.role === "superadmin" ? <SourceProfileTemplateManager
      key={`${query.templateSaved ?? ""}:${query.templateError ?? ""}:${query.templateModal ?? ""}:${query.template ?? ""}`}
      templates={templates}
      actions={{
        create: createSourceProfileTemplateAction,
        update: updateSourceProfileTemplateAction,
        duplicate: duplicateSourceProfileTemplateAction,
        setDefault: setDefaultSourceProfileTemplateAction,
      }}
      initialModal={templateModal(query.templateModal)}
      initialTemplateId={query.template}
      error={query.templateError}
    /> : <section className="source-profile-template-section" aria-labelledby="source-profile-templates-heading">
      <div className="source-profile-overview-heading"><div><h2 id="source-profile-templates-heading">Appbrede sjablonen</h2><p>Sjablonen zijn alleen-lezen vertrekpunten voor nieuwe, onafhankelijke profielen.</p></div></div>
      <div className="source-profile-overview-list">{templates.map((template) => <article className="source-profile-overview-card" key={template.id}>
        <div className="source-profile-overview-copy"><div className="source-profile-template-title"><div className="source-profile-overview-title"><SlidersHorizontal size={18} aria-hidden /><h3>{template.name}</h3></div>{template.isDefault ? <span className="active-source-badge">Standaard</span> : null}</div><small>Configuratieversie {template.configVersion}</small>{template.description ? <p>{template.description}</p> : null}</div>
        <form action={copyManagedSourceProfileTemplateAction} className="source-profile-template-copy-form"><input type="hidden" name="templateId" value={template.id} /><label>Toepassen op leeromgeving<select name="managementLearningSpaceId" required>{copyTargets.map((target) => <option key={target.learningSpaceId} value={target.learningSpaceId}>{target.learningSpaceShortLabel} — {target.profile.name}</option>)}</select></label><button className="secondary-button source-profile-copy-button" type="submit"><Copy size={16} aria-hidden />Kopiëren</button></form>
      </article>)}</div>
    </section>}

    {selectedProfile ? <div className="confirm-backdrop" role="presentation">
      <div className="source-profile-dialog" role="dialog" aria-modal="true" aria-labelledby="manage-source-profile-title">
        <div className="source-profile-dialog-heading">
          <h2 id="manage-source-profile-title">Bronprofiel beheren</h2>
          <Link className="icon-button" href="/admin/bronprofielen" aria-label="Sluiten" title="Sluiten"><X size={18} aria-hidden /></Link>
        </div>
        <div className="source-profile-central-usage">
          <strong>{selectedProfile.isInactive ? "Inactief" : `Gebruikt in: ${sourceProfileUsageLabel(selectedProfile.usages)}`}</strong>
          <small>{selectedProfile.usageCount} {selectedProfile.usageCount === 1 ? "actieve leeromgeving" : "actieve leeromgevingen"}</small>
          <small>Configuratieversie {selectedProfile.config.configVersion}</small>
        </div>
        {selectedProfile.canRename ? <form action={renameManagedSourceProfileAction} className="source-profile-dialog-form">
          <input type="hidden" name="sourceProfileId" value={selectedProfile.id} />
          <label>Profielnaam<input name="name" defaultValue={selectedProfile.name} maxLength={80} required /></label>
          {query.error ? <p className="form-message" role="alert">{query.error}</p> : null}
          <div className="source-profile-dialog-actions">
            <Link className="secondary-button link-button" href="/admin/bronprofielen">Annuleren</Link>
            <button className="primary-button" type="submit">Opslaan</button>
          </div>
        </form> : <div className="source-profile-dialog-form"><p>Je kunt dit profiel en het actuele gebruik bekijken. Als editor kun je het bestaande profiel niet hernoemen.</p><div className="source-profile-dialog-actions"><Link className="secondary-button link-button" href="/admin/bronprofielen">Sluiten</Link></div></div>}
        <form action={copyManagedSourceProfileAction} className="source-profile-dialog-form">
          <input type="hidden" name="sourceProfileId" value={selectedProfile.id} />
          <div className="source-profile-readonly-field"><span>Bronprofiel</span><strong>{selectedProfile.name}</strong></div>
          <label>Toepassen op leeromgeving<select name="targetLearningSpaceId" required>{copyTargets.map((target) => <option key={target.learningSpaceId} value={target.learningSpaceId}>{target.learningSpaceShortLabel} — {target.profile.name}</option>)}</select></label>
          <p>Maak een onafhankelijke kopie. De actieve configuratie van de gekozen leeromgeving verandert niet.</p>
          <div className="source-profile-dialog-actions"><button className="secondary-button source-profile-copy-button" type="submit"><Copy size={16} aria-hidden />Profiel kopiëren</button></div>
        </form>
      </div>
    </div> : null}
  </main>;
}

function profileFeedback(value: string | undefined): string | null {
  if (value === "renamed") return "Profielnaam gewijzigd.";
  if (value === "copied") return "Profiel gekopieerd. De actieve configuratie is niet gewijzigd.";
  if (value === "templateCopied") return "Sjabloon gekopieerd. De actieve configuratie is niet gewijzigd.";
  return null;
}

function templateModal(value: string | undefined): SourceProfileTemplateModal | null {
  return value === "create" || value === "manage" || value === "default" ? value : null;
}

function templateFeedback(value: string | undefined): string | null {
  if (value === "created") return "Bronprofielsjabloon gemaakt.";
  if (value === "updated") return "Bronprofielsjabloon bijgewerkt.";
  if (value === "duplicated") return "Bronprofielsjabloon onafhankelijk gedupliceerd.";
  if (value === "default") return "Standaardsjabloon gewijzigd voor toekomstige leeromgevingen.";
  return null;
}
