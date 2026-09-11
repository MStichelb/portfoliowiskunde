"use client";

import { Copy, Pencil, Plus, RefreshCw, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import type { SourceProfileAdminModel } from "@/lib/source-profiles";
import type { SourceProfileTemplateSummary } from "@/lib/source-profile-templates";
import { sourceProfileUsageLabel } from "@/lib/source-profile-usage";

export type SourceProfileModal = "switch" | "rename" | "copy";

export interface SourceProfileCardActions {
  switchProfile: (formData: FormData) => Promise<void>;
  copyTemplate: (formData: FormData) => Promise<void>;
  createOwnProfile: (formData: FormData) => Promise<void>;
  copyProfile: (formData: FormData) => Promise<void>;
  renameProfile: (formData: FormData) => Promise<void>;
}

export function SourceProfileCard({ learningSpaceId, model, templates, canConfigure, actions, feedback, error, initialModal = null }: {
  learningSpaceId: string;
  model: SourceProfileAdminModel;
  templates: SourceProfileTemplateSummary[];
  canConfigure: boolean;
  actions: SourceProfileCardActions;
  feedback?: string;
  error?: string;
  initialModal?: SourceProfileModal | null;
}) {
  const { activeProfile, availableProfiles, copyTargets } = model;
  const [modal, setModal] = useState<SourceProfileModal | null>(() => allowedInitialModal(initialModal, activeProfile.type, copyTargets.length, canConfigure));
  const [switchSource, setSwitchSource] = useState<"profiles" | "templates">("profiles");
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const activeType = activeProfile.type === "built_in" ? "Ingebouwd profiel" : "Concreet profiel";
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
      {activeProfile.description ? <p>{displayProfileDescription(activeProfile.description)}</p> : null}
      <small>Configuratieversie {activeProfile.config.configVersion}</small>
    </div>
    <Link className="source-profile-management-link" href="/admin/bronprofielen">Bronprofielen {canConfigure ? "beheren" : "bekijken"}</Link>
    <div className="source-profile-actions">
      {canConfigure ? <button className="secondary-button" type="button" onClick={(event) => open("switch", event.currentTarget)}><RefreshCw size={16} aria-hidden />Ander profiel kiezen</button> : null}
      {canConfigure && activeProfile.type === "built_in" ? <form action={actions.createOwnProfile}>
        <input type="hidden" name="learningSpaceId" value={learningSpaceId} />
        <button className="secondary-button" type="submit"><Plus size={16} aria-hidden />Eigen profiel maken</button>
      </form> : canConfigure ? <button className="secondary-button" type="button" onClick={(event) => open("rename", event.currentTarget)}><Pencil size={16} aria-hidden />Naam wijzigen</button> : null}
      {copyTargets.length > 0 ? <button className="secondary-button source-profile-copy-button" type="button" onClick={(event) => open("copy", event.currentTarget)}><Copy size={16} aria-hidden />Profiel kopiëren</button> : null}
    </div>
    {!canConfigure ? <p className="source-profile-readonly-note">Als editor kun je profielen bekijken en kopiëren, maar niet wijzigen.</p> : null}
    <p className="source-profile-footnote">De huidige scanner gebruikt deze configuratie nog niet.</p>
    {feedback ? <p className="success-message" role="status">{feedback}</p> : null}
    {error && !modal ? <p className="form-message" role="alert">{error}</p> : null}

    {modal ? <div className="confirm-backdrop" role="presentation">
      <div className="source-profile-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="source-profile-dialog-heading">
          <h2 id={titleId}>{modalTitle(modal)}</h2>
          <button ref={closeRef} className="icon-button" type="button" onClick={close} aria-label="Sluiten" title="Sluiten"><X size={18} aria-hidden /></button>
        </div>
        {modal === "switch" ? <>
          <div className="source-profile-choice-toggle" role="group" aria-label="Bronprofielbasis">
            <button type="button" className={switchSource === "profiles" ? "is-active" : ""} aria-pressed={switchSource === "profiles"} onClick={() => setSwitchSource("profiles")}>Eigen profielen</button>
            <button type="button" className={switchSource === "templates" ? "is-active" : ""} aria-pressed={switchSource === "templates"} onClick={() => setSwitchSource("templates")}>Sjablonen</button>
          </div>
          {switchSource === "profiles" ? <form action={actions.switchProfile} className="source-profile-dialog-form">
          <input type="hidden" name="learningSpaceId" value={learningSpaceId} />
          <label>Beschikbaar bronprofiel<select name="sourceProfileId" defaultValue={activeProfile.id} required>
            {availableProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} — {sourceProfileUsageLabel(profile.usages, "inactief")}</option>)}
          </select></label>
          <ModalFooter cancel={close} submitLabel="Activeren" error={error} />
          </form> : <form action={actions.copyTemplate} className="source-profile-dialog-form">
            <input type="hidden" name="learningSpaceId" value={learningSpaceId} />
            <label>Appbreed sjabloon<select name="templateId" required defaultValue="">
              <option value="" disabled>Kies een sjabloon</option>
              {templates.map((template) => <option key={template.id} value={template.id}>{template.name}{template.isDefault ? " — Standaard" : ""}</option>)}
            </select></label>
            <p>Het sjabloon wordt eerst een onafhankelijk concreet profiel. Latere sjabloonwijzigingen werken niet door.</p>
            <ModalFooter cancel={close} submitLabel="Kopiëren en activeren" error={error} />
          </form>}
        </> : null}
        {modal === "rename" ? <form action={actions.renameProfile} className="source-profile-dialog-form">
          <input type="hidden" name="learningSpaceId" value={learningSpaceId} />
          <input type="hidden" name="sourceProfileId" value={activeProfile.id} />
          <label>Profielnaam<input name="name" defaultValue={activeProfile.name} maxLength={80} required /></label>
          <ModalFooter cancel={close} submitLabel="Opslaan" error={error} />
        </form> : null}
        {modal === "copy" ? <form action={actions.copyProfile} className="source-profile-dialog-form">
          <input type="hidden" name="learningSpaceId" value={learningSpaceId} />
          <div className="source-profile-readonly-field"><span>Bronprofiel</span><strong>{activeProfile.name}</strong></div>
          <label>Toepassen op leeromgeving<select name="targetLearningSpaceId" required defaultValue={learningSpaceId}>
            {copyTargets.map((target) => <option key={target.learningSpaceId} value={target.learningSpaceId}>{target.learningSpaceShortLabel} — {target.profile.name}</option>)}
          </select></label>
          <p>Er wordt een onafhankelijke kopie gemaakt. Latere wijzigingen aan het oorspronkelijke profiel hebben geen invloed op deze kopie.</p>
          <ModalFooter cancel={close} submitLabel="Kopiëren" error={error} submitClassName="source-profile-copy-button" />
        </form> : null}
      </div>
    </div> : null}
  </section>;
}

