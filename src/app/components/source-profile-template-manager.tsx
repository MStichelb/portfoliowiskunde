"use client";

import { Copy, Plus, Settings2, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

import type { SourceProfileTemplateSummary } from "@/lib/source-profile-templates";
import type { SourceProfileCopyTarget } from "@/lib/source-profiles";

export type SourceProfileTemplateModal = "create" | "manage" | "default" | "copy";

export interface SourceProfileTemplateActions {
  create: (formData: FormData) => Promise<void>;
  update: (formData: FormData) => Promise<void>;
  duplicate: (formData: FormData) => Promise<void>;
  setDefault: (formData: FormData) => Promise<void>;
  copy: (formData: FormData) => Promise<void>;
}

export function SourceProfileTemplateManager({ templates, copyTargets, canManage, actions, initialModal = null, initialTemplateId, error }: {
  templates: SourceProfileTemplateSummary[];
  copyTargets: SourceProfileCopyTarget[];
  canManage: boolean;
  actions: SourceProfileTemplateActions;
  initialModal?: SourceProfileTemplateModal | null;
  initialTemplateId?: string;
  error?: string;
}) {
  const initial = allowedInitialModal(initialModal, initialTemplateId, templates, canManage, copyTargets.length > 0);
  const [modal, setModal] = useState<SourceProfileTemplateModal | null>(initial.modal);
  const [templateId, setTemplateId] = useState<string | null>(initial.templateId);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const selected = templates.find((template) => template.id === templateId) ?? null;
  const defaultTemplate = templates.find((template) => template.isDefault) ?? null;

  const open = (nextModal: SourceProfileTemplateModal, nextTemplateId: string | null, trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    setTemplateId(nextTemplateId);
    setModal(nextModal);
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

  return <section className="source-profile-template-section" aria-labelledby="source-profile-templates-heading">
    <div className="source-profile-overview-heading">
      <div>
        <h2 id="source-profile-templates-heading">Appbrede sjablonen</h2>
        <p>Sjablonen zijn vertrekpunten voor nieuwe, onafhankelijke bronprofielen en zijn nooit rechtstreeks actief in een leeromgeving.</p>
      </div>
      {canManage ? <button className="primary-button source-profile-template-create" type="button" onClick={(event) => open("create", null, event.currentTarget)}><Plus size={16} aria-hidden />Nieuw sjabloon</button> : null}
    </div>
    <p className="source-profile-template-note">Wijzigingen aan een sjabloon hebben geen invloed op bestaande bronprofielen. Alleen nieuwe kopieën gebruiken de aangepaste versie.</p>
    <div className="source-profile-overview-list">
      {templates.map((template) => <article className="source-profile-overview-card" key={template.id}>
        <div className="source-profile-overview-copy">
          <div className="source-profile-template-title"><div className="source-profile-overview-title"><Settings2 size={18} aria-hidden /><h3>{template.name}</h3></div>{template.isDefault ? <span className="active-source-badge">Standaard</span> : null}</div>
          {template.description ? <p>{template.description}</p> : null}
        </div>
        <div className="source-profile-card-actions">
          {canManage ? <button className="secondary-button source-profile-manage-button" type="button" onClick={(event) => open("manage", template.id, event.currentTarget)}>Beheren</button> : null}
          {copyTargets.length > 0 ? <button className="secondary-button source-profile-copy-button" type="button" onClick={(event) => open("copy", template.id, event.currentTarget)}><Copy size={16} aria-hidden />Kopiëren</button> : null}
        </div>
      </article>)}
    </div>

    {modal ? <div className="confirm-backdrop" role="presentation">
      <div className="source-profile-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="source-profile-dialog-heading">
          <h2 id={titleId}>{modalTitle(modal)}</h2>
          <button ref={closeRef} className="icon-button" type="button" onClick={close} aria-label="Sluiten" title="Sluiten"><X size={18} aria-hidden /></button>
        </div>
        {modal === "create" ? <form action={actions.create} className="source-profile-dialog-form">
          <label>Naam<input name="name" maxLength={80} required /></label>
          <label>Beschrijving (optioneel)<textarea name="description" maxLength={240} rows={3} /></label>
          <label>Startbasis<select name="sourceTemplateId" defaultValue={defaultTemplate?.id ?? ""} required>
            {templates.map((template) => <option key={template.id} value={template.id}>{template.name}{template.isDefault ? " — standaard" : ""}</option>)}
          </select></label>
          <p>Er wordt een onafhankelijke kopie van de gekozen configuratie gemaakt.</p>
          <TemplateError error={error} />
          <DialogActions cancel={close} submitLabel="Sjabloon maken" />
        </form> : null}
        {modal === "manage" && selected ? <>
          <form action={actions.update} className="source-profile-dialog-form">
            <input type="hidden" name="templateId" value={selected.id} />
            <label>Naam<input name="name" defaultValue={selected.name} maxLength={80} required /></label>
            <label>Beschrijving (optioneel)<textarea name="description" defaultValue={selected.description ?? ""} maxLength={240} rows={3} /></label>
            <div className="source-profile-template-default-state">
              {selected.isDefault ? <span className="active-source-badge">Standaard</span> : <button className="secondary-button" type="button" onClick={() => setModal("default")}>Als standaard instellen</button>}
            </div>
            <TemplateError error={error} />
            <div className="source-profile-template-dialog-actions">
              <button className="secondary-button" type="submit" formAction={actions.duplicate}><Copy size={16} aria-hidden />Sjabloon dupliceren</button>
              <div><button className="secondary-button" type="button" onClick={close}>Annuleren</button><button className="primary-button" type="submit">Opslaan</button></div>
            </div>
          </form>
        </> : null}
        {modal === "default" && selected ? <form action={actions.setDefault} className="source-profile-dialog-form">
          <input type="hidden" name="templateId" value={selected.id} />
          <p>Dit sjabloon wordt voortaan gebruikt als basis voor nieuwe leeromgevingen. Bestaande leeromgevingen en bronprofielen worden niet aangepast.</p>
          <TemplateError error={error} />
          <div className="source-profile-dialog-actions"><button className="secondary-button" type="button" onClick={() => setModal("manage")}>Annuleren</button><button className="primary-button" type="submit">Als standaard instellen</button></div>
        </form> : null}
        {modal === "copy" && selected ? <form action={actions.copy} className="source-profile-dialog-form">
          <input type="hidden" name="templateId" value={selected.id} />
          <div className="source-profile-readonly-field"><span>Bronprofielsjabloon</span><strong>{selected.name}</strong></div>
          <label>Doelleeromgeving<select name="managementLearningSpaceId" required defaultValue=""><option value="" disabled>Kies een leeromgeving</option>{copyTargets.map((target) => <option key={target.learningSpaceId} value={target.learningSpaceId}>{target.learningSpaceShortLabel} — {target.profile.name}</option>)}</select></label>
          <p>Er wordt een onafhankelijk concreet bronprofiel gemaakt. Het sjabloon zelf wordt nooit rechtstreeks gekoppeld.</p>
          <TemplateError error={error} />
          <DialogActions cancel={close} submitLabel="Kopiëren" submitIcon={<Copy size={16} aria-hidden />} />
        </form> : null}
      </div>
    </div> : null}
  </section>;
}

function DialogActions({ cancel, submitLabel, submitIcon }: { cancel: () => void; submitLabel: string; submitIcon?: ReactNode }) {
  return <div className="source-profile-dialog-actions"><button className="secondary-button" type="button" onClick={cancel}>Annuleren</button><button className="primary-button" type="submit">{submitIcon}{submitLabel}</button></div>;
}

function TemplateError({ error }: { error?: string }) {
  return error ? <p className="form-message" role="alert">{error}</p> : null;
}

function modalTitle(modal: SourceProfileTemplateModal): string {
  if (modal === "create") return "Nieuw bronprofielsjabloon";
  if (modal === "default") return "Standaardsjabloon wijzigen";
  if (modal === "copy") return "Bronprofielsjabloon kopiëren";
  return "Bronprofielsjabloon beheren";
}

function allowedInitialModal(
  modal: SourceProfileTemplateModal | null,
  templateId: string | undefined,
  templates: SourceProfileTemplateSummary[],
  canManage: boolean,
  canCopy: boolean,
): { modal: SourceProfileTemplateModal | null; templateId: string | null } {
  if (!canManage && modal !== "copy") return { modal: null, templateId: null };
  if (modal === "copy" && !canCopy) return { modal: null, templateId: null };
  if (modal === "create") return { modal, templateId: null };
  const template = templates.find((candidate) => candidate.id === templateId);
  if (!template || !modal || (modal === "default" && template.isDefault)) return { modal: null, templateId: null };
  return { modal, templateId: template.id };
}
