"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import type {
  GlobalResourceConfig,
  ExerciseMode,
  ExerciseLevelRecognitionConfig,
  ExerciseResourceConfig,
  ExerciseScannerConfig,
  PortfolioScannerConfig,
} from "@/lib/source-profile-config";

import { EXERCISE_LEVEL_LABELS } from "@/lib/exercise-level-presentation";
import type { ExerciseLevel } from "@/lib/exercise-level";
import styles from "./portfolio-resource-scanner-v2.module.css";
import { useSourceProfileLabels } from "./source-profile-presentation";
import { portfolioNumberRuleLabel, sectionNumberRuleLabel, exerciseNumberRuleLabel, exerciseModeContextLabel } from "@/lib/source-profile-recognition-labels";
import { SourceProfileGlobalResourcesEditor, SourceProfileGlobalResourcesViewer } from "./source-profile-global-resources-editor";
import { SourceProfileExerciseResourcesViewer, SourceProfileExerciseResourcesEditor } from "./source-profile-exercise-resources-editor";
import { SourceProfileExerciseScannerEditor } from "./source-profile-exercise-scanner-editor";
import { SourceProfileLevelRecognitionEditor } from "./source-profile-level-recognition-editor";
import { SourceProfileTabs } from "./source-profile-section-tabs";
import { SourceProfileStructurePreview } from "./source-profile-structure-preview";

