import type { CSSProperties } from "react";

import type { ExerciseLevel } from "@/lib/exercise-level";
import { exerciseLevelVisual, type ExerciseLevelPresentation, type ExerciseLevelRenderingContext } from "@/lib/exercise-level-presentation";

export function ExerciseLevelBadge({ level, presentation, context = "admin" }: { level: ExerciseLevel | null; presentation?: ExerciseLevelPresentation; context?: ExerciseLevelRenderingContext }) {
  const visual = exerciseLevelVisual(level, presentation, context);
  const style: CSSProperties | undefined = visual.color
    ? { ...(visual.backgroundColor ? { backgroundColor: visual.backgroundColor } : {}), color: visual.color }
    : undefined;
  const symbolOnly = Boolean(visual.color && !visual.backgroundColor);
  return <span className={`exercise-level-badge ${visual.colorClass}${symbolOnly ? " exercise-level-badge-symbol-only" : ""}`} style={style} aria-label={visual.label} title={visual.label}>{visual.symbols}</span>;
}
