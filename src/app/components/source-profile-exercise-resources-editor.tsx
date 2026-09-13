"use client";

import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, CircleHelp, Plus, Trash2 } from "lucide-react";
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
  type ExerciseResourceDisplayMode,
  type ExerciseResourceFileExtension,
  type ExerciseResourceFileNameMatchOperator,
  type ExerciseResourceLocation,
  type ExerciseResourceMatchOperator,
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

export function SourceProfileExerciseResourcesViewer({ resources }: { resources: readonly ExerciseResourceConfig[] }) {
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
            <div className="source-profile-resource-readonly-type"><span>Zoeklocatie</span><strong>{locationLabel(resource.location)}</strong></div>
            <div className="source-profile-resource-readonly-rule"><span>Herkenningsregel</span><strong>{recognitionLabel(resource)}</strong><small>{resource.recognition.fileExtensions.map((extension) => extension.toUpperCase()).join(", ")}</small></div>
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
}: SourceProfileExerciseResourcesEditorProps & { initial: ExerciseResourceConfig[] }) {
  const baseline = useMemo(() => JSON.stringify(initial), [initial]);
  const [items, setItems] = useState<ExerciseResourceConfig[]>(initial);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [showHelp, setShowHelp] = useState(false);
  const serialized = JSON.stringify(items);

  useEffect(() => {
    onDirtyChange?.(serialized !== baseline);
  }, [baseline, onDirtyChange, serialized]);

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
    const resource = newExerciseResource(items);
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
              <label>Betekenis<select value={resource.semanticRole} onChange={(event) => update(index, (current) => changeSemanticRole(current, event.target.value as ExerciseResourceSemanticRole))}>{exerciseResourceSemanticRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></label>
              <div className="source-profile-resource-readonly-type"><span>Type</span><strong>Bestand uit bron</strong></div>
            </div>

            <div className="source-profile-recognition-panel">
              <label className="source-profile-recognition-label">Zoeklocatie</label>
              <select aria-label="Zoeklocatie" value={resource.location.scope} onChange={(event) => update(index, (current) => ({ ...current, location: changeLocation(current.location, event.target.value) }))}>
                <option value="alongside_exercise">Bij de oefening</option>
                <option value="subdirectory">In submap</option>
                <option value="alongside_and_subdirectory">Bij de oefening én in submap</option>
              </select>
              {resource.location.scope !== "alongside_exercise" ? <label>Submap<input aria-label="Submap" value={resource.location.subdirectory} maxLength={80} required onChange={(event) => update(index, (current) => ({ ...current, location: { ...current.location, subdirectory: event.target.value } as ExerciseResourceLocation }))} /></label> : null}
              <p className="source-profile-resource-note">{locationHelp(resource.location)}</p>
            </div>

            <div className="source-profile-recognition-panel">
              <label className="source-profile-recognition-label">Herkenningsregel</label>
              <select aria-label="Herkenningsregel" value={resource.recognition.target} onChange={(event) => update(index, (current) => changeRecognitionTarget(current, event.target.value as ExerciseResourceConfig["recognition"]["target"]))}>
                <option value="after_exercise_number">Tekst na oefeningnummer</option>
                <option value="file_name">Bestandsnaam</option>
                <option value="fallback">Standaard / overige bestanden</option>
              </select>
              {resource.recognition.target === "fallback" ? <p className="source-profile-resource-note">Dit onderdeel wordt pas gebruikt als geen specifiekere onderdeelregel voor hetzelfde bestand overeenkomt.</p> : <>
                <div className="source-profile-recognition-grid">
                  <select aria-label="Vergelijking" value={resource.recognition.operator} onChange={(event) => update(index, (current) => updateRecognition(current, { operator: event.target.value as ExerciseResourceMatchOperator }))}>
                    {recognitionOperators(resource).map((operator) => <option key={operator} value={operator}>{operatorLabels[operator]}</option>)}
                  </select>
                  <input aria-label="Herkenningstekst" value={resource.recognition.value} maxLength={120} required onChange={(event) => update(index, (current) => updateRecognition(current, { value: event.target.value }))} />
                </div>
                <button
                  className={`source-profile-case-toggle${resource.recognition.caseSensitive ? " is-enabled" : ""}`}
                  type="button"
                  role="switch"
                  aria-checked={resource.recognition.caseSensitive}
                  onClick={() => update(index, (current) => updateRecognition(current, { caseSensitive: current.recognition.target !== "fallback" ? !current.recognition.caseSensitive : false }))}
                >
                  <span className="source-profile-case-track" aria-hidden><span /></span>
                  <span>{resource.recognition.caseSensitive ? "Hoofdlettergevoelig" : "Niet hoofdlettergevoelig"}</span>
                </button>
              </>}
            </div>

            <div className="source-profile-recognition-panel">
              <button className={`source-profile-case-toggle${resource.allowMultiple ? " is-enabled" : ""}`} type="button" role="switch" aria-checked={resource.allowMultiple} onClick={() => update(index, (current) => ({ ...current, allowMultiple: !current.allowMultiple }))}>
                <span className="source-profile-case-track" aria-hidden><span /></span>
                <span>Meerdere bestanden toestaan</span>
              </button>
              {resource.allowMultiple ? <p className="source-profile-resource-note">Alle gevonden bestanden worden alfabetisch op bestandsnaam gesorteerd.</p> : <p className="source-profile-resource-note">Als meerdere bestanden voldoen, meldt de scanner een conflict en kiest hij niets.</p>}
            </div>

            <label>Weergave<select aria-label="Weergave" value={resource.displayMode} onChange={(event) => update(index, (current) => ({ ...current, displayMode: event.target.value as ExerciseResourceDisplayMode }))}>{exerciseResourceDisplayModes.map((mode) => <option key={mode} value={mode}>{displayModeLabels[mode]}</option>)}</select></label>

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
      <p><b>Bij de oefening</b> betekent de map waarin de oefening zelf staat. Dat kan een portfolio-onderdeel zijn, de hoofdmap van een portfolio zonder onderdelen, of de map van een mapgebaseerde oefening.</p>
      <p><b>In submap</b> zoekt in één vaste submap zoals <code>assets</code>. <b>Bij de oefening én in submap</b> accepteert beide plaatsen.</p>
      <p><b>Tekst na oefeningnummer</b> is geschikt voor namen als <code>Oef3a-alt.png</code>. <b>Bestandsnaam</b> is vooral handig binnen een oefeningsmap, bijvoorbeeld <code>Oef3a/uitwerking.png</code>. <b>Standaard / overige bestanden</b> is de fallback nadat specifiekere regels zijn geprobeerd.</p>
      <p>Per portfolio worden mappen volgens <code>nummer - titel</code> automatisch als portfolio-onderdelen herkend. Een portfolio zonder zulke mappen is ook geldig.</p>
    </div> : null}
    {embedded ? <div className="source-profile-resource-form source-profile-resource-form-embedded">{fields}</div> : <form action={action} className="source-profile-resource-form">{fields}</form>}
  </section>;
}

