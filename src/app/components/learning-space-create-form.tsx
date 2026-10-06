"use client";

import Link from "next/link";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import type { Subject } from "@/lib/subjects";
import { COLLECTION_LABEL_MAX_LENGTH, EXERCISE_LABEL_SHORT_MAX_LENGTH, formatTerminologyLabel } from "@/lib/collection-terminology";
import { DEFAULT_LEARNING_SPACE_COLOR } from "@/lib/ui-colors";
import { DEFAULT_EXERCISE_LEVEL_PRESENTATION } from "@/lib/exercise-level-presentation";
import { parseCreationProfileDraft, WIZARD_DEFAULT_DESCRIPTION, EMPTY_CREATION_OPTIONS, TERMINOLOGY_START_SCENARIOS, terminologyScenario, validateCreationStep, type CreationAction, type CreationResult, type LearningSpaceCreationOptions } from "@/lib/learning-space-creation-wizard";
import type { SourceProfileConfig } from "@/lib/source-profile-config";
import { creationProfileSummary } from "@/lib/learning-space-creation-summary";
import { LearningSpaceCreationSuccess } from "./learning-space-creation-success";
import { LearningSpaceCreationProfileEditor } from "./learning-space-creation-profile-editor";
import { ExerciseLevelPresentationSettings } from "./exercise-level-presentation-settings";

interface LearningSpaceCreateFormProps {
  action: CreationAction;
  subjects: Subject[];
  options?: LearningSpaceCreationOptions;
  error?: string | null;
  onCancel?: () => void;
  onPendingChange?: (pending: boolean) => void;
}
const stepLabels = ["Algemeen", "Personalisatie", "Bronprofiel", "Bron"];
const profileExplanations: Record<string, string> = { template: "Start met een bestaand sjabloon en pas het aan waar nodig.", copy: "Maak een onafhankelijke kopie van een profiel uit een andere leeromgeving.", link: "Gebruik hetzelfde gedeelde profiel. Wijzigingen gelden overal waar dit profiel gekoppeld is.", later: "Je kunt dit later via Instellingen toevoegen." };
const stepTitles = ["Algemene instellingen", "Personalisatie", "Bronprofiel", "Bron"];

