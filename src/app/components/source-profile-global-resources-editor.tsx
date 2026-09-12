"use client";

import {
  ArrowDown,
  ArrowUp,
  Astroid,
  BookOpen,
  BookSearch,
  Brain,
  Calculator,
  ChevronDown,
  ChevronRight,
  CircleCheckBig,
  CircleHelp,
  Clapperboard,
  DraftingCompass,
  ExternalLink,
  FileClock,
  FileText,
  FlaskConical,
  KeyRound,
  LandPlot,
  Lightbulb,
  Link,
  Map,
  MonitorPlay,
  NotebookPen,
  Paperclip,
  Pencil,
  MapPinned,
  Plus,
  Puzzle,
  ScrollText,
  Shapes,
  Sparkles,
  Star,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  GLOBAL_RESOURCE_LIMIT,
  globalResourceFileExtensions,
  globalResourceFileMatchOperators,
  globalResourceSelectableIcons,
  globalResourceSemanticRoles,
  sortGlobalResources,
  type GlobalResourceConfig,
  type GlobalResourceFileExtension,
  type GlobalResourceFileMatchOperator,
  type GlobalResourceIcon,
  type GlobalResourceSemanticRole,
} from "@/lib/source-profile-config";

const roleLabels: Record<GlobalResourceSemanticRole, string> = {
  assignment: "Opgave",
  hint: "Hint",
  final_answer: "Eindoplossing",
  worked_solution: "Uitwerking",
  generic: "Overig",
};

const operatorLabels: Record<GlobalResourceFileMatchOperator, string> = {
  starts_with: "Begint met",
  contains: "Bevat",
  ends_with: "Eindigt op",
};

const iconComponents: Record<GlobalResourceIcon, LucideIcon> = {
  "file-text": FileText,
  lightbulb: Lightbulb,
  "circle-check-big": CircleCheckBig,
  "book-open": BookOpen,
  link: Link,
  "external-link": ExternalLink,
  youtube: MonitorPlay,
  calculator: Calculator,
  astroid: Astroid,
  "land-plot": LandPlot,
  "drafting-compass": DraftingCompass,
  brain: Brain,
  "flask-conical": FlaskConical,
  "key-round": KeyRound,
  star: Star,
  shapes: Shapes,
  "notebook-pen": NotebookPen,
  pencil: Pencil,
  paperclip: Paperclip,
  "scroll-text": ScrollText,
  map: Map,
  "book-search": BookSearch,
  sparkles: Sparkles,
  clapperboard: Clapperboard,
  "monitor-play": MonitorPlay,
  puzzle: Puzzle,
  "file-clock": FileClock,
  "map-pinned": MapPinned,
};

export function SourceProfileGlobalResourcesViewer({ resources }: { resources: readonly GlobalResourceConfig[] }) {
  const items = sortGlobalResources(resources);

  return <section className="source-profile-resource-editor source-profile-resource-viewer" aria-label="Globale documenten">
    <div className="source-profile-resource-editor-heading">
      <div>
        <div className="source-profile-resource-title-row"><h3>Globale documenten</h3></div>
        <p>Deze configuratie is alleen-lezen.</p>
      </div>
      <span className="source-role-badge">{items.length}/{GLOBAL_RESOURCE_LIMIT}</span>
    </div>

    {items.length === 0 ? <p className="empty-state">Geen globale documenten ingesteld.</p> : <div className="source-profile-resource-list">
      {items.map((resource) => {
        const Icon = iconComponents[resource.icon];
        return <article className="source-profile-resource-item is-expanded" key={resource.id}>
          <div className="source-profile-resource-item-heading source-profile-resource-item-heading-readonly">
            <div className="source-profile-resource-summary source-profile-resource-summary-readonly">
              <Icon size={18} aria-hidden />
              <strong title={resource.label}>{resource.label}</strong>
              <span>{roleLabels[resource.semanticRole]}</span>
            </div>
          </div>
          <div className="source-profile-resource-details source-profile-resource-readonly-details">
            <div className="source-profile-resource-readonly-main">
              <div className="source-profile-resource-readonly-type"><span>Type</span><strong>{resource.kind === "source_file" ? "Bestand uit bron" : "Externe link"}</strong></div>
              {resource.kind === "source_file" ? <div className="source-profile-resource-readonly-rule">
                <span>Herkenningsregel</span>
                <strong>{operatorLabels[resource.recognition.operator]} “{resource.recognition.value}”</strong>
                <small>{resource.recognition.fileExtensions.map((extension) => extension.toUpperCase()).join(", ") || "Geen"} · {resource.recognition.caseSensitive ? "Hoofdlettergevoelig" : "Niet hoofdlettergevoelig"}</small>
              </div> : <p className="source-profile-resource-note">De concrete URL wordt per portfolio ingesteld.</p>}
            </div>
          </div>
        </article>;
      })}
    </div>}
  </section>;
}

