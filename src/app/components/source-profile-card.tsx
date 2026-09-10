import { Copy, Pencil, Plus, RefreshCw } from "lucide-react";

import type { SourceProfileAdminModel } from "@/lib/source-profiles";

export interface SourceProfileCardActions {
  switchProfile: (formData: FormData) => Promise<void>;
  createOwnProfile: (formData: FormData) => Promise<void>;
  copyProfile: (formData: FormData) => Promise<void>;
  renameProfile: (formData: FormData) => Promise<void>;
}

export function SourceProfileCard({ learningSpaceId, model, actions, feedback, error }: {
  learningSpaceId: string;
  model: SourceProfileAdminModel;
  actions: SourceProfileCardActions;
  feedback?: string;
  error?: string;
}) {
  const { activeProfile, availableProfiles, copySources } = model;
  const activeType = activeProfile.type === "built_in" ? "Ingebouwd profiel" : "Eigen profiel";
  return <section className="settings-card source-profile-card" aria-labelledby="source-profile-heading">
    <div className="source-profile-heading">
      <div>
        <h2 id="source-profile-heading">Bronprofiel</h2>
        <p>Het bronprofiel bepaalt hoe bestanden en mappen in de bron worden geïnterpreteerd.</p>
      </div>
      <span className={activeProfile.type === "built_in" ? "source-role-badge" : "active-source-badge"}>{activeType}</span>
    </div>
    <div className="source-profile-summary">
      <span>Actief profiel</span>
      <strong>{activeProfile.name}</strong>
      {activeProfile.description ? <p>{activeProfile.description}</p> : null}
      <small>Configuratieversie {activeProfile.config.configVersion}</small>
    </div>
    <div className="source-profile-actions">
      <details>
        <summary className="secondary-button"><RefreshCw size={16} aria-hidden />Ander profiel kiezen</summary>
        <form action={actions.switchProfile}>
          <input type="hidden" name="learningSpaceId" value={learningSpaceId} />
          <label>Beschikbaar bronprofiel<select name="sourceProfileId" defaultValue={activeProfile.id} required>
            {availableProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}{profile.managementLearningSpaceShortLabel ? ` — ${profile.managementLearningSpaceShortLabel}` : " — ingebouwd"}</option>)}
          </select></label>
          <button className="primary-button" type="submit">Activeren</button>
        </form>
      </details>
      {activeProfile.type === "built_in" ? <form action={actions.createOwnProfile}>
        <input type="hidden" name="learningSpaceId" value={learningSpaceId} />
        <button className="secondary-button" type="submit"><Plus size={16} aria-hidden />Eigen profiel maken</button>
      </form> : <details>
        <summary className="secondary-button"><Pencil size={16} aria-hidden />Naam wijzigen</summary>
        <form action={actions.renameProfile}>
          <input type="hidden" name="learningSpaceId" value={learningSpaceId} />
          <input type="hidden" name="sourceProfileId" value={activeProfile.id} />
          <label>Profielnaam<input name="name" defaultValue={activeProfile.name} maxLength={80} required /></label>
          <button className="primary-button" type="submit">Opslaan</button>
        </form>
      </details>}
      {copySources.length > 0 ? <details>
        <summary className="secondary-button"><Copy size={16} aria-hidden />Profiel kopiëren</summary>
        <form action={actions.copyProfile}>
          <input type="hidden" name="learningSpaceId" value={learningSpaceId} />
          <label>Profiel uit andere leeromgeving<select name="sourceLearningSpaceId" required defaultValue="">
            <option value="" disabled>Kies een leeromgeving</option>
            {copySources.map((source) => <option key={source.learningSpaceId} value={source.learningSpaceId}>{source.profile.name} — {source.learningSpaceShortLabel}</option>)}
          </select></label>
          <button className="primary-button" type="submit">Kopiëren en activeren</button>
        </form>
      </details> : null}
    </div>
    <p className="source-profile-footnote">De huidige scanner gebruikt deze configuratie nog niet.</p>
    {feedback ? <p className="success-message" role="status">{feedback}</p> : null}
    {error ? <p className="form-message" role="alert">{error}</p> : null}
  </section>;
}
