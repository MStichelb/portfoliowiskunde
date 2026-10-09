"use client";

import { MutationFeedbackForm } from "./mutation-feedback-form";

import { Eye, EyeOff } from "lucide-react";

import {
  saveExerciseLevelAction,
  toggleExerciseAlternativeVisibilityAction,
  toggleExerciseVisibilityAction,
} from "@/app/admin/actions";
import { ExerciseLevelInlineEditor } from "@/app/components/exercise-level-inline-editor";
import { ExerciseNoteButton } from "@/app/components/exercise-note-button";
import { PublicationStatus } from "@/app/components/publication-status";
import type { ExerciseNoteReturnContext } from "@/lib/admin-routes";
import { DEFAULT_EXERCISE_LABEL_SINGULAR, formatTerminologyLabel } from "@/lib/collection-terminology";
import type { ExerciseLevel, ExerciseLevelOverrideMode } from "@/lib/exercise-level";
import type { ExerciseLevelPresentation } from "@/lib/exercise-level-presentation";
import type { ExerciseNotePosition } from "@/lib/exercise-note";
import type { EffectivePublication } from "@/lib/publication";

export interface ExerciseAdminControlData {
  id: string;
  code: string;
  levelSource: ExerciseLevel | null;
  levelOverrideMode: ExerciseLevelOverrideMode;
  levelOverride: ExerciseLevel | null;
  effectiveLevel: ExerciseLevel | null;
  configuredVisible: boolean;
  status: EffectivePublication;
  standardAssets: number;
  alternativeAssets: number;
  showAlternativeToStudents: boolean;
  noteLabel: string | null;
  customNote: string | null;
  notePosition: ExerciseNotePosition;
}

export function ExerciseAdminControls({
  exercise,
  portfolioId,
  learningSpaceId,
  levelPresentation,
  exerciseLabelSingular = DEFAULT_EXERCISE_LABEL_SINGULAR,
  returnContext = "portfolio",
}: {
  exercise: ExerciseAdminControlData;
  portfolioId: string;
  learningSpaceId: string;
  levelPresentation?: ExerciseLevelPresentation;
  exerciseLabelSingular?: string;
  returnContext?: ExerciseNoteReturnContext;
}) {
  const singularInline = formatTerminologyLabel(exerciseLabelSingular, "inline");
  return <>
    <td><ExerciseLevelInlineEditor exerciseId={exercise.id} learningSpaceId={learningSpaceId} levelSource={exercise.levelSource} levelOverrideMode={exercise.levelOverrideMode} levelOverride={exercise.levelOverride} effectiveLevel={exercise.effectiveLevel} presentation={levelPresentation} returnContext={returnContext} action={saveExerciseLevelAction} /></td>
    <td><ExerciseNoteButton exerciseId={exercise.id} exerciseCode={exercise.code} exerciseLabelSingular={exerciseLabelSingular} noteLabel={exercise.noteLabel} customNote={exercise.customNote} notePosition={exercise.notePosition} returnContext={returnContext} /></td>
    <td><MutationFeedbackForm action={toggleExerciseVisibilityAction} errorMessage="De wijziging kon niet worden opgeslagen. Probeer opnieuw."><input type="hidden" name="id" value={exercise.id} /><input type="hidden" name="portfolioId" value={portfolioId} /><input type="hidden" name="visible" value={String(!exercise.configuredVisible)} /><button className="visibility-toggle">{exercise.configuredVisible ? <Eye size={16} aria-hidden /> : <EyeOff size={16} aria-hidden />}{exercise.configuredVisible ? "Zichtbaar" : "Verborgen"}</button></MutationFeedbackForm></td>
    <td><PublicationStatus status={exercise.status} /></td>
    <td>{exercise.alternativeAssets > 0 ? <MutationFeedbackForm action={toggleExerciseAlternativeVisibilityAction} className="alternative-toggle" errorMessage="De wijziging kon niet worden opgeslagen. Probeer opnieuw."><input type="hidden" name="id" value={exercise.id} /><input type="hidden" name="portfolioId" value={portfolioId} /><input type="hidden" name="visible" value={String(!exercise.showAlternativeToStudents)} /><input aria-label={`Alternatieve uitwerking voor ${singularInline} ${exercise.code} tonen`} title="Alternatieve uitwerking voor leerlingen tonen" type="checkbox" checked={exercise.showAlternativeToStudents} onChange={(event) => event.currentTarget.form?.requestSubmit()} /></MutationFeedbackForm> : "-"}</td>
    <td>{exercise.alternativeAssets > 0 ? `${exercise.standardAssets}, ${exercise.alternativeAssets}` : exercise.standardAssets}</td>
  </>;
}
