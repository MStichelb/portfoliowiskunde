"use client";

import { useSourceProfileLabels } from "./source-profile-presentation";

import { useEffect, useMemo, useState } from "react";

import { EXERCISE_LEVELS, type ExerciseLevel } from "@/lib/exercise-level";
import { EXERCISE_LEVEL_LABELS } from "@/lib/exercise-level-presentation";
import {
  DEFAULT_EXERCISE_LEVEL_MARKER_MAPPING,
  DEFAULT_EXERCISE_LEVEL_SUBDIRECTORY_MAPPING,
  exerciseLevelRecognitionSchema,
  type ExerciseLevelMarkerConvention,
  type ExerciseLevelRecognitionConfig,
  type ExerciseMode,
  type ExerciseResourceConfig,
} from "@/lib/source-profile-config";

import styles from "./portfolio-resource-scanner-v2.module.css";

export type LevelRecognitionChoice = "none" | "subdirectory" | "resource_file_name" | "exercise_directory_name";

const internalLevelNumbers: Record<ExerciseLevel, number> = {
  opwarmer: 1,
  basis: 2,
  uitdaging: 3,
  verdieping: 4,
};

export function levelRecognitionChoice(config: ExerciseLevelRecognitionConfig): LevelRecognitionChoice {
  if (config.method === "none" || config.method === "subdirectory") return config.method;
  return config.source.type === "exercise_resource" ? "resource_file_name" : "exercise_directory_name";
}

export function suitableLevelSourceResources(
  resources: readonly ExerciseResourceConfig[],
  exerciseMode: ExerciseMode,
): ExerciseResourceConfig[] {
  return resources.filter((resource) => exerciseMode === "files"
    ? resource.recognition.file !== null
    : exerciseMode === "directories"
      ? resource.recognition.directory !== null
      : resource.recognition.file !== null && resource.recognition.directory !== null);
}

export function configForLevelRecognitionChoice(
  choice: LevelRecognitionChoice,
  current: ExerciseLevelRecognitionConfig,
  resources: readonly ExerciseResourceConfig[],
  exerciseMode: ExerciseMode,
): ExerciseLevelRecognitionConfig {
  if (choice === "none") return { method: "none" };

  const suitableResources = suitableLevelSourceResources(resources, exerciseMode);
  const currentResourceId = "source" in current && current.source.type === "exercise_resource" ? current.source.resourceId : null;
  const currentResource = currentResourceId
    ? suitableResources.find((resource) => resource.id === currentResourceId)
    : undefined;
  const resource = currentResource ?? suitableResources[0];

  if (choice === "subdirectory") {
    return {
      method: "subdirectory",
      source: resource ? { type: "exercise_resource", resourceId: resource.id } : { type: "exercise_directory" },
      mapping: current.method === "subdirectory" ? { ...current.mapping } : { ...DEFAULT_EXERCISE_LEVEL_SUBDIRECTORY_MAPPING },
    };
  }

  const marker = current.method === "marker"
    ? { convention: current.convention, prefix: current.prefix, mapping: { ...current.mapping } }
    : { convention: "suffix_code" as const, prefix: "", mapping: { ...DEFAULT_EXERCISE_LEVEL_MARKER_MAPPING } };

  if (choice === "exercise_directory_name") {
    return { method: "marker", source: { type: "exercise_directory" }, ...marker };
  }
  if (!resource) return { method: "none" };
  return { method: "marker", source: { type: "exercise_resource", resourceId: resource.id }, ...marker };
}

