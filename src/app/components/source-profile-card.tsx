"use client";

import { Copy, Pencil, Plus, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import type { SourceProfileAdminModel } from "@/lib/source-profiles";

export type SourceProfileModal = "switch" | "rename" | "copy";

export interface SourceProfileCardActions {
  switchProfile: (formData: FormData) => Promise<void>;
  createOwnProfile: (formData: FormData) => Promise<void>;
  copyProfile: (formData: FormData) => Promise<void>;
  renameProfile: (formData: FormData) => Promise<void>;
}

export function SourceProfileCard({ learningSpaceId, model, actions, feedback, error, initialModal = null }: {
  learningSpaceId: string;
  model: SourceProfileAdminModel;
  actions: SourceProfileCardActions;
  feedback?: string;
  error?: string;
  initialModal?: SourceProfileModal | null;
}) {
  const { activeProfile, availableProfiles, copySources } = model;
  const [modal, setModal] = useState<SourceProfileModal | null>(() => allowedInitialModal(initialModal, activeProfile.type, copySources.length));
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const activeType = activeProfile.type === "built_in" ? "Ingebouwd profiel" : "Eigen profiel";
  const open = (next: SourceProfileModal, trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    setModal(next);
  };
  const close = useCallback(() => {
    setModal(null);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!modal) return;
    closeRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [close, modal]);

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
      <button className="secondary-button" type="button" onClick={(event) => open("switch", event.currentTarget)}><RefreshCw size={16} aria-hidden />Ander profiel kiezen</button>
      {activeProfile.type === "built_in" ? <form action={actions.createOwnProfile}>
        <input type="hidden" name="learningSpaceId" value={learningSpaceId} />
        <button className="secondary-button" type="submit"><Plus size={16} aria-hidden />Eigen profiel maken</button>
      </form> : <button className="secondary-button" type="button" onClick={(event) => open("rename", event.currentTarget)}><Pencil size={16} aria-hidden />Naam wijzigen</button>}
      {copySources.length > 0 ? <button className="secondary-button" type="button" onClick={(event) => open("copy", event.currentTarget)}><Copy size={16} aria-hidden />Profiel kopiëren</button> : null}
    </div>
    <p className="source-profile-footnote">De huidige scanner gebruikt deze configuratie nog niet.</p>
    {feedback ? <p className="success-message" role="status">{feedback}</p> : null}
    {error && !modal ? <p className="form-message" role="alert">{error}</p> : null}

    {modal ? <div className="confirm-backdrop" role="presentation">
      <div className="source-profile-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="source-profile-dialog-heading">
          <h2 id={titleId}>{modalTitle(modal)}</h2>
          <button ref={closeRef} className="icon-button" type="button" onClick={close} aria-label="Sluiten" title="Sluiten"><X size={18} aria-hidden /></button>
        </div>
        {modal === "switch" ? <form action={actions.switchProfile} className="source-profile-dialog-form">
          <input type="hidden" name="learningSpaceId" value={learningSpaceId} />
          <label>Beschikbaar bronprofiel<select name="sourceProfileId" defaultValue={activeProfile.id} required>
            {availableProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}{profile.managementLearningSpaceShortLabel ? ` — ${profile.managementLearningSpaceShortLabel}` : " — ingebouwd"}</option>)}
          </select></label>
          <ModalFooter cancel={close} submitLabel="Activeren" error={error} />
        </form> : null}
        {modal === "rename" ? <form action={actions.renameProfile} className="source-profile-dialog-form">
          <input type="hidden" name="learningSpaceId" value={learningSpaceId} />
          <input type="hidden" name="sourceProfileId" value={activeProfile.id} />
          <label>Profielnaam<input name="name" defaultValue={activeProfile.name} maxLength={80} required /></label>
          <ModalFooter cancel={close} submitLabel="Opslaan" error={error} />
        </form> : null}
        {modal === "copy" ? <form action={actions.copyProfile} className="source-profile-dialog-form">
          <input type="hidden" name="learningSpaceId" value={learningSpaceId} />
          <label>Profiel uit andere leeromgeving<select name="sourceLearningSpaceId" required defaultValue="">
            <option value="" disabled>Kies een leeromgeving</option>
            {copySources.map((source) => <option key={source.learningSpaceId} value={source.learningSpaceId}>{source.profile.name} — {source.learningSpaceShortLabel}</option>)}
          </select></label>
          <p>Er wordt een onafhankelijke kopie gemaakt. Latere wijzigingen aan het oorspronkelijke profiel hebben geen invloed op deze kopie.</p>
          <ModalFooter cancel={close} submitLabel="Kopiëren en activeren" error={error} />
        </form> : null}
      </div>
    </div> : null}
  </section>;
}

function ModalFooter({ cancel, submitLabel, error }: { cancel: () => void; submitLabel: string; error?: string }) {
  return <>
    {error ? <p className="form-message" role="alert">{error}</p> : null}
    <div className="source-profile-dialog-actions">
      <button className="secondary-button" type="button" onClick={cancel}>Annuleren</button>
      <button className="primary-button" type="submit">{submitLabel}</button>
    </div>
  </>;
}

function modalTitle(modal: SourceProfileModal): string {
  if (modal === "switch") return "Ander bronprofiel kiezen";
  if (modal === "rename") return "Profielnaam wijzigen";
  return "Bronprofiel kopiëren";
}

function allowedInitialModal(modal: SourceProfileModal | null, profileType: "built_in" | "custom", copySourceCount: number): SourceProfileModal | null {
  if (modal === "rename" && profileType !== "custom") return null;
  if (modal === "copy" && copySourceCount === 0) return null;
  return modal;
}