export function SourceProfileExerciseConfigurationEditors({
  scanner,
  portfolioScanner,
  resources,
  levelRecognition,
  ownerIdField,
  ownerId,
  editorKey,
  globalResources = [],
  overview,
  onGlobalResourcesDirtyChange,
  readOnly = false,
  onScannerDirtyChange,
  onResourcesDirtyChange,
  onLevelRecognitionDirtyChange,
}: {
  scanner: ExerciseScannerConfig;
  portfolioScanner: PortfolioScannerConfig;
  resources: readonly ExerciseResourceConfig[];
  levelRecognition: ExerciseLevelRecognitionConfig;
  ownerIdField: "sourceProfileId" | "templateId";
  ownerId: string;
  editorKey: string;
  globalResources?: readonly GlobalResourceConfig[];
  overview?: ReactNode;
  onGlobalResourcesDirtyChange?: (dirty: boolean) => void;
  readOnly?: boolean;
  onScannerDirtyChange?: (dirty: boolean) => void;
  onResourcesDirtyChange?: (dirty: boolean) => void;
  onLevelRecognitionDirtyChange?: (dirty: boolean) => void;
}) {
  const portfolioBaseline = useMemo(() => JSON.stringify(portfolioScanner), [portfolioScanner]);
  const [portfolioScannerPreview, setPortfolioScannerPreview] = useState<PortfolioScannerConfig>(portfolioScanner);
  const [scannerPreview, setScannerPreview] = useState<ExerciseScannerConfig>(scanner);
  const [exerciseScannerDirty, setExerciseScannerDirty] = useState(false);
  const [previewResources, setPreviewResources] = useState<ExerciseResourceConfig[]>(() => [...resources]);
  const [previewLevelRecognition, setPreviewLevelRecognition] = useState<ExerciseLevelRecognitionConfig>(levelRecognition);
  const exerciseMode: ExerciseMode = scannerPreview.exerciseMode;
  const portfolioScannerDirty = JSON.stringify(portfolioScannerPreview) !== portfolioBaseline;

  useEffect(() => {
    onScannerDirtyChange?.(portfolioScannerDirty || exerciseScannerDirty);
  }, [exerciseScannerDirty, onScannerDirtyChange, portfolioScannerDirty]);

  const labels = useSourceProfileLabels();
  const levelSourceId = levelRecognition.method !== "none" && levelRecognition.source.type === "exercise_resource" ? levelRecognition.source.resourceId : null;
  const levelSourceLabel = resources.find((resource) => resource.id === levelSourceId)?.label ?? "het gekozen materiaal";
  const sectionId = (section: string) => `${editorKey}-profile-${section}`;
  return <div className="source-profile-config-sections">
    <SourceProfileTabs keepMounted className="source-profile-editor-tabs" panelClassName="source-profile-editor-panel" ariaLabel="Bronprofielinstellingen" panels={[
      { id: "overview", label: "Overzicht", content: <section className="source-profile-overview-section"><h3>Overzicht</h3>{overview}</section> },
      { id: "structure", label: "Structuur", content: <section id={sectionId("structure")} className="source-profile-resource-editor">
      <div className="source-profile-resource-editor-heading"><div><h3>Structuur</h3><p>Groepeer {labels.collections} eventueel via één mapniveau.</p></div></div>
      {readOnly ? <p>{portfolioScanner.themeMode === "folder" ? `Eén mapniveau als ${labels.themes}` : `Geen ${labels.themes} uit mappen`}</p> : <div className="source-profile-resource-form source-profile-resource-form-embedded">
        <input type="hidden" name="portfolioScannerJson" value={JSON.stringify(portfolioScannerPreview)} />
        <label className={styles.stackedField}>Groepering uit mappen
          <select className={styles.control} value={portfolioScannerPreview.themeMode} onChange={(event) => setPortfolioScannerPreview({ ...portfolioScannerPreview, themeMode: event.target.value === "folder" ? "folder" : "none" })}>
            <option value="none">Geen {labels.themes} uit mappen</option>
            <option value="folder">Gebruik één mapniveau als {labels.themes}</option>
          </select>
        </label>
      </div>}
    </section> },
      { id: "collection", label: labels.tabCollection, content: <section id={sectionId("collection")} className="source-profile-resource-editor">
      <div className="source-profile-resource-editor-heading"><div><h3>{labels.collectionHeading}</h3><p>{portfolioNumberRuleLabel(portfolioScannerPreview)}</p></div></div>
      {readOnly ? null : <div className="source-profile-resource-form source-profile-resource-form-embedded"><label className={styles.stackedField}>Mapnaam begint met
        <input className={styles.control} aria-label="Mapnaam begint met" value={portfolioScannerPreview.marker} maxLength={40} required onChange={(event) => setPortfolioScannerPreview({ ...portfolioScannerPreview, marker: event.target.value })} />
      </label></div>}
      <p className="source-profile-resource-note">{portfolioScannerPreview.marker.trim() ? <>Na deze vaste tekst volgt de code, bijvoorbeeld <code>{portfolioScannerPreview.marker}1.1 - Stelsels</code>. De tekst na de code wordt de titel.</> : "Dit bronprofiel vereist vaste tekst vóór de code."}</p>
    </section> },
      { id: "documents", label: "Documenten", content: <div id={sectionId("documents")}>{readOnly ? <SourceProfileGlobalResourcesViewer resources={globalResources} /> : <SourceProfileGlobalResourcesEditor resources={globalResources} ownerIdField={ownerIdField} ownerId={ownerId} embedded onDirtyChange={onGlobalResourcesDirtyChange} />}</div> },
      { id: "sections", label: labels.tabSection, content: <section id={sectionId("sections")} className="source-profile-resource-editor">
      <div className="source-profile-resource-editor-heading"><div><h3>{labels.sectionHeading}</h3><p>{sectionNumberRuleLabel()}</p></div></div>
      <p className="source-profile-resource-note">Tekst na de code wordt de naam. Zonder zulke submappen staan {labels.exercises} rechtstreeks in de {labels.collection}. Letter-startende codes worden niet herkend.</p>
    </section> },
      { id: "exercises", label: labels.tabExercise, content: <div id={sectionId("exercises")}>
      {readOnly ? <section className="source-profile-resource-editor">
        <div className="source-profile-resource-editor-heading"><h3>{labels.exerciseHeading}</h3></div>
        <p>{exerciseModeContextLabel(exerciseMode)}. {exerciseNumberRuleLabel(scannerPreview)}</p>
      </section> : <SourceProfileExerciseScannerEditor scanner={scanner} editorKey={editorKey} embedded onDirtyChange={setExerciseScannerDirty} onChange={setScannerPreview} />}
    </div> },
      { id: "materials", label: "Materialen", content: <div id={sectionId("materials")}>
      {readOnly ? <SourceProfileExerciseResourcesViewer resources={resources} exerciseMode={exerciseMode} /> : <SourceProfileExerciseResourcesEditor resources={resources} ownerIdField={ownerIdField} ownerId={ownerId} embedded exerciseMode={exerciseMode} onDirtyChange={onResourcesDirtyChange} onChange={setPreviewResources} />}
    </div> },
      { id: "levels", label: "Niveaus", content: <div id={sectionId("levels")}>
      {readOnly ? <section className="source-profile-resource-editor">
        <div className="source-profile-resource-editor-heading"><h3>Niveaus</h3></div>
        <p>{levelRecognition.method === "none" ? "Geen automatische herkenning" : levelRecognition.method === "subdirectory" ? "Niveau via submappen bepalen" : levelRecognition.source.type === "exercise_directory" ? `Niveau uit mapnaam van ${labels.exercise} bepalen` : "Niveau uit bestandsnaam bepalen"}</p>
        {levelRecognition.method !== "none" ? <>
          {levelRecognition.source.type === "exercise_resource" ? <p>Niveau bepalen via {levelSourceLabel}.</p> : null}
          {levelRecognition.method === "marker" ? <p>{levelRecognition.source.type === "exercise_directory" ? "Mapnaam" : "Bestandsnaam"} {levelRecognition.convention === "suffix_code" ? "eindigt op de niveaucode." : <>bevat de vaste tekst <code>{levelRecognition.prefix}</code> gevolgd door de niveaucode.</>}</p> : null}
          <dl className="source-profile-level-summary">
            {Object.entries(levelRecognition.mapping).map(([level, value]) => <div key={level}><dt>{EXERCISE_LEVEL_LABELS[level as ExerciseLevel]}</dt><dd>{value || "Niet ingesteld"}</dd></div>)}
          </dl>
        </> : null}
      </section> : <SourceProfileLevelRecognitionEditor recognition={levelRecognition} resources={previewResources} exerciseMode={exerciseMode} onDirtyChange={onLevelRecognitionDirtyChange} onChange={setPreviewLevelRecognition} />}
    </div> },
      { id: "preview", label: "Voorbeeld", content: <div id={sectionId("preview")}><SourceProfileStructurePreview headingId={sectionId("preview-heading")} portfolioScanner={portfolioScannerPreview} scanner={scannerPreview} resources={previewResources} levelRecognition={previewLevelRecognition} /></div> },
    ]} />
  </div>;
}
