import { EXERCISE_LEVELS, type ExerciseLevel } from "@/lib/exercise-level";
import { deriveLightColor, isHexColor } from "@/lib/ui-colors";

export const EXERCISE_LEVEL_SYMBOLS = [
  { id: "star", glyph: "★", label: "Ster" },
  { id: "circle", glyph: "●", label: "Bol" },
  { id: "large_circle", glyph: "⬤", label: "Grote bol" },
  { id: "diamond", glyph: "◆", label: "Ruit" },
  { id: "square", glyph: "■", label: "Vierkant" },
  { id: "triangle", glyph: "▲", label: "Driehoek" },
] as const;

export type ExerciseLevelSymbolId = (typeof EXERCISE_LEVEL_SYMBOLS)[number]["id"];
export const EXERCISE_LEVEL_DISPLAY_NAME_MAX_LENGTH = 40;

export interface ExerciseLevelPresentationItem {
  displayName: string;
  symbolId: ExerciseLevelSymbolId;
  count: number;
  color: string;
  showPublicBackground: boolean;
}
export type ExerciseLevelPresentation = Record<ExerciseLevel, ExerciseLevelPresentationItem>;
export type ExerciseLevelRenderingContext = "admin" | "public";

export const EXERCISE_LEVEL_LABELS: Record<ExerciseLevel, string> = {
  opwarmer: "Opwarmer",
  basis: "Basis",
  uitdaging: "Uitdaging",
  verdieping: "Verdieping",
};

export const EXERCISE_LEVEL_COLOR_CLASSES: Record<ExerciseLevel, string> = {
  opwarmer: "exercise-level-opwarmer",
  basis: "exercise-level-basis",
  uitdaging: "exercise-level-uitdaging",
  verdieping: "exercise-level-verdieping",
};

export const DEFAULT_EXERCISE_LEVEL_PRESENTATION: ExerciseLevelPresentation = {
  opwarmer: { displayName: "Opwarmer", symbolId: "star", count: 1, color: "#00B050", showPublicBackground: false },
  basis: { displayName: "Basis", symbolId: "star", count: 2, color: "#BF8F00", showPublicBackground: false },
  uitdaging: { displayName: "Uitdaging", symbolId: "star", count: 3, color: "#C00000", showPublicBackground: false },
  verdieping: { displayName: "Verdieping", symbolId: "diamond", count: 1, color: "#2E74B5", showPublicBackground: false },
};

export function defaultExerciseLevelPresentationItem(level: ExerciseLevel): ExerciseLevelPresentationItem {
  return { ...DEFAULT_EXERCISE_LEVEL_PRESENTATION[level] };
}

export function resetExerciseLevelPresentation(presentation: ExerciseLevelPresentation, level: ExerciseLevel): ExerciseLevelPresentation {
  return { ...presentation, [level]: defaultExerciseLevelPresentationItem(level) };
}

export function isExerciseLevelSymbolId(value: unknown): value is ExerciseLevelSymbolId {
  return typeof value === "string" && EXERCISE_LEVEL_SYMBOLS.some((symbol) => symbol.id === value);
}

export function validateExerciseLevelPresentation(input: unknown): ExerciseLevelPresentation {
  if (!input || typeof input !== "object") throw new Error("Ongeldige niveaupresentatie.");
  const candidate = input as Partial<Record<ExerciseLevel, { displayName?: unknown; symbolId?: unknown; count?: unknown; color?: unknown; showPublicBackground?: unknown }>>;
  return Object.fromEntries(EXERCISE_LEVELS.map((level) => {
    const item = candidate[level];
    if (!item || !isExerciseLevelSymbolId(item.symbolId)) throw new Error(`Kies een geldig symbool voor ${EXERCISE_LEVEL_LABELS[level]}.`);
    const count = Number(item.count);
    if (!Number.isInteger(count) || count < 1 || count > 4) throw new Error(`Kies voor ${EXERCISE_LEVEL_LABELS[level]} een aantal van 1 tot en met 4.`);
    const displayName = typeof item.displayName === "string" ? item.displayName.trim() : "";
    if (!displayName || displayName.length > EXERCISE_LEVEL_DISPLAY_NAME_MAX_LENGTH) throw new Error(`Kies voor ${EXERCISE_LEVEL_LABELS[level]} een naam van maximaal ${EXERCISE_LEVEL_DISPLAY_NAME_MAX_LENGTH} tekens.`);
    const color = typeof item.color === "string" ? item.color.trim().toUpperCase() : "";
    if (!isHexColor(color)) throw new Error(`Kies een geldige kleur voor ${EXERCISE_LEVEL_LABELS[level]}.`);
    if (typeof item.showPublicBackground !== "boolean") throw new Error(`Kies een geldige achtergrondinstelling voor ${EXERCISE_LEVEL_LABELS[level]}.`);
    return [level, { displayName, symbolId: item.symbolId, count, color, showPublicBackground: item.showPublicBackground }];
  })) as unknown as ExerciseLevelPresentation;
}

export function exerciseLevelPresentationFromRows(rows: Array<{ level: unknown; displayName?: unknown; symbolId: unknown; count: unknown; color?: unknown; showPublicBackground?: unknown }>): ExerciseLevelPresentation {
  const configured = new Map(rows.map((row) => [row.level, row]));
  const merged = Object.fromEntries(EXERCISE_LEVELS.map((level) => {
    const row = configured.get(level);
    const defaults = DEFAULT_EXERCISE_LEVEL_PRESENTATION[level];
    return [level, row ? {
      displayName: row.displayName ?? defaults.displayName,
      symbolId: row.symbolId,
      count: row.count,
      color: row.color ?? defaults.color,
      showPublicBackground: row.showPublicBackground === true || Number(row.showPublicBackground) === 1,
    } : defaults];
  }));
  return validateExerciseLevelPresentation(merged);
}

export function exerciseLevelLabel(level: ExerciseLevel | null, presentation: ExerciseLevelPresentation = DEFAULT_EXERCISE_LEVEL_PRESENTATION): string {
  return level ? presentation[level].displayName : "Geen niveau";
}

export function exerciseLevelVisual(level: ExerciseLevel | null, presentation: ExerciseLevelPresentation = DEFAULT_EXERCISE_LEVEL_PRESENTATION, context: ExerciseLevelRenderingContext = "admin") {
  if (!level) return { label: "Geen niveau", symbols: "—", color: null, backgroundColor: null, colorClass: "exercise-level-none" };
  const item = presentation[level];
  const symbol = EXERCISE_LEVEL_SYMBOLS.find((candidate) => candidate.id === item.symbolId)!;
  const showBackground = context === "admin" || item.showPublicBackground;
  return {
    label: item.displayName,
    symbols: symbol.glyph.repeat(item.count),
    color: item.color,
    backgroundColor: showBackground ? deriveLightColor(item.color, DEFAULT_EXERCISE_LEVEL_PRESENTATION[level].color) : null,
    colorClass: EXERCISE_LEVEL_COLOR_CLASSES[level],
  };
}