export function SourceProfileLevelRecognitionEditor({
  recognition,
  resources,
  exerciseMode,
  onDirtyChange,
  onChange,
}: {
  recognition: ExerciseLevelRecognitionConfig;
  resources: readonly ExerciseResourceConfig[];
  exerciseMode: ExerciseMode;
  onDirtyChange?: (dirty: boolean) => void;
  onChange?: (recognition: ExerciseLevelRecognitionConfig) => void;
}) {
  const labels = useSourceProfileLabels();
  const initial = useMemo(() => exerciseLevelRecognitionSchema.parse(recognition), [recognition]);
  const baseline = useMemo(() => JSON.stringify(initial), [initial]);
  const [value, setValue] = useState<ExerciseLevelRecognitionConfig>(initial);
  const serialized = JSON.stringify(value);
  const choice = levelRecognitionChoice(value);
  const suitableResources = suitableLevelSourceResources(resources, exerciseMode);

  useEffect(() => onDirtyChange?.(serialized !== baseline), [baseline, onDirtyChange, serialized]);

  const update = (next: ExerciseLevelRecognitionConfig) => {
    setValue(next);
    onChange?.(next);
  };
  const setChoice = (nextChoice: LevelRecognitionChoice) => {
    update(configForLevelRecognitionChoice(nextChoice, value, resources, exerciseMode));
  };
  const setResource = (resourceId: string) => {
    if (value.method !== "marker") return;
    update({ ...value, source: { type: "exercise_resource", resourceId } });
  };
  const setMapping = (level: ExerciseLevel, next: string) => {
    if (value.method === "none") return;
    update({ ...value, mapping: { ...value.mapping, [level]: next } });
  };
  const markerSubject = choice === "exercise_directory_name" ? "Mapnaam" : "Bestandsnaam";

  return <section className="source-profile-resource-editor" aria-labelledby="level-recognition-heading">
    <input type="hidden" name="levelRecognitionJson" value={serialized} />
    <div className="source-profile-resource-editor-heading">
      <div>
        <h3 id="level-recognition-heading">Niveaus</h3>
        <p>Herken het niveau van {labels.exercises} via de structuur of naam van je bronbestanden.</p>
        <p className={styles.levelRecognitionIntro}>De weergavenaam, kleur en symbolen stel je bij Personalisatie van je leeromgeving in.</p>
      </div>
    </div>
    <div className={`source-profile-resource-form source-profile-resource-form-embedded ${styles.levelRecognitionControls}`}>
      <label className={styles.stackedField}>Niveau automatisch bepalen
        <select className={styles.control} value={choice} onChange={(event) => setChoice(event.target.value as LevelRecognitionChoice)}>
          <option value="none">Geen automatische herkenning</option>
          <option value="subdirectory">Niveau via submappen bepalen</option>
          <option value="resource_file_name" disabled={suitableResources.length === 0}>Niveau uit bestandsnaam bepalen</option>
          <option value="exercise_directory_name" disabled={exerciseMode === "files"}>Niveau uit mapnaam van {labels.exercise} bepalen</option>
        </select>
      </label>

      {exerciseMode === "files" ? <p className={styles.levelRecognitionHint}>Niveau uit mapnaam is niet beschikbaar wanneer {labels.exercises} alleen als bestanden voorkomen.</p> : null}
      {choice === "exercise_directory_name" && exerciseMode === "files_and_directories" ? <p className={styles.levelRecognitionWarning}>Niveauherkenning via de mapnaam werkt alleen voor {labels.exercises} die als map voorkomen. Voor automatische herkenning van alle {labels.exercises} moeten ze allemaal als map voorkomen.</p> : null}

      {value.method !== "none" ? <>
        {choice === "resource_file_name" && value.method === "marker" ? <label className={styles.stackedField}>Niveau bepalen via
          <select className={styles.control} value={value.source.type === "exercise_resource" ? value.source.resourceId : ""} onChange={(event) => setResource(event.target.value)}>
            {suitableResources.map((resource) => <option key={resource.id} value={resource.id}>Bepalen via {resource.label}</option>)}
          </select>
        </label> : null}

        {value.method === "marker" ? <div className={styles.twoColumnControls}>
          <label className={styles.stackedField}>Herkenningsregel
            <select className={styles.control} value={value.convention} onChange={(event) => update({ ...value, convention: event.target.value as ExerciseLevelMarkerConvention })}>
              <option value="suffix_code">{markerSubject} eindigt op</option>
              <option value="prefixed_code">{markerSubject} bevat</option>
            </select>
          </label>
          {value.convention === "prefixed_code" ? <label className={styles.stackedField}>Vaste tekst
            <input className={styles.control} value={value.prefix} maxLength={20} placeholder="Niv" required onChange={(event) => update({ ...value, prefix: event.target.value })} />
          </label> : null}
        </div> : null}

        <div className={styles.levelMappingGrid}>
          {EXERCISE_LEVELS.map((level) => <label className={styles.stackedField} key={level}>Niveau {internalLevelNumbers[level]} · {EXERCISE_LEVEL_LABELS[level]}
            <input className={styles.control} value={value.mapping[level]} maxLength={40} onChange={(event) => setMapping(level, event.target.value)} />
          </label>)}
        </div>
      </> : <p className={styles.levelRecognitionHint}>Bestaande bronprofielen herkennen standaard geen niveaus automatisch.</p>}
    </div>
  </section>;
}
