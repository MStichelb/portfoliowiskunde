"use client";

import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, CircleHelp, Info, Plus, Trash2 } from "lucide-react";

import styles from "./portfolio-resource-scanner-v2.module.css";
import { useEffect, useMemo, useState } from "react";

import { ConfiguredResourceIcon } from "@/app/components/configured-resource-icon";
import { SourceProfileIconPicker } from "@/app/components/source-profile-icon-picker";
import {
  EXERCISE_RESOURCE_LIMIT,
  exerciseResourceDisplayModes,
  exerciseResourceFileExtensions,
  exerciseResourceFileNameMatchOperators,
  exerciseResourceListSchema,
  exerciseResourceMatchOperators,
  exerciseResourceSemanticRoles,
  sortExerciseResources,
  type ExerciseResourceConfig,
  type ExerciseMode,
  type ExerciseResourceDirectoryContextRecognition,
  type ExerciseResourceDisplayMode,
  type ExerciseResourceFileContextRecognition,
  type ExerciseResourceFileExtension,
  type ExerciseResourceFileNameMatchOperator,
  type ExerciseResourceLocation,
  type ExerciseResourceSemanticRole,
} from "@/lib/source-profile-config";

const roleLabels: Record<ExerciseResourceSemanticRole, string> = {
  assignment: "Opgave",
  final_answer: "Eindoplossing",
  worked_solution: "Uitwerking",
  alternative_solution: "Alternatieve uitwerking",
  hint: "Hint",
  explanation: "Uitleg",
  generic: "Overig",
};

const operatorLabels: Record<ExerciseResourceFileNameMatchOperator, string> = {
  starts_with: "Begint met",
  contains: "Bevat",
  exact: "Is exact",
  ends_with: "Eindigt op (bestaand profiel)",
};

const displayModeLabels: Record<ExerciseResourceDisplayMode, string> = {
  always: "Altijd zichtbaar",
  collapsible_group: "Inklapbaar als geheel",
  collapsible_each: "Inklapbaar per bestand",
};

export function SourceProfileExerciseResourcesViewer({
  resources,
  exerciseMode = "files_and_directories",
}: {
  resources: readonly ExerciseResourceConfig[];
  exerciseMode?: ExerciseMode;
}) {
  const items = normalizeOrders(sortExerciseResources(exerciseResourceListSchema.parse(resources)));
  return <section className="source-profile-resource-editor source-profile-resource-viewer" aria-label="Onderdelen per oefening">
    <div className="source-profile-resource-editor-heading">
      <div>
        <div className="source-profile-resource-title-row"><h3>Onderdelen per oefening</h3></div>
        <p>Deze configuratie is alleen-lezen.</p>
      </div>
      <span className="source-role-badge">{items.length}/{EXERCISE_RESOURCE_LIMIT}</span>
    </div>
    {items.length === 0 ? <p className="empty-state">Geen onderdelen per oefening ingesteld.</p> : <div className="source-profile-resource-list">
      {items.map((resource) => <article className="source-profile-resource-item is-expanded" key={resource.id}>
        <div className="source-profile-resource-item-heading source-profile-resource-item-heading-readonly">
          <div className="source-profile-resource-summary source-profile-resource-summary-readonly">
            <ConfiguredResourceIcon icon={resource.icon} size={18} />
            <strong title={resource.label}>{resource.label}</strong>
            <span>{roleLabels[resource.semanticRole]}</span>
          </div>
        </div>
        <div className="source-profile-resource-details source-profile-resource-readonly-details">
          <div className="source-profile-resource-readonly-main">
            <div className="source-profile-resource-readonly-type"><span>Zoeklocatie</span><strong>{locationLabel(resource.location, exerciseMode)}</strong></div>
            <div className="source-profile-resource-readonly-rule">
              <span>Herkenningsregel</span>
              {exerciseMode !== "directories" ? <RecognitionSummary label="Oefeningen als bestand" recognition={resource.recognition.file} /> : null}
              {exerciseMode !== "files" ? <RecognitionSummary label="Oefeningen als map" recognition={resource.recognition.directory} /> : null}
              <small>{resource.recognition.fileExtensions.map((extension) => extension.toUpperCase()).join(", ")}</small>
            </div>
            <div className="source-profile-resource-readonly-rule"><span>Bestanden</span><strong>{resource.allowMultiple ? "Meerdere toegestaan" : "Eén bestand"}</strong><small>{resource.allowMultiple ? "Alfabetisch op bestandsnaam" : "Meerdere matches geven een conflict"}</small></div>
            <div className="source-profile-resource-readonly-rule"><span>Weergave</span><strong>{displayModeLabels[resource.displayMode]}</strong></div>
          </div>
        </div>
      </article>)}
    </div>}
  </section>;
}