export function displayProfileDescription(description: string): string {
  return description === "Appbreed standaardsjabloon voor de huidige portfolio- en bestandsconventies."
    ? "Gebaseerd op het appbrede standaardsjabloon."
    : description;
}

function ModalFooter({ cancel, submitLabel, error, submitClassName }: { cancel: () => void; submitLabel: string; error?: string; submitClassName?: string }) {
  return <>
    {error ? <p className="form-message" role="alert">{error}</p> : null}
    <div className="source-profile-dialog-actions">
      <button className="secondary-button" type="button" onClick={cancel}>Annuleren</button>
      <button className={`primary-button${submitClassName ? ` ${submitClassName}` : ""}`} type="submit">{submitLabel}</button>
    </div>
  </>;
}

function modalTitle(modal: SourceProfileModal): string {
  if (modal === "switch") return "Ander bronprofiel kiezen";
  if (modal === "rename") return "Profielnaam wijzigen";
  return "Bronprofiel kopiëren";
}

function allowedInitialModal(modal: SourceProfileModal | null, profileType: "built_in" | "custom", copySourceCount: number, canConfigure: boolean): SourceProfileModal | null {
  if ((modal === "switch" || modal === "rename") && !canConfigure) return null;
  if (modal === "rename" && profileType !== "custom") return null;
  if (modal === "copy" && copySourceCount === 0) return null;
  return modal;
}
