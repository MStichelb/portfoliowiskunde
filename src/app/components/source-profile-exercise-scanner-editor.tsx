"use client";

import { useSourceProfileLabels } from "./source-profile-presentation";
import { exerciseNumberRuleLabel, exerciseModeContextLabel } from "@/lib/source-profile-recognition-labels";

import { CircleHelp } from "lucide-react";

import styles from "./portfolio-resource-scanner-v2.module.css";
import { useEffect, useMemo, useState } from "react";

import {
  exerciseModes,
  exerciseScannerSchema,
  type ExerciseMode,
  type ExerciseNumberLocation,
  type ExerciseScannerConfig,
} from "@/lib/source-profile-config";

type SourceProfileExerciseScannerEditorProps = {
  scanner: ExerciseScannerConfig;
  editorKey?: string;
  embedded?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onChange?: (scanner: ExerciseScannerConfig) => void;
};

export function SourceProfileExerciseScannerEditor(props: SourceProfileExerciseScannerEditorProps) {
  const initial = useMemo(() => exerciseScannerSchema.parse(props.scanner), [props.scanner]);
  const resetKey = `${props.editorKey ?? "scanner"}:${JSON.stringify(initial)}`;
  return <SourceProfileExerciseScannerEditorState key={resetKey} {...props} initial={initial} />;
}

function SourceProfileExerciseScannerEditorState({
  initial,
  embedded = false,
  onDirtyChange,
  onChange,
}: SourceProfileExerciseScannerEditorProps & { initial: ExerciseScannerConfig }) {
  const labels = useSourceProfileLabels();
  const baseline = useMemo(() => JSON.stringify(initial), [initial]);
  const [value, setValue] = useState<ExerciseScannerConfig>(initial);
  const [showHelp, setShowHelp] = useState(false);
  const serialized = JSON.stringify(value);

  useEffect(() => {
    onDirtyChange?.(serialized !== baseline);
  }, [baseline, onDirtyChange, serialized]);

  const update = (next: ExerciseScannerConfig) => {
    setValue(next);
    onChange?.(next);
  };

  const fields = <>
    <input type="hidden" name="exerciseScannerJson" value={serialized} />
    <div className={styles.scannerControls}>
      <label className={styles.stackedField}>Hoe komen {labels.exercises} voor?
        <select
          className={styles.control}
          aria-label={`Hoe komen ${labels.exercises} voor?`}
          value={value.exerciseMode}
          onChange={(event) => update({ ...value, exerciseMode: event.target.value as ExerciseMode })}
        >
          {exerciseModes.map((mode) => <option key={mode} value={mode}>{exerciseModeContextLabel(mode)}</option>)}
        </select>
      </label>
      <div className={styles.twoColumnControls}>
        <select
          className={styles.control}
          id="exercise-number-location"
          aria-label={`${labels.terms.exercise.singular}nummer vinden`}
          value={value.numberLocation}
          onChange={(event) => update({ ...value, numberLocation: event.target.value as ExerciseNumberLocation })}
        >
          {(["after_text", "start"] as const).map((location) => <option key={location} value={location}>{exerciseNumberRuleLabel({ ...value, numberLocation: location })}</option>)}
        </select>
        {value.numberLocation === "after_text" ? <input
          className={styles.control}
          aria-label={`Tekst voor ${labels.exercise}nummer`}
          value={value.marker}
          maxLength={40}
          required
          onChange={(event) => update({ ...value, marker: event.target.value })}
        /> : null}
      </div>
    </div>
  </>;

  return <section className="source-profile-resource-editor" aria-labelledby="exercise-scanner-heading">
    <div className="source-profile-resource-editor-heading">
      <div>
        <div className="source-profile-resource-title-row">
          <h3 id="exercise-scanner-heading">{labels.exerciseHeading}</h3>
          <button className="source-profile-help-button" type="button" onClick={() => setShowHelp((current) => !current)} aria-expanded={showHelp} aria-label={`Uitleg over ${labels.exerciseHeading.toLocaleLowerCase("nl")}`} title={`Uitleg over ${labels.exerciseHeading.toLocaleLowerCase("nl")}`}><CircleHelp size={17} aria-hidden /></button>
        </div>
        <p>Stel in waar het {labels.exercise}nummer in bestands- en mapnamen begint.</p>
      </div>
    </div>
    {showHelp ? <div className="source-profile-resource-help" role="note">
      <strong>Hoe werkt de herkenning?</strong>
      <p>De code van de {labels.collection} komt uit de map en hoeft niet uit de bestandsnaam te worden gehaald.</p>
      <p>Ondersteund zijn bijvoorbeeld <code>3</code>, <code>12</code>, <code>3a</code>, <code>12b</code> en <code>3a1</code>. Een naam als <code>Oef3a(1).png</code> blijft {labels.exercise} <code>3a</code>; <code>(1)</code> kan een extra bestand voorstellen.</p>
      <p>Kies eerst bestanden, mappen of beide. De materiaalregels bepalen vervolgens welke bestanden bij de {labels.exercise} horen.</p>
    </div> : null}
    {embedded ? <div className="source-profile-resource-form source-profile-resource-form-embedded">{fields}</div> : <div className="source-profile-resource-form">{fields}</div>}
  </section>;
}
