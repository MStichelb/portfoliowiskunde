import { ArrowLeft, Pencil, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";

import { requireAdminUser } from "@/lib/auth";
import { getManagedSourceProfiles, sourceProfileUsageLabel } from "@/lib/source-profiles";

import { renameManagedSourceProfileAction } from "./actions";

export const dynamic = "force-dynamic";

interface SourceProfilesPageQuery {
  profile?: string;
  error?: string;
  saved?: string;
}

export default async function SourceProfilesPage({ searchParams }: { searchParams: Promise<SourceProfilesPageQuery> }) {
  const user = await requireAdminUser();
  const [profiles, query] = await Promise.all([getManagedSourceProfiles(user), searchParams]);
  const selectedProfile = profiles.find((profile) => profile.id === query.profile) ?? null;

  return <main className="page-shell admin-page source-profiles-page">
    <Link className="secondary-button compact-back-button" href="/admin"><ArrowLeft size={16} aria-hidden />Terug naar beheer</Link>
    <header className="page-header">
      <p className="eyebrow">Beheer</p>
      <h1>Bronprofielen</h1>
      <p>Bekijk en beheer concrete bronprofielen en zie in welke leeromgevingen ze momenteel actief zijn.</p>
    </header>
    {query.saved === "renamed" ? <p className="success-message" role="status">Profielnaam gewijzigd.</p> : null}
    <section aria-labelledby="managed-source-profiles-heading">
      <div className="source-profile-overview-heading">
        <div><h2 id="managed-source-profiles-heading">Mijn bronprofielen</h2><p>De beheercontext bepaalt wie een profiel mag aanpassen; gebruik wordt afzonderlijk uit de actuele koppelingen afgeleid.</p></div>
        <span className="source-role-badge">{profiles.length} {profiles.length === 1 ? "profiel" : "profielen"}</span>
      </div>
      {profiles.length === 0 ? <p className="empty-state">Je beheert momenteel geen bronprofielen.</p> : <div className="source-profile-overview-list">
        {profiles.map((profile) => <article className="source-profile-overview-card" key={profile.id}>
          <div className="source-profile-overview-copy">
            <div className="source-profile-overview-title"><SlidersHorizontal size={18} aria-hidden /><h3>{profile.name}</h3></div>
            <small>Configuratieversie {profile.config.configVersion}</small>
            <p className={profile.isInactive ? "source-profile-inactive" : undefined}>
              {profile.isInactive ? "Inactief" : <>Gebruikt in: <strong>{sourceProfileUsageLabel(profile.usages)}</strong></>}
            </p>
            <small>{profile.usageCount} {profile.usageCount === 1 ? "actieve leeromgeving" : "actieve leeromgevingen"}</small>
          </div>
          <Link className="secondary-button link-button source-profile-manage-button" href={`/admin/bronprofielen?profile=${encodeURIComponent(profile.id)}`}><Pencil size={16} aria-hidden />Beheren</Link>
        </article>)}
      </div>}
    </section>

    {selectedProfile ? <div className="confirm-backdrop" role="presentation">
      <div className="source-profile-dialog" role="dialog" aria-modal="true" aria-labelledby="manage-source-profile-title">
        <div className="source-profile-dialog-heading">
          <h2 id="manage-source-profile-title">Bronprofiel beheren</h2>
          <Link className="icon-button" href="/admin/bronprofielen" aria-label="Sluiten" title="Sluiten"><X size={18} aria-hidden /></Link>
        </div>
        <div className="source-profile-central-usage">
          <strong>{selectedProfile.isInactive ? "Inactief" : `Gebruikt in: ${sourceProfileUsageLabel(selectedProfile.usages)}`}</strong>
          <small>{selectedProfile.usageCount} {selectedProfile.usageCount === 1 ? "actieve leeromgeving" : "actieve leeromgevingen"}</small>
        </div>
        <form action={renameManagedSourceProfileAction} className="source-profile-dialog-form">
          <input type="hidden" name="sourceProfileId" value={selectedProfile.id} />
          <label>Profielnaam<input name="name" defaultValue={selectedProfile.name} maxLength={80} required /></label>
          {query.error ? <p className="form-message" role="alert">{query.error}</p> : null}
          <div className="source-profile-dialog-actions">
            <Link className="secondary-button link-button" href="/admin/bronprofielen">Annuleren</Link>
            <button className="primary-button" type="submit">Opslaan</button>
          </div>
        </form>
      </div>
    </div> : null}
  </main>;
}
