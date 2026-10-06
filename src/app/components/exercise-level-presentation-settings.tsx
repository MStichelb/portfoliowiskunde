"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";

import { ExerciseLevelBadge } from "@/app/components/exercise-level-badge";
import { EXERCISE_LEVELS, type ExerciseLevel } from "@/lib/exercise-level";
import {
  DEFAULT_EXERCISE_LEVEL_PRESENTATION,
  EXERCISE_LEVEL_DISPLAY_NAME_MAX_LENGTH,
  EXERCISE_LEVEL_SYMBOLS,
  resetExerciseLevelPresentation,
  type ExerciseLevelPresentation,
  type ExerciseLevelSymbolId,
} from "@/lib/exercise-level-presentation";

export function ExerciseLevelPresentationSettings({ initialPresentation, layout = "rows" }: { initialPresentation?: ExerciseLevelPresentation; layout?: "rows" | "cards" }) {
  const [presentation, setPresentation] = useState<ExerciseLevelPresentation>(initialPresentation ?? DEFAULT_EXERCISE_LEVEL_PRESENTATION);
  const update = (level: ExerciseLevel, item: Partial<ExerciseLevelPresentation[ExerciseLevel]>) => {
    setPresentation((current) => ({ ...current, [level]: { ...current[level], ...item } }));
  };
  const reset = (level: ExerciseLevel) => {
    setPresentation((current) => resetExerciseLevelPresentation(current, level));
  };

  return <div className={`personalization-settings-section exercise-level-presentation-settings${layout === "cards" ? " exercise-level-presentation-cards" : ""}`}>
    <div><h3>Niveaus</h3><p>Pas per niveau de naam, het symbool, het aantal, de kleur en de leerlingachtergrond aan.</p></div>
    <div className="exercise-level-presentation-list">
      {EXERCISE_LEVELS.map((level) => <div className="exercise-level-presentation-row" key={level}>
        <label>Weergavenaam
          <input name={`levelName_${level}`} value={presentation[level].displayName} onChange={(event) => update(level, { displayName: event.target.value })} required maxLength={EXERCISE_LEVEL_DISPLAY_NAME_MAX_LENGTH} />
        </label>
        <label>Symbool
          <select name={`levelSymbol_${level}`} value={presentation[level].symbolId} onChange={(event) => update(level, { symbolId: event.target.value as ExerciseLevelSymbolId })}>
            {EXERCISE_LEVEL_SYMBOLS.map((symbol) => <option value={symbol.id} key={symbol.id}>{symbol.glyph} {symbol.label}</option>)}
          </select>
        </label>
        <label>Aantal
          <select name={`levelCount_${level}`} value={presentation[level].count} onChange={(event) => update(level, { count: Number(event.target.value) })}>
            {[1, 2, 3, 4].map((count) => <option value={count} key={count}>{count}</option>)}
          </select>
        </label>
        <label className="color-field">Kleur
          <span><input name={`levelColor_${level}`} type="color" value={presentation[level].color} onChange={(event) => update(level, { color: event.target.value.toUpperCase() })} /><code>{presentation[level].color}</code></span>
        </label>
        <label className="exercise-level-public-background">Achtergrond
          <input name={`levelShowPublicBackground_${level}`} type="checkbox" value="true" checked={presentation[level].showPublicBackground} onChange={(event) => update(level, { showPublicBackground: event.target.checked })} />
        </label>
        {layout === "cards" ? <div className="exercise-level-preview-field"><span>Voorbeeld</span><span className="exercise-level-presentation-preview"><ExerciseLevelBadge level={level} presentation={presentation} context="public" /></span></div> : <span className="exercise-level-presentation-preview"><span className="sr-only">Voorbeeld: </span><ExerciseLevelBadge level={level} presentation={presentation} context="public" /></span>}
        <button className="mini-icon-button exercise-level-presentation-reset" type="button" onClick={() => reset(level)} aria-label={`Herstel standaardinstellingen voor ${presentation[level].displayName}`} title="Standaard herstellen"><RotateCcw size={15} aria-hidden /></button>
      </div>)}
    </div>
  </div>;
}
