"use client";

import { useState } from "react";

import type {
  ExerciseMode,
  ExerciseResourceConfig,
  ExerciseScannerConfig,
} from "@/lib/source-profile-config";

import { SourceProfileExerciseResourcesEditor } from "./source-profile-exercise-resources-editor";
import { SourceProfileExerciseScannerEditor } from "./source-profile-exercise-scanner-editor";

export function SourceProfileExerciseConfigurationEditors({
  scanner,
  resources,
  ownerIdField,
  ownerId,
  editorKey,
  onScannerDirtyChange,
  onResourcesDirtyChange,
}: {
  scanner: ExerciseScannerConfig;
  resources: readonly ExerciseResourceConfig[];
  ownerIdField: "sourceProfileId" | "templateId";
  ownerId: string;
  editorKey: string;
  onScannerDirtyChange?: (dirty: boolean) => void;
  onResourcesDirtyChange?: (dirty: boolean) => void;
}) {
  const [exerciseMode, setExerciseMode] = useState<ExerciseMode>(scanner.exerciseMode);

  return <>
    <SourceProfileExerciseScannerEditor
      scanner={scanner}
      editorKey={editorKey}
      embedded
      onDirtyChange={onScannerDirtyChange}
      onChange={(next) => setExerciseMode(next.exerciseMode)}
    />
    <SourceProfileExerciseResourcesEditor
      resources={resources}
      ownerIdField={ownerIdField}
      ownerId={ownerId}
      embedded
      exerciseMode={exerciseMode}
      onDirtyChange={onResourcesDirtyChange}
    />
  </>;
}