type SourceProfileExerciseResourcesEditorProps = {
  resources: readonly ExerciseResourceConfig[];
  action?: (formData: FormData) => Promise<void>;
  ownerIdField: "sourceProfileId" | "templateId";
  ownerId: string;
  embedded?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onChange?: (resources: ExerciseResourceConfig[]) => void;
  exerciseMode?: ExerciseMode;
};

export function SourceProfileExerciseResourcesEditor(props: SourceProfileExerciseResourcesEditorProps) {
  const initial = useMemo(
    () => normalizeOrders(sortExerciseResources(exerciseResourceListSchema.parse(props.resources))),
    [props.resources],
  );
  const resetKey = `${props.ownerId}:${JSON.stringify(initial)}`;
  return <SourceProfileExerciseResourcesEditorState key={resetKey} {...props} initial={initial} />;
}

function SourceProfileExerciseResourcesEditorState({
  initial,
  action,
  ownerIdField,
  ownerId,
  embedded = false,
  onDirtyChange,
  onChange,
  exerciseMode = "files_and_directories",
}: SourceProfileExerciseResourcesEditorProps & { initial: ExerciseResourceConfig[] }) {
  const baseline = useMemo(() => JSON.stringify(initial), [initial]);
  const [items, setItems] = useState<ExerciseResourceConfig[]>(initial);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [showHelp, setShowHelp] = useState(false);
  const effectiveItems = useMemo(() => enforceActiveExactRules(items, exerciseMode), [exerciseMode, items]);
  const serialized = JSON.stringify(effectiveItems);

  useEffect(() => {
    onDirtyChange?.(serialized !== baseline);
  }, [baseline, onDirtyChange, serialized]);

  useEffect(() => {
    onChange?.(effectiveItems);
  }, [effectiveItems, onChange]);

  const update = (index: number, transform: (resource: ExerciseResourceConfig) => ExerciseResourceConfig) => {
    setItems((current) => current.map((resource, candidateIndex) => candidateIndex === index ? transform(resource) : resource));
  };
  const move = (index: number, delta: -1 | 1) => {
    setItems((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return normalizeOrders(next);
    });
  };
  const remove = (index: number, id: string) => {
    setItems((current) => normalizeOrders(current.filter((_, candidateIndex) => candidateIndex !== index)));
    setExpandedIds((current) => { const next = new Set(current); next.delete(id); return next; });
  };
  const add = () => {
    const resource = newExerciseResource(items, exerciseMode);
    setItems((current) => normalizeOrders([...current, resource]));
    setExpandedIds((current) => new Set(current).add(resource.id));
  };
  const toggleExpanded = (id: string) => setExpandedIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const canAdd = items.length < EXERCISE_RESOURCE_LIMIT;
  const fields = <>
    {!embedded ? <input type="hidden" name={ownerIdField} value={ownerId} /> : null}
    <input type="hidden" name="exerciseResourcesJson" value={serialized} />
    {items.length === 0 ? <p className="empty-state">Geen onderdelen per oefening ingesteld.</p> : <div className="source-profile-resource-list">
      {items.map((resource, index) => {
        const expanded = expandedIds.has(resource.id);
        return <article className={`source-profile-resource-item${expanded ? " is-expanded" : ""}`} key={resource.id}>
          <div className="source-profile-resource-item-heading">
            <button className="source-profile-resource-summary" type="button" onClick={() => toggleExpanded(resource.id)} aria-expanded={expanded}>
              {expanded ? <ChevronDown size={17} aria-hidden /> : <ChevronRight size={17} aria-hidden />}
              <ConfiguredResourceIcon icon={resource.icon} size={18} />
              <strong title={resource.label || "Nieuw onderdeel"}>{resource.label || "Nieuw onderdeel"}</strong>
              <span>{roleLabels[resource.semanticRole]}</span>
            </button>
            <div className="source-profile-resource-order-actions">
              <button className="icon-button" type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Omhoog" title="Omhoog"><ArrowUp size={16} aria-hidden /></button>
              <button className="icon-button" type="button" onClick={() => move(index, 1)} disabled={index === items.length - 1} aria-label="Omlaag" title="Omlaag"><ArrowDown size={16} aria-hidden /></button>
              <button className="icon-button danger-icon-button" type="button" onClick={() => remove(index, resource.id)} aria-label="Verwijderen" title="Verwijderen"><Trash2 size={16} aria-hidden /></button>
            </div>
          </div>
          {expanded ? <div className="source-profile-resource-details">
            <div className="source-profile-resource-top-grid">
              <SourceProfileIconPicker value={resource.icon} onChange={(icon) => update(index, (current) => ({ ...current, icon }))} />
              <label>Label<input value={resource.label} maxLength={40} required onChange={(event) => update(index, (current) => ({ ...current, label: event.target.value }))} /></label>
            </div>
            <div className="source-profile-resource-grid">
              <label>Betekenis<select className={styles.control} value={resource.semanticRole} onChange={(event) => update(index, (current) => changeSemanticRole(current, event.target.value as ExerciseResourceSemanticRole))}>{exerciseResourceSemanticRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></label>
              <label>Weergave<select className={styles.control} aria-label="Weergave" value={resource.displayMode} onChange={(event) => update(index, (current) => ({ ...current, displayMode: event.target.value as ExerciseResourceDisplayMode }))}>{exerciseResourceDisplayModes.map((mode) => <option key={mode} value={mode}>{displayModeLabels[mode]}</option>)}</select></label>
            </div>

            <div className="source-profile-recognition-panel">
              <div className={styles.labelWithInfo}>
                <label className="source-profile-recognition-label">Zoeklocatie</label>
                <span className={styles.inlineInfo} role="img" aria-label="Uitleg over zoeklocatie" title={locationHelp(resource.location, exerciseMode)}><Info size={14} aria-hidden /></span>
              </div>
              <select className={styles.control} aria-label="Zoeklocatie" value={resource.location.scope} onChange={(event) => update(index, (current) => ({ ...current, location: changeLocation(current.location, event.target.value) }))}>
                <option value="alongside_exercise">{locationLabels(exerciseMode).alongside}</option>
                <option value="subdirectory">{locationLabels(exerciseMode).subdirectory}</option>
                <option value="alongside_and_subdirectory">{locationLabels(exerciseMode).both}</option>
              </select>
              {resource.location.scope !== "alongside_exercise" ? <label className={styles.stackedField}>Submap<input className={styles.control} aria-label="Submap" value={resource.location.subdirectory} maxLength={80} required onChange={(event) => update(index, (current) => ({ ...current, location: { ...current.location, subdirectory: event.target.value } as ExerciseResourceLocation }))} /></label> : null}
            </div>

            <div className="source-profile-recognition-panel">
              <div className={styles.labelWithInfo}>
                <label className="source-profile-recognition-label">Herkenningsregel</label>
                <span className={styles.inlineInfo} role="img" aria-label="Uitleg over herkenningsregel" title="Bij een oefeningsbestand wordt het onderdeel herkend na het oefeningnummer. Bij een oefeningsmap bepaalt de map al om welke oefening het gaat en kan de bestandsnaam rechtstreeks worden gebruikt."><Info size={14} aria-hidden /></span>
              </div>
              <SourceProfileExerciseRecognitionFields
                resource={resource}
                exerciseMode={exerciseMode}
                onChange={(next) => update(index, () => next)}
              />
            </div>

            <div className="source-profile-recognition-panel">
              <div className={styles.toggleWithInfo}>
                <button
                  className={`source-profile-case-toggle${resource.allowMultiple && !isExactRecognition(resource, exerciseMode) ? " is-enabled" : ""}`}
                  type="button"
                  role="switch"
                  aria-checked={resource.allowMultiple && !isExactRecognition(resource, exerciseMode)}
                  disabled={isExactRecognition(resource, exerciseMode)}
                  onClick={() => update(index, (current) => isExactRecognition(current, exerciseMode) ? current : ({ ...current, allowMultiple: !current.allowMultiple }))}
                >
                  <span className="source-profile-case-track" aria-hidden><span /></span>
                  <span>Meerdere bestanden toestaan</span>
                </button>
                <span
                  className={styles.inlineInfo}
                  role="img"
                  aria-label="Uitleg over meerdere bestanden"
                  title={isExactRecognition(resource, exerciseMode)
                    ? "Bij ‘Is exact’ kan maar één bestand overeenkomen; meerdere bestanden blijft daarom uitgeschakeld."
                    : resource.allowMultiple
                      ? "Alle gevonden bestanden worden alfabetisch op bestandsnaam gesorteerd."
                      : "Als meerdere bestanden voldoen, meldt de scanner een conflict en kiest hij niets."}
                ><Info size={14} aria-hidden /></span>
              </div>
            </div>

            <fieldset className="source-profile-resource-extensions">
              <legend>Toegelaten bestandstypen</legend>
              {exerciseResourceFileExtensions.map((extension) => <label key={extension}><input type="checkbox" checked={resource.recognition.fileExtensions.includes(extension)} onChange={() => update(index, (current) => toggleExtension(current, extension))} />{extension.toUpperCase()}</label>)}
            </fieldset>
          </div> : null}
        </article>;
      })}
    </div>}
    <div className="source-profile-resource-footer">
      <button className="secondary-button" type="button" onClick={add} disabled={!canAdd}><Plus size={16} aria-hidden />Onderdeel toevoegen</button>
      {!embedded ? <button className="primary-button" type="submit">Onderdelen opslaan</button> : null}
    </div>
  </>;

  return <section className="source-profile-resource-editor" aria-labelledby={`${ownerId}-exercise-resources-heading`}>
    <div className="source-profile-resource-editor-heading">
      <div>
        <div className="source-profile-resource-title-row">
          <h3 id={`${ownerId}-exercise-resources-heading`}>Onderdelen per oefening</h3>
          <button className="source-profile-help-button" type="button" onClick={() => setShowHelp((current) => !current)} aria-expanded={showHelp} aria-label="Uitleg over onderdelen per oefening" title="Uitleg over onderdelen per oefening"><CircleHelp size={17} aria-hidden /></button>
        </div>
        <p>Configureer waar onderdelen staan, hoe ze worden herkend en hoe ze later worden weergegeven.</p>
      </div>
      <span className="source-role-badge">{items.length}/{EXERCISE_RESOURCE_LIMIT}</span>
    </div>
    {showHelp ? <div className="source-profile-resource-help" role="note">
      <strong>Zoeklocatie en herkenning</strong>
      <p><b>Direct bij de oefening</b> betekent bij een oefeningsbestand dezelfde map en bij een oefeningsmap binnen die map.</p>
      <p><b>In een submap</b> zoekt in één vaste submap zoals <code>assets</code>. De gecombineerde optie accepteert beide plaatsen.</p>
      <p><b>Tekst na oefeningnummer</b> is geschikt voor namen als <code>Oef3a-alt.png</code>, ook binnen een oefeningsmap. <b>Bestandsnaam</b> kan alleen binnen een oefeningsmap worden gebruikt, bijvoorbeeld <code>Oef3a/uitwerking.png</code>. <b>Standaard / overige bestanden</b> is de contextlokale fallback nadat specifiekere regels zijn geprobeerd.</p>
      <p>Per portfolio worden mappen volgens <code>nummer - titel</code> automatisch als portfolio-onderdelen herkend. Een portfolio zonder zulke mappen is ook geldig.</p>
    </div> : null}
    {embedded ? <div className="source-profile-resource-form source-profile-resource-form-embedded">{fields}</div> : <form action={action} className="source-profile-resource-form">{fields}</form>}
  </section>;
}

type RecognitionContext = "file" | "directory";
type ContextRecognition = ExerciseResourceFileContextRecognition | ExerciseResourceDirectoryContextRecognition;

export function SourceProfileExerciseRecognitionFields({
  resource,
  exerciseMode,
  onChange,
}: {
  resource: ExerciseResourceConfig;
  exerciseMode: ExerciseMode;
  onChange: (resource: ExerciseResourceConfig) => void;
}) {
  return <>
    {exerciseMode !== "directories" ? <RecognitionRuleEditor
      context="file"
      label={exerciseMode === "files_and_directories" ? "Voor oefeningen als bestand" : undefined}
      recognition={resource.recognition.file}
      defaultValue={recognitionDefaultValue(resource)}
      onChange={(recognition) => onChange(setContextRecognition(resource, "file", recognition))}
    /> : null}
    {exerciseMode !== "files" ? <RecognitionRuleEditor
      context="directory"
      label={exerciseMode === "files_and_directories" ? "Voor oefeningen als map" : undefined}
      recognition={resource.recognition.directory}
      defaultValue={recognitionDefaultValue(resource)}
      onChange={(recognition) => onChange(setContextRecognition(resource, "directory", recognition))}
    /> : null}
  </>;
}

function RecognitionRuleEditor({
  context,
  label,
  recognition,
  defaultValue,
  onChange,
}: {
  context: RecognitionContext;
  label?: string;
  recognition: ContextRecognition | null;
  defaultValue: string;
  onChange: (recognition: ContextRecognition) => void;
}) {
  const targetLabel = context === "file" ? "Tekst na oefeningnummer" : "Bestandsnaam";
  return <div className={styles.contextRule}>
    {label ? <strong className={styles.contextRuleTitle}>{label}</strong> : null}
    {recognition ? <>
      <select
        className={styles.control}
        aria-label={label ? `Herkenningsregel ${label.toLocaleLowerCase("nl")}` : "Herkenningsregel"}
        value={recognition.target}
        onChange={(event) => onChange(changeRecognitionTarget(context, recognition, event.target.value as ContextRecognition["target"], defaultValue))}
      >
        {context === "directory" ? <option value="file_name">{targetLabel}</option> : null}
        <option value="after_exercise_number">Tekst na oefeningnummer</option>
        <option value="fallback">Standaard / overige bestanden</option>
      </select>
      {recognition.target === "fallback" ? <p className="source-profile-resource-note">Wordt gebruikt voor bestanden die niet aan een andere herkenningsregel in deze context voldoen.</p> : <>
        <div className="source-profile-recognition-grid">
          <select className={styles.control} aria-label={label ? `Vergelijking ${label.toLocaleLowerCase("nl")}` : "Vergelijking"} value={recognition.operator} onChange={(event) => onChange(updateContextRecognition(recognition, { operator: event.target.value as ExerciseResourceFileNameMatchOperator }))}>
            {recognitionOperators(recognition).map((operator) => <option key={operator} value={operator}>{operatorLabels[operator]}</option>)}
          </select>
          <input className={styles.control} aria-label={label ? `Herkenningstekst ${label.toLocaleLowerCase("nl")}` : "Herkenningstekst"} value={recognition.value} maxLength={120} required onChange={(event) => onChange(updateContextRecognition(recognition, { value: event.target.value }))} />
        </div>
        <button
          className={`source-profile-case-toggle${recognition.caseSensitive ? " is-enabled" : ""}`}
          type="button"
          role="switch"
          aria-checked={recognition.caseSensitive}
          onClick={() => onChange(updateContextRecognition(recognition, { caseSensitive: !recognition.caseSensitive }))}
        >
          <span className="source-profile-case-track" aria-hidden><span /></span>
          <span>{recognition.caseSensitive ? "Hoofdlettergevoelig" : "Niet hoofdlettergevoelig"}</span>
        </button>
      </>}
    </> : <div className={styles.missingRule}>
      <span>Nog geen herkenningsregel ingesteld.</span>
      <button className="secondary-button" type="button" onClick={() => onChange(defaultRecognition(context, defaultValue))}>Regel toevoegen</button>
    </div>}
  </div>;
}

function RecognitionSummary({ label, recognition }: { label: string; recognition: ContextRecognition | null }) {
  return <span className={styles.readonlyContextRule}>
    <b>{label}</b>
    <span>{recognition ? recognitionLabel(recognition) : "Nog geen herkenningsregel ingesteld"}</span>
  </span>;
}

function recognitionOperators(recognition: ContextRecognition): ExerciseResourceFileNameMatchOperator[] {
  if (recognition.target === "file_name") {
    const operators = [...exerciseResourceFileNameMatchOperators];
    if (recognition.operator !== "ends_with") return operators.filter((operator) => operator !== "ends_with");
    return operators;
  }
  return [...exerciseResourceMatchOperators];
}

function recognitionLabel(recognition: ContextRecognition): string {
  if (recognition.target === "fallback") return "Standaard / overige bestanden";
  const source = recognition.target === "after_exercise_number" ? "Tekst na oefeningnummer" : "Bestandsnaam";
  return `${source}: ${operatorLabels[recognition.operator]} “${recognition.value}”`;
}

function locationLabel(location: ExerciseResourceLocation, exerciseMode: ExerciseMode): string {
  const labels = locationLabels(exerciseMode);
  if (location.scope === "alongside_exercise") return labels.alongside;
  if (location.scope === "subdirectory") return `${labels.subdirectory} “${location.subdirectory}”`;
  return `${labels.both} “${location.subdirectory}”`;
}

function locationHelp(location: ExerciseResourceLocation, exerciseMode: ExerciseMode): string {
  const context = exerciseMode === "files"
    ? "Bij een oefeningsbestand betekent direct: in dezelfde map als het oefeningsbestand."
    : exerciseMode === "directories"
      ? "Bij een oefeningsmap betekent direct: binnen die oefeningsmap."
      : "Direct betekent bij een oefeningsbestand dezelfde map, en bij een oefeningsmap binnen die map.";
  if (location.scope === "alongside_exercise") return context;
  if (location.scope === "subdirectory") return `${context} Zoekt alleen in de ingestelde submap “${location.subdirectory}”.`;
  return `${context} Zoekt direct en in de ingestelde submap “${location.subdirectory}”.`;
}

function locationLabels(exerciseMode: ExerciseMode): { alongside: string; subdirectory: string; both: string } {
  if (exerciseMode === "files") return {
    alongside: "Bij de oefening",
    subdirectory: "In een submap",
    both: "Bij de oefening of in een submap",
  };
  if (exerciseMode === "directories") return {
    alongside: "In de map van de oefening",
    subdirectory: "In een submap van de oefening",
    both: "In de map of een submap van de oefening",
  };
  return {
    alongside: "Direct bij de oefening",
    subdirectory: "In een submap",
    both: "Direct bij de oefening of in een submap",
  };
}

function changeLocation(current: ExerciseResourceLocation, scope: string): ExerciseResourceLocation {
  if (scope === "alongside_exercise") return { scope };
  const subdirectory = current.scope === "alongside_exercise" ? "assets" : current.subdirectory;
  return scope === "subdirectory" ? { scope, subdirectory } : { scope: "alongside_and_subdirectory", subdirectory };
}

function normalizeOrders(resources: readonly ExerciseResourceConfig[]): ExerciseResourceConfig[] {
  return resources.map((resource, index) => ({ ...resource, order: (index + 1) * 10 }));
}

function newExerciseResource(existing: readonly ExerciseResourceConfig[], exerciseMode: ExerciseMode): ExerciseResourceConfig {
  let suffix = 1;
  let id = `exercise-resource-${suffix}`;
  const ids = new Set(existing.map((resource) => resource.id));
  while (ids.has(id)) id = `exercise-resource-${++suffix}`;
  const label = "Nieuw onderdeel";
  const defaultValue = label.toLocaleLowerCase("nl");
  return {
    id,
    kind: "source_file",
    label,
    icon: "file-text",
    order: (existing.length + 1) * 10,
    semanticRole: "generic",
    location: { scope: "alongside_exercise" },
    recognition: {
      file: exerciseMode === "directories" ? null : defaultRecognition("file", defaultValue),
      directory: exerciseMode === "files" ? null : defaultRecognition("directory", defaultValue),
      fileExtensions: ["pdf", "png", "jpg", "jpeg"],
    },
    allowMultiple: true,
    displayMode: "collapsible_group",
  };
}


function changeSemanticRole(resource: ExerciseResourceConfig, semanticRole: ExerciseResourceSemanticRole): ExerciseResourceConfig {
  const defaults = displayDefaultsForRole(semanticRole);
  return { ...resource, semanticRole, allowMultiple: defaults.allowMultiple, displayMode: defaults.displayMode };
}

function displayDefaultsForRole(semanticRole: ExerciseResourceSemanticRole): Pick<ExerciseResourceConfig, "allowMultiple" | "displayMode"> {
  if (semanticRole === "assignment" || semanticRole === "final_answer") return { allowMultiple: false, displayMode: "always" };
  if (semanticRole === "hint") return { allowMultiple: true, displayMode: "collapsible_each" };
  return { allowMultiple: true, displayMode: "collapsible_group" };
}

function changeRecognitionTarget(
  context: RecognitionContext,
  recognition: ContextRecognition,
  target: ContextRecognition["target"],
  defaultValue: string,
): ContextRecognition {
  if (target === "fallback") return { target };
  const value = recognition.target === "fallback" ? defaultValue : recognition.value;
  return { target, operator: "starts_with", value, caseSensitive: false } as ContextRecognition;
}

function recognitionDefaultValue(resource: ExerciseResourceConfig): string {
  if (resource.semanticRole === "alternative_solution") return "-alt";
  return resource.label.trim().toLocaleLowerCase("nl") || "onderdeel";
}

function defaultRecognition(context: "file", value: string): ExerciseResourceFileContextRecognition;
function defaultRecognition(context: "directory", value: string): ExerciseResourceDirectoryContextRecognition;
function defaultRecognition(context: RecognitionContext, value: string): ContextRecognition;
function defaultRecognition(context: RecognitionContext, value: string): ContextRecognition {
  return { target: context === "file" ? "after_exercise_number" : "file_name", operator: "starts_with", value, caseSensitive: false };
}

function setContextRecognition(resource: ExerciseResourceConfig, context: "file", recognition: ContextRecognition): ExerciseResourceConfig;
function setContextRecognition(resource: ExerciseResourceConfig, context: "directory", recognition: ContextRecognition): ExerciseResourceConfig;
function setContextRecognition(resource: ExerciseResourceConfig, context: RecognitionContext, recognition: ContextRecognition): ExerciseResourceConfig {
  if (context === "file") return {
    ...resource,
    recognition: { ...resource.recognition, file: recognition as ExerciseResourceFileContextRecognition },
  };
  return {
    ...resource,
    recognition: { ...resource.recognition, directory: recognition as ExerciseResourceDirectoryContextRecognition },
  };
}

function updateContextRecognition(
  recognition: ContextRecognition,
  patch: Partial<{ operator: ExerciseResourceFileNameMatchOperator; value: string; caseSensitive: boolean }>,
): ContextRecognition {
  if (recognition.target === "fallback") return recognition;
  return { ...recognition, ...patch } as ContextRecognition;
}

function isExactRecognition(resource: ExerciseResourceConfig, exerciseMode: ExerciseMode): boolean {
  const active = exerciseMode === "files"
    ? [resource.recognition.file]
    : exerciseMode === "directories"
      ? [resource.recognition.directory]
      : [resource.recognition.file, resource.recognition.directory];
  return active.some((recognition) => recognition?.target !== "fallback" && recognition?.operator === "exact");
}

function enforceActiveExactRules(resources: readonly ExerciseResourceConfig[], exerciseMode: ExerciseMode): ExerciseResourceConfig[] {
  return resources.map((resource) => isExactRecognition(resource, exerciseMode) && resource.allowMultiple
    ? { ...resource, allowMultiple: false }
    : resource);
}

function toggleExtension(resource: ExerciseResourceConfig, extension: ExerciseResourceFileExtension): ExerciseResourceConfig {
  const selected = resource.recognition.fileExtensions.includes(extension)
    ? resource.recognition.fileExtensions.filter((candidate) => candidate !== extension)
    : [...resource.recognition.fileExtensions, extension];
  return { ...resource, recognition: { ...resource.recognition, fileExtensions: selected } };
}