export function SourceProfileGlobalResourcesEditor({
  resources,
  action,
  ownerIdField,
  ownerId,
  shared = false,
  embedded = false,
  onDirtyChange,
}: {
  resources: readonly GlobalResourceConfig[];
  action?: (formData: FormData) => Promise<void>;
  ownerIdField: "sourceProfileId" | "templateId";
  ownerId: string;
  shared?: boolean;
  embedded?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [items, setItems] = useState<GlobalResourceConfig[]>(() => normalizeOrders(sortGlobalResources(resources)));
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [showHelp, setShowHelp] = useState(false);
  const initialSerialized = useMemo(() => JSON.stringify(normalizeOrders(sortGlobalResources(resources))), [resources]);
  const serialized = useMemo(() => JSON.stringify(normalizeOrders(items)), [items]);
  const canAdd = items.length < GLOBAL_RESOURCE_LIMIT;

  useEffect(() => {
    onDirtyChange?.(serialized !== initialSerialized);
  }, [initialSerialized, onDirtyChange, serialized]);

  const update = (index: number, updater: (resource: GlobalResourceConfig) => GlobalResourceConfig) => {
    setItems((current) => current.map((resource, position) => position === index ? updater(resource) : resource));
  };

  const move = (index: number, direction: -1 | 1) => {
    setItems((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return normalizeOrders(next);
    });
  };

  const add = () => {
    if (!canAdd) return;
    const resource = newSourceFileResource(items);
    setItems((current) => normalizeOrders([...current, resource]));
    setExpandedIds((current) => new Set(current).add(resource.id));
  };

  const remove = (index: number, resourceId: string) => {
    setItems((current) => normalizeOrders(current.filter((_, position) => position !== index)));
    setExpandedIds((current) => {
      const next = new Set(current);
      next.delete(resourceId);
      return next;
    });
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const editorFields = <>
    {!embedded ? <input type="hidden" name={ownerIdField} value={ownerId} /> : null}
    <input type="hidden" name="resourcesJson" value={serialized} />

    {items.length === 0 ? <p className="empty-state">Nog geen globale documenten ingesteld.</p> : <div className="source-profile-resource-list">
      {items.map((resource, index) => {
        const expanded = expandedIds.has(resource.id);
        const Icon = iconComponents[resource.icon];
        return <article className={`source-profile-resource-item${expanded ? " is-expanded" : ""}`} key={resource.id}>
          <div className="source-profile-resource-item-heading">
            <button className="source-profile-resource-summary" type="button" onClick={() => toggleExpanded(resource.id)} aria-expanded={expanded}>
              {expanded ? <ChevronDown size={17} aria-hidden /> : <ChevronRight size={17} aria-hidden />}
              <Icon size={18} aria-hidden />
              <strong title={resource.label || "Nieuw document"}>{resource.label || "Nieuw document"}</strong>
              <span>{roleLabels[resource.semanticRole]}</span>
            </button>
            <ResourceOrderActions index={index} count={items.length} onMove={move} onDelete={() => remove(index, resource.id)} />
          </div>

          {expanded ? <div className="source-profile-resource-details">
            <div className="source-profile-resource-top-grid">
              <IconPicker value={resource.icon} onChange={(icon) => update(index, (current) => ({ ...current, icon }))} />
              <label>Label<input value={resource.label} maxLength={40} required onChange={(event) => update(index, (current) => ({ ...current, label: event.target.value }))} /></label>
            </div>

            <div className="source-profile-resource-grid">
              <label>Betekenis<select value={resource.semanticRole} onChange={(event) => update(index, (current) => ({ ...current, semanticRole: event.target.value as GlobalResourceSemanticRole }))}>{globalResourceSemanticRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></label>
              <label>Type<select value={resource.kind} onChange={(event) => update(index, (current) => changeKind(current, event.target.value as GlobalResourceConfig["kind"]))}>
                <option value="source_file">Bestand uit bron</option>
                <option value="external_link">Externe link</option>
              </select></label>
            </div>

            {resource.kind === "source_file" ? <div className="source-profile-recognition-panel">
              <label className="source-profile-recognition-label">Herkenningsregel</label>
              <div className="source-profile-recognition-grid">
                <select aria-label="Herkenningsregel" value={resource.recognition.operator} onChange={(event) => update(index, (current) => current.kind === "source_file" ? ({ ...current, recognition: { ...current.recognition, operator: event.target.value as GlobalResourceFileMatchOperator } }) : current)}>{globalResourceFileMatchOperators.map((operator) => <option key={operator} value={operator}>{operatorLabels[operator]}</option>)}</select>
                <input aria-label="Herkenningstekst" value={resource.recognition.value} maxLength={120} required onChange={(event) => update(index, (current) => current.kind === "source_file" ? ({ ...current, recognition: { ...current.recognition, value: event.target.value } }) : current)} />
              </div>
              <fieldset className="source-profile-resource-extensions">
                <legend>Toegelaten bestandstypen</legend>
                {globalResourceFileExtensions.map((extension) => <label key={extension}><input type="checkbox" checked={resource.recognition.fileExtensions.includes(extension)} onChange={() => update(index, (current) => current.kind === "source_file" ? toggleExtension(current, extension) : current)} />{extension.toUpperCase()}</label>)}
              </fieldset>
              <button
                className={`source-profile-case-toggle${resource.recognition.caseSensitive ? " is-enabled" : ""}`}
                type="button"
                role="switch"
                aria-checked={resource.recognition.caseSensitive}
                onClick={() => update(index, (current) => current.kind === "source_file"
                  ? ({ ...current, recognition: { ...current.recognition, caseSensitive: !current.recognition.caseSensitive } })
                  : current)}
              >
                <span className="source-profile-case-track" aria-hidden><span /></span>
                <span>{resource.recognition.caseSensitive ? "Hoofdlettergevoelig" : "Niet hoofdlettergevoelig"}</span>
              </button>
            </div> : <p className="source-profile-resource-note">De concrete URL wordt per portfolio ingesteld in een volgende stap. Hier leg je alleen de knop en betekenis vast.</p>}
          </div> : null}
        </article>;
      })}
    </div>}

    <div className="source-profile-resource-footer">
      <button className="secondary-button" type="button" onClick={add} disabled={!canAdd}><Plus size={16} aria-hidden />Document toevoegen</button>
      {!embedded && shared ? <label className="source-profile-shared-confirm"><input type="checkbox" name="confirmShared" value="all" required />Ik bevestig dat deze wijzigingen in alle gekoppelde leeromgevingen gelden.</label> : null}
      {!embedded ? <button className="primary-button" type="submit">Globale documenten opslaan</button> : null}
    </div>
  </>;

  return <section className="source-profile-resource-editor" aria-labelledby={`${ownerId}-global-resources-heading`}>
    <div className="source-profile-resource-editor-heading">
      <div>
        <div className="source-profile-resource-title-row">
          <h3 id={`${ownerId}-global-resources-heading`}>Globale documenten</h3>
          <button className="source-profile-help-button" type="button" onClick={() => setShowHelp((current) => !current)} aria-expanded={showHelp} aria-label="Uitleg over globale documenten" title="Uitleg over globale documenten"><CircleHelp size={17} aria-hidden /></button>
        </div>
        <p>Configureer documenten die bovenaan elk portfolio beschikbaar kunnen zijn. De scanner gebruikt deze regels pas in een latere stap.</p>
      </div>
      <span className="source-role-badge">{items.length}/{GLOBAL_RESOURCE_LIMIT}</span>
    </div>

    {showHelp ? <div className="source-profile-resource-help" role="note">
      <strong>Wat stel je hier in?</strong>
      <p><b>Label</b> is de tekst op de knop. <b>Betekenis</b> is de interne rol van het document. <b>Type</b> bepaalt of de app later een bestand in de bron zoekt of een externe link gebruikt.</p>
      <p>Voor bronbestanden bepaalt de <b>herkenningsregel</b> hoe de bestandsnaam wordt gevonden. Met bestandstypes beperk je welke extensies meetellen; hoofdlettergevoelig maakt de tekstvergelijking exact.</p>
    </div> : null}

    {embedded
      ? <div className="source-profile-resource-form source-profile-resource-form-embedded">{editorFields}</div>
      : <form action={action} className="source-profile-resource-form">{editorFields}</form>}
  </section>;
}

function ResourceOrderActions({ index, count, onMove, onDelete }: { index: number; count: number; onMove: (index: number, direction: -1 | 1) => void; onDelete: () => void }) {
  return <div className="source-profile-resource-order-actions">
    <button className="icon-button" type="button" onClick={() => onMove(index, -1)} disabled={index === 0} aria-label="Omhoog" title="Omhoog"><ArrowUp size={16} aria-hidden /></button>
    <button className="icon-button" type="button" onClick={() => onMove(index, 1)} disabled={index === count - 1} aria-label="Omlaag" title="Omlaag"><ArrowDown size={16} aria-hidden /></button>
    <button className="icon-button danger-icon-button" type="button" onClick={onDelete} aria-label="Verwijderen" title="Verwijderen"><Trash2 size={16} aria-hidden /></button>
  </div>;
}

function IconPicker({ value, onChange }: { value: GlobalResourceIcon; onChange: (icon: GlobalResourceIcon) => void }) {
  const [open, setOpen] = useState(false);
  const SelectedIcon = iconComponents[value];
  return <div className="source-profile-icon-picker-field">
    <span>Icoon</span>
    <div className="source-profile-icon-picker">
      <button className="source-profile-icon-picker-trigger" type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-label="Icoon kiezen"><SelectedIcon size={18} aria-hidden /><ChevronDown size={15} aria-hidden /></button>
      {open ? <div className="source-profile-icon-picker-menu" role="listbox" aria-label="Beschikbare iconen">
        {globalResourceSelectableIcons.map((icon) => {
          const Icon = iconComponents[icon];
          const label = iconLabel(icon);
          return <button key={icon} className={icon === value ? "is-selected" : ""} type="button" onClick={() => { onChange(icon); setOpen(false); }} role="option" aria-selected={icon === value} title={label}><Icon size={19} aria-hidden /><span>{label}</span></button>;
        })}
      </div> : null}
    </div>
  </div>;
}

function iconLabel(icon: GlobalResourceIcon): string {
  const labels: Record<GlobalResourceIcon, string> = {
    "file-text": "Document",
    lightbulb: "Idee",
    "circle-check-big": "Controle",
    "book-open": "Boek",
    link: "Link",
    "external-link": "Externe link",
    youtube: "Video (oud)",
    calculator: "Rekenmachine",
    astroid: "Stervorm",
    "land-plot": "Terrein",
    "drafting-compass": "Passer",
    brain: "Brein",
    "flask-conical": "Proef",
    "key-round": "Sleutel",
    star: "Ster",
    shapes: "Vormen",
    "notebook-pen": "Notities",
    pencil: "Potlood",
    paperclip: "Paperclip",
    "scroll-text": "Tekstrol",
    map: "Kaart",
    "book-search": "Boek zoeken",
    sparkles: "Extra",
    clapperboard: "Film",
    "monitor-play": "Video",
    puzzle: "Puzzel",
    "file-clock": "Planning",
    "map-pinned": "Locatiekaart",
  };
  return labels[icon];
}

function normalizeOrders(resources: readonly GlobalResourceConfig[]): GlobalResourceConfig[] {
  return resources.map((resource, index) => ({ ...resource, order: (index + 1) * 10 }));
}

function newSourceFileResource(existing: readonly GlobalResourceConfig[]): GlobalResourceConfig {
  let suffix = 1;
  let id = `document-${suffix}`;
  const ids = new Set(existing.map((resource) => resource.id));
  while (ids.has(id)) id = `document-${++suffix}`;
  return {
    id,
    kind: "source_file",
    label: "Nieuw document",
    icon: "file-text",
    order: (existing.length + 1) * 10,
    semanticRole: "generic",
    recognition: { target: "file_name", operator: "contains", value: "Document", caseSensitive: false, fileExtensions: ["pdf"] },
  };
}

function changeKind(resource: GlobalResourceConfig, kind: GlobalResourceConfig["kind"]): GlobalResourceConfig {
  if (resource.kind === kind) return resource;
  if (kind === "external_link") {
    return { id: resource.id, kind, label: resource.label, icon: resource.icon, order: resource.order, semanticRole: resource.semanticRole };
  }
  return {
    id: resource.id,
    kind,
    label: resource.label,
    icon: resource.icon,
    order: resource.order,
    semanticRole: resource.semanticRole,
    recognition: { target: "file_name", operator: "contains", value: resource.label || "Document", caseSensitive: false, fileExtensions: ["pdf"] },
  };
}

function toggleExtension(resource: Extract<GlobalResourceConfig, { kind: "source_file" }>, extension: GlobalResourceFileExtension): GlobalResourceConfig {
  const selected = resource.recognition.fileExtensions.includes(extension)
    ? resource.recognition.fileExtensions.filter((candidate) => candidate !== extension)
    : [...resource.recognition.fileExtensions, extension];
  return { ...resource, recognition: { ...resource.recognition, fileExtensions: selected } };
}
