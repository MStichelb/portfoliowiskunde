import { ExerciseLevelBadge } from "@/app/components/exercise-level-badge";
import type { ExerciseLevel, ExerciseLevelOverrideMode } from "@/lib/exercise-level";
import { DEFAULT_EXERCISE_LEVEL_PRESENTATION, exerciseLevelLabel, type ExerciseLevelPresentation } from "@/lib/exercise-level-presentation";

interface ExerciseLevelFormProps {
  exerciseId: string;
  learningSpaceId: string;
  levelSource: ExerciseLevel | null;
  levelOverrideMode: ExerciseLevelOverrideMode;
  levelOverride: ExerciseLevel | null;
  effectiveLevel: ExerciseLevel | null;
  presentation?: ExerciseLevelPresentation;
  action: (formData: FormData) => void | Promise<void>;
}

export function ExerciseLevelForm({
  exerciseId,
  learningSpaceId,
  levelSource,
  levelOverrideMode,
  levelOverride,
  effectiveLevel,
  presentation,
  action,
}: ExerciseLevelFormProps) {
  const resolvedPresentation = presentation ?? DEFAULT_EXERCISE_LEVEL_PRESENTATION;
  const selected = levelOverrideMode === "level" && levelOverride ? `level:${levelOverride}` : levelOverrideMode;
  const isManual = levelOverrideMode === "level" || levelOverrideMode === "none";
  return <form action={action} className="exercise-level-form">
    <input type="hidden" name="id" value={exerciseId} />
    <input type="hidden" name="learningSpaceId" value={learningSpaceId} />
    <label>Niveau
      <select name="levelChoice" defaultValue={selected}>
        <option value="inherit">Automatisch</option>
        <option value="none">Geen niveau</option>
        <option value="level:opwarmer">{resolvedPresentation.opwarmer.displayName}</option>
        <option value="level:basis">{resolvedPresentation.basis.displayName}</option>
        <option value="level:uitdaging">{resolvedPresentation.uitdaging.displayName}</option>
        <option value="level:verdieping">{resolvedPresentation.verdieping.displayName}</option>
      </select>
    </label>
    <button type="submit">Opslaan</button>
    <div className="exercise-level-summary">
      <span>Effectief: <ExerciseLevelBadge level={effectiveLevel} presentation={resolvedPresentation} /></span>
      <small>{isManual ? "Handmatig ingesteld" : "Automatisch overgenomen"}</small>
      {levelSource ? <small>Bronniveau: {exerciseLevelLabel(levelSource, resolvedPresentation)}</small> : <small>Nog geen niveau herkend</small>}
    </div>
  </form>;
}