export function LearningSpaceCreateForm({ action, subjects, options = EMPTY_CREATION_OPTIONS, error = null, onCancel, onPendingChange }: LearningSpaceCreateFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(1);
  const [validationError, setValidationError] = useState<string | null>(error);
  const [terms, setTerms] = useState(() => terminologyScenario("portfolio"));
  const [scenario, setScenario] = useState("portfolio");
  const [color, setColor] = useState(DEFAULT_LEARNING_SPACE_COLOR);
  const [profileMode, setProfileMode] = useState("");
  const [profileSelections, setProfileSelections] = useState<Record<string, string>>({});
  const [profileIntents, setProfileIntents] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<{ key: string; config: SourceProfileConfig }[]>([]);
  const [summaryConfigs, setSummaryConfigs] = useState<Record<string, SourceProfileConfig>>({});
  const [editorOpen, setEditorOpen] = useState(false);
  const [sourceChoice, setSourceChoice] = useState("");
  const [technicalOpen, setTechnicalOpen] = useState(false);
  const profileId = profileSelections[profileMode] ?? "";
  const profileKey = `${profileMode}:${profileId}`;
  const profileIntent = profileIntents[profileKey] ?? "use";
  const editable = ["template", "copy"].includes(profileMode) && profileIntent === "edit";
  const activeDraft = editable ? drafts.find((draft) => draft.key === profileKey) : undefined;
  const revealError = (candidate: number, message: string) => {
    setStep(candidate); setValidationError(message);
    if (candidate === 3 && editable) setEditorOpen(true);
    if (candidate === 4 && sourceChoice === "onedrive") setTechnicalOpen(true);
  };
  const [result, submit, pending] = useActionState<CreationResult | null, FormData>(async (_previous, formData) => {
    for (let candidate = 1; candidate <= 4; candidate++) {
      const message = validateCreationStep(candidate, formData);
      if (message) { revealError(candidate, message); return { error: message, step: candidate }; }
    }
    const response = await action(formData) ?? { error: "De leeromgeving kon niet worden aangemaakt.", step: 4 };
    if (response.error) revealError(response.step, response.error);
    return response;
  }, null);
  useEffect(() => { onPendingChange?.(pending); }, [onPendingChange, pending]);
  useEffect(() => { headingRef.current?.focus(); }, [step]);
  useEffect(() => { contentRef.current?.scrollTo({ top: 0 }); }, [step, editorOpen]);
  const move = (next: number) => {
    if (next > step && formRef.current) {
      const message = validateCreationStep(step, new FormData(formRef.current));
      const invalidField = [...formRef.current.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`fieldset[data-step="${step}"] input, fieldset[data-step="${step}"] select, fieldset[data-step="${step}"] textarea`)].find((field) => !field.validity.valid);
      if (message || invalidField) { revealError(step, message ?? invalidField!.validationMessage); invalidField?.focus(); return; }
    }
    setValidationError(null); setStep(next);
  };
  const choices = profileMode === "template" ? options.templates : profileMode === "copy" ? options.copies : options.links;
  const selected = choices.find((choice) => choice.id === profileId);
  const openEditor = (mode = profileMode, id = profileId) => {
    const key = `${mode}:${id}`;
    const config = (mode === "template" ? options.templates : options.copies).find((option) => option.id === id)?.config;
    if (!config) { setValidationError("Kies eerst een beschikbaar bronprofiel."); return; }
    setDrafts((current) => current.some((draft) => draft.key === key) ? current : [...current, { key, config }]);
    setProfileIntents((current) => ({ ...current, [key]: "edit" }));
    setEditorOpen(true); setValidationError(null);
  };
  const finishEditor = (requireValid = true) => {
    if (!formRef.current) return;
    try {
      const config = parseCreationProfileDraft(new FormData(formRef.current));
      setSummaryConfigs((current) => ({ ...current, [profileKey]: config }));
    } catch {
      if (requireValid) { setValidationError("Controleer de instellingen in je bronprofiel voordat je verdergaat."); return; }
    }
    setEditorOpen(false); setValidationError(null);
  };
  const summaryConfig = editable ? summaryConfigs[profileKey] ?? activeDraft?.config : selected?.config;
  const summary = summaryConfig ? creationProfileSummary(summaryConfig, Object.fromEntries(["theme", "collection", "section", "exercise"].flatMap((entity) => {
    const labels = terms[entity as keyof typeof terms];
    return [[`${entity}LabelSingular`, labels.singular], [`${entity}LabelPlural`, labels.plural]];
  }))) : selected?.summary ?? [];
  if (result && result.error === null) return <LearningSpaceCreationSuccess result={result} />;
  const terminologyGroups = [
    ["theme", "Groepering", "themeLabel", "Groepeert meerdere hoofdgehelen, bijvoorbeeld thema's of delen."],
    ["collection", "Hoofdgeheel", "collectionLabel", "Het geheel waarin leerlingen werken, bijvoorbeeld een portfolio, bundel of hoofdstuk."],
    ["section", "Onderverdeling", "sectionLabel", "Een optionele opdeling, bijvoorbeeld onderdelen of secties."],
    ["exercise", "Oefeneenheid", "exerciseLabel", "Waar een leerling aan werkt, bijvoorbeeld een oefening, opdracht of vraag."],
  ] as const;
  return <form ref={formRef} noValidate className="learning-space-create-form" onSubmit={(event) => {
    event.preventDefault();
    if (pending) return;
    if (step !== 4) { move(step + 1); return; }
    // Dispatch explicitly so a returned validation error does not reset the entered fields.
    const formData = new FormData(event.currentTarget);
    startTransition(() => submit(formData));
  }}>
    <input type="hidden" name="creationFlow" value="wizard" />
    <div className="creation-step-heading">
      <ol className="creation-stepper" aria-label="Stappen bij het aanmaken">{stepLabels.map((label, index) => <li key={label} aria-current={step === index + 1 ? "step" : undefined} data-complete={step > index + 1}><span>{index + 1}</span><small>{label}</small></li>)}</ol>
      <h3 ref={headingRef} tabIndex={-1}>{step === 3 && editorOpen ? "Bronprofiel aanpassen" : stepTitles[step - 1]}</h3>
    </div>
    <div ref={contentRef} className="creation-wizard-content">
    <fieldset data-step="1" hidden={step !== 1} disabled={pending}>
      <legend className="sr-only">Algemene instellingen</legend>
      <div className="settings-grid create-general-grid">
        <label>Vak<select name="subjectId" defaultValue="" required><option value="" disabled>Kies een vak</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
        <label>Naam<input name="name" required maxLength={100} placeholder="5MTWE 5LWE" /><small>Met deze naam verschijnt de leeromgeving bij de leerlingen.</small></label>
        <label className="field-full">Beschrijving<textarea name="description" defaultValue={WIZARD_DEFAULT_DESCRIPTION} maxLength={240} rows={3} /><small>Deze tekst verschijnt boven de kaartjes in de leeromgeving.</small></label>
        <label>Label<input name="shortLabel" required maxLength={6} placeholder="5WET" /><small>Compacte naam in de navigatie en op de homeweergave, maximaal 6 tekens.</small></label>
        <label>URL<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="5we" /><small>Dit wordt gebruikt in het webadres van deze leeromgeving.</small></label>
      </div>
    </fieldset>
    <fieldset data-step="2" hidden={step !== 2} disabled={pending}>
      <legend className="sr-only">Personalisatie</legend>
      <section className="creation-personalization-section creation-color-section"><div><h4>Kleur</h4><p>De kleur van het kaartje van deze leeromgeving.</p></div>
      <label className="color-field"><span className="sr-only">Kleur</span><span><input name="cardColor" type="color" value={color} onChange={(event) => setColor(event.target.value.toUpperCase())} /><code>{color}</code></span></label>
      </section>
      <section className="creation-personalization-section"><h4>Benamingen</h4>
      <p className="source-context-help">Dit vult alvast de benamingen voor de verschillende onderverdelingen in. Je kunt daarna elk woord aanpassen.</p>
      <label>Start met<select value={scenario} onChange={(event) => { const id = event.target.value; setScenario(id); if (id !== "custom") setTerms(terminologyScenario(id)); }}>{TERMINOLOGY_START_SCENARIOS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}<option value="custom">Aangepast</option></select></label>
      {terminologyGroups.map(([entity, title, name, explanation]) => <div className="personalization-settings-section" key={entity}><h4>{title}</h4><p>{explanation}</p><div className="settings-grid creation-terminology-grid">
        {(["singular", "plural"] as const).map((form) => <label key={form}>{form === "singular" ? "Enkelvoud" : "Meervoud"}<input name={`${name}${form === "singular" ? "Singular" : "Plural"}`} value={terms[entity][form]} required maxLength={COLLECTION_LABEL_MAX_LENGTH} onChange={(event) => { setScenario("custom"); setTerms({ ...terms, [entity]: { ...terms[entity], [form]: event.target.value } }); }} /></label>)}
        {entity === "exercise" ? <label>Afkorting<input name="exerciseLabelShort" value={terms.exercise.short} maxLength={EXERCISE_LABEL_SHORT_MAX_LENGTH} onChange={(event) => { setScenario("custom"); setTerms({ ...terms, exercise: { ...terms.exercise, short: event.target.value } }); }} /><small>Laat leeg om alleen het nummer te tonen.</small></label> : null}
      </div></div>)}
      </section>
      <ExerciseLevelPresentationSettings initialPresentation={DEFAULT_EXERCISE_LEVEL_PRESENTATION} layout="cards" />
    </fieldset>
    <fieldset data-step="3" hidden={step !== 3} disabled={pending}>
      <legend className="sr-only">Bronprofiel</legend>
      <div className="creation-profile-choice" hidden={editorOpen}>
        <p>Een bronprofiel bepaalt hoe je mappen en bestanden als {formatTerminologyLabel(terms.collection.plural, "inline")} en {formatTerminologyLabel(terms.exercise.plural, "inline")} worden herkend.</p>
        <label>Wat wil je doen?<select name="profileMode" value={profileMode} required onChange={(event) => {
          const mode = event.target.value; setProfileMode(mode); setEditorOpen(false); setValidationError(null);
          const id = mode === "later" ? "" : profileSelections[mode] ?? (mode === "template" ? options.templates : mode === "copy" ? options.copies : options.links)[0]?.id ?? "";
          setProfileSelections((current) => ({ ...current, [mode]: id }));
        }}><option value="" disabled>Maak een keuze...</option><option value="template">Nieuw bronprofiel vanuit sjabloon</option><option value="copy">Kopieer van een andere leeromgeving</option><option value="link">Koppel aan een bestaand bronprofiel</option><option value="later">Later instellen</option></select></label>
        {profileMode ? <p className="source-context-help">{profileExplanations[profileMode]}</p> : null}
        {["template", "copy", "link"].includes(profileMode) ? <>
          <label>{profileMode === "template" ? "Sjabloon" : profileMode === "copy" ? "Leeromgeving" : "Bestaand profiel"}<select name="profileSelectionId" required value={profileId} onChange={(event) => {
            const id = event.target.value; setProfileSelections((current) => ({ ...current, [profileMode]: id }));
          }}><option value="" disabled>Kies een optie</option>{choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.name}</option>)}</select></label>
          {selected ? <div className="source-profile-summary"><strong>{selected.name}</strong>{selected.description ? <p>{selected.description}</p> : null}<ul>{summary.map((line) => <li key={line}>{line}</li>)}</ul></div> : <p>Er zijn nog geen beschikbare opties. Je kunt een nieuw profiel maken of dit later instellen.</p>}
        </> : null}
        {profileMode === "link" ? <p className="source-profile-shared-warning">Dit profiel blijft gedeeld. Je kunt het hier alleen bekijken.</p> : null}
        {profileMode === "copy" || profileMode === "template" ? <p>Je krijgt een eigen, onafhankelijke kopie. Latere wijzigingen aan het origineel veranderen jouw kopie niet.</p> : null}
        {["template", "copy"].includes(profileMode) && selected ? <button type="button" className="secondary-button" onClick={() => openEditor()}>Bronprofiel controleren en aanpassen</button> : null}
      </div>
      {activeDraft ? <input type="hidden" name="profileDraftEnabled" value="1" /> : null}
      {drafts.map((draft) => <fieldset className="creation-profile-draft" key={draft.key} hidden={!editorOpen || draft.key !== activeDraft?.key} disabled={draft.key !== activeDraft?.key || pending}>
        <legend className="sr-only">Eigen bronprofiel aanpassen</legend>
        <LearningSpaceCreationProfileEditor config={draft.config} draftKey={draft.key} />
      </fieldset>)}
    </fieldset>
    <fieldset data-step="4" hidden={step !== 4} disabled={pending}>
      <legend className="sr-only">Bron instellen</legend>
      <label>Wat wil je doen?<select value={sourceChoice} required onChange={(event) => setSourceChoice(event.target.value)}><option value="" disabled>Maak een keuze...</option><option value="onedrive">OneDrive</option><option value="google_drive">Google Drive</option><option value="local">Lokaal</option><option value="later">Later instellen</option></select></label>
      <input type="hidden" name="sourceSetup" value={sourceChoice === "later" ? "later" : sourceChoice ? "now" : ""} />
      <input type="hidden" name="sourceType" value={sourceChoice === "later" ? "local" : sourceChoice} />
      <fieldset hidden={sourceChoice !== "onedrive"} disabled={sourceChoice !== "onedrive"}>
        <legend className="sr-only">OneDrive</legend>
        <p>Deze bron gebruikt jouw persoonlijke verbinding. Controleer deze via <Link href="/admin/verbindingen" target="_blank">Verbindingen</Link>.</p>
        <details className="creation-technical-details" open={technicalOpen} onToggle={(event) => setTechnicalOpen(event.currentTarget.open)}><summary>Technische gegevens</summary>
          <p>Voorlopig vul je de gegevens van je map in. Een ingebouwde mapselectie maakt dit later eenvoudiger.</p>
          <div className="settings-grid"><label>OneDrive drive-ID<input name="oneDriveDriveId" required /></label><label>OneDrive map-ID<input name="oneDriveFolderId" required /></label><label className="field-full">OneDrive mapnaam of pad<input name="oneDriveFolderPath" /></label></div>
        </details>
      </fieldset>
      <fieldset hidden={sourceChoice !== "google_drive"} disabled={sourceChoice !== "google_drive"}>
        <legend className="sr-only">Google Drive</legend>
        <div className="settings-grid"><label>Google Drive folder-ID<input name="googleDriveFolderId" required pattern="[A-Za-z0-9_-]+" /></label><label>Herkenbaar label of pad<input name="googleDriveFolderLabel" maxLength={240} /></label><p className="source-context-help field-full">De map moet met de ingestelde Google Drive-lezer gedeeld zijn als Kijker.</p></div>
      </fieldset>
      <fieldset hidden={sourceChoice !== "local"} disabled={sourceChoice !== "local"}>
        <legend className="sr-only">Lokale bestanden</legend><label>Lokale bronmap<input name="localSourcePath" placeholder="C:\\..." required /></label>
      </fieldset>
      {sourceChoice === "later" ? <p>Je kunt de bron later via Instellingen toevoegen.</p> : null}
      <p>Je kunt later via Instellingen nog een extra mirror instellen.</p>
    </fieldset>
    </div>
    <div className="creation-wizard-footer">
    {validationError ? <p className="form-message" role="alert">{validationError}</p> : null}
    <div className="create-space-actions">
      {onCancel ? <button className="secondary-button" type="button" disabled={pending} onClick={onCancel}>Annuleren</button> : null}
      {step === 3 && editorOpen ? <button className="secondary-button" type="button" disabled={pending} onClick={() => finishEditor(false)}>Terug naar keuze</button> : step > 1 ? <button className="secondary-button" type="button" disabled={pending} onClick={() => move(step - 1)}>Vorige</button> : null}
      {step < 4 ? <button className="primary-button" type="button" disabled={pending} onClick={() => step === 3 && editorOpen ? finishEditor() : move(step + 1)}>{step === 3 && editorOpen ? "Wijzigingen gebruiken" : "Volgende"}</button> : <button className="primary-button" type="submit" disabled={pending}>{pending ? "Aanmaken…" : "Leeromgeving aanmaken"}</button>}
    </div>
    </div>
  </form>;
}