function recognitionOperators(resource: ExerciseResourceConfig): ExerciseResourceFileNameMatchOperator[] {
  if (resource.recognition.target === "file_name") {
    const operators = [...exerciseResourceFileNameMatchOperators];
    if (resource.recognition.operator !== "ends_with") return operators.filter((operator) => operator !== "ends_with");
    return operators;
  }
  return [...exerciseResourceMatchOperators];
}

function recognitionLabel(resource: ExerciseResourceConfig): string {
  const recognition = resource.recognition;
  if (recognition.target === "fallback") return "Standaard / overige bestanden";
  const source = recognition.target === "after_exercise_number" ? "Na oefeningnummer" : "Bestandsnaam";
  return `${source}: ${operatorLabels[recognition.operator]} “${recognition.value}”`;
}

function locationLabel(location: ExerciseResourceLocation): string {
  if (location.scope === "alongside_exercise") return "Bij de oefening";
  if (location.scope === "subdirectory") return `In submap “${location.subdirectory}”`;
  return `Bij de oefening én in “${location.subdirectory}”`;
}

function locationHelp(location: ExerciseResourceLocation): string {
  if (location.scope === "alongside_exercise") return "Zoekt naast het oefeningsbestand of rechtstreeks binnen een oefeningsmap.";
  if (location.scope === "subdirectory") return `Zoekt alleen in de submap “${location.subdirectory}” van de huidige oefeningscontext.`;
  return `Zoekt zowel bij de oefening als in de submap “${location.subdirectory}”.`;
}

function changeLocation(current: ExerciseResourceLocation, scope: string): ExerciseResourceLocation {
  if (scope === "alongside_exercise") return { scope };
  const subdirectory = current.scope === "alongside_exercise" ? "assets" : current.subdirectory;
  return scope === "subdirectory" ? { scope, subdirectory } : { scope: "alongside_and_subdirectory", subdirectory };
}

function normalizeOrders(resources: readonly ExerciseResourceConfig[]): ExerciseResourceConfig[] {
  return resources.map((resource, index) => ({ ...resource, order: (index + 1) * 10 }));
}

function newExerciseResource(existing: readonly ExerciseResourceConfig[]): ExerciseResourceConfig {
  let suffix = 1;
  let id = `exercise-resource-${suffix}`;
  const ids = new Set(existing.map((resource) => resource.id));
  while (ids.has(id)) id = `exercise-resource-${++suffix}`;
  return {
    id,
    kind: "source_file",
    label: "Nieuw onderdeel",
    icon: "file-text",
    order: (existing.length + 1) * 10,
    semanticRole: "generic",
    location: { scope: "alongside_exercise" },
    recognition: { target: "after_exercise_number", operator: "starts_with", value: "onderdeel", caseSensitive: false, fileExtensions: ["pdf", "png", "jpg", "jpeg"] },
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
  resource: ExerciseResourceConfig,
  target: ExerciseResourceConfig["recognition"]["target"],
): ExerciseResourceConfig {
  const fileExtensions = [...resource.recognition.fileExtensions];
  if (target === "fallback") return { ...resource, recognition: { target, fileExtensions } };
  const value = resource.semanticRole === "alternative_solution" ? "-alt" : resource.label.trim().toLocaleLowerCase("nl") || "onderdeel";
  return { ...resource, recognition: { target, operator: "starts_with", value, caseSensitive: false, fileExtensions } };
}

function updateRecognition(
  resource: ExerciseResourceConfig,
  patch: Partial<{ operator: ExerciseResourceFileNameMatchOperator; value: string; caseSensitive: boolean }>,
): ExerciseResourceConfig {
  if (resource.recognition.target === "fallback") return resource;
  return { ...resource, recognition: { ...resource.recognition, ...patch } as ExerciseResourceConfig["recognition"] };
}

function toggleExtension(resource: ExerciseResourceConfig, extension: ExerciseResourceFileExtension): ExerciseResourceConfig {
  const selected = resource.recognition.fileExtensions.includes(extension)
    ? resource.recognition.fileExtensions.filter((candidate) => candidate !== extension)
    : [...resource.recognition.fileExtensions, extension];
  return { ...resource, recognition: { ...resource.recognition, fileExtensions: selected } as ExerciseResourceConfig["recognition"] };
}
