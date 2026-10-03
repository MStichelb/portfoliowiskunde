"use client";

import { useEffect, useMemo, useState } from "react";

import type {
  ExerciseMode,
  ExerciseLevelRecognitionConfig,
  ExerciseResourceConfig,
  ExerciseScannerConfig,
  PortfolioScannerConfig,
} from "@/lib/source-profile-config";

import styles from "./portfolio-resource-scanner-v2.module.css";
import { SourceProfileExerciseResourcesEditor } from "./source-profile-exercise-resources-editor";
import { SourceProfileExerciseScannerEditor } from "./source-profile-exercise-scanner-editor";
import { SourceProfileLevelRecognitionEditor } from "./source-profile-level-recognition-editor";
import { SourceProfileStructurePreview } from "./source-profile-structure-preview";

export function SourceProfileExerciseConfigurationEditors({
  scanner,
  portfolioScanner,
  resources,
  levelRecognition,
  ownerIdField,
  ownerId,
  editorKey,
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

  return <>
    <section className="source-profile-resource-editor" aria-labelledby="portfolio-scanner-heading">
      <div className="source-profile-resource-editor-heading">
        <div>
          <h3 id="portfolio-scanner-heading">Portfolio's en onderdelen herkennen</h3>
          <p>Stel de vaste tekst in waarmee een portfoliomap begint.</p>
        </div>
      </div>
      <div className="source-profile-resource-form source-profile-resource-form-embedded">
        <input type="hidden" name="portfolioScannerJson" value={JSON.stringify(portfolioScannerPreview)} />
        <div className={styles.scannerControls}>
          <label className={styles.stackedField}>Portfoliomarker
            <input
              className={styles.control}
              aria-label="Portfoliomarker"
              value={portfolioScannerPreview.marker}
              maxLength={40}
              required
              onChange={(event) => setPortfolioScannerPreview({ marker: event.target.value })}
            />
            <small className={styles.levelRecognitionHint}>De marker bepaalt welke mappen als portfolio worden herkend, bv. Portfolio1A, H2 of Bundel3B.</small>
          </label>
          <p className={styles.levelRecognitionHint}>Onderdelen zijn directe submappen die met een nummer beginnen, zoals <code>1 Inleiding</code> of <code>2 - Toepassingen</code>. Een map <code>Uitwerkingen</code> is niet nodig.</p>
        </div>
      </div>
    </section>
    <SourceProfileExerciseScannerEditor
      scanner={scanner}
      editorKey={editorKey}
      embedded
      onDirtyChange={setExerciseScannerDirty}
      onChange={setScannerPreview}
    />
    <SourceProfileExerciseResourcesEditor
      resources={resources}
      ownerIdField={ownerIdField}
      ownerId={ownerId}
      embedded
      exerciseMode={exerciseMode}
      onDirtyChange={onResourcesDirtyChange}
      onChange={setPreviewResources}
    />
    <SourceProfileLevelRecognitionEditor
      recognition={levelRecognition}
      resources={previewResources}
      exerciseMode={exerciseMode}
      onDirtyChange={onLevelRecognitionDirtyChange}
      onChange={setPreviewLevelRecognition}
    />
    <SourceProfileStructurePreview portfolioScanner={portfolioScannerPreview} scanner={scannerPreview} resources={previewResources} levelRecognition={previewLevelRecognition} />
  </>;
}
