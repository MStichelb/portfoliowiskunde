export const DEFAULT_THEME_LABEL_SINGULAR = "Thema";
export const DEFAULT_THEME_LABEL_PLURAL = "Thema's";
export const DEFAULT_SECTION_LABEL_SINGULAR = "Onderdeel";
export const DEFAULT_SECTION_LABEL_PLURAL = "Onderdelen";
export const DEFAULT_COLLECTION_LABEL_SINGULAR = "Portfolio";
export const DEFAULT_COLLECTION_LABEL_PLURAL = "Portfolio's";
export const DEFAULT_EXERCISE_LABEL_SINGULAR = "Oefening";
export const DEFAULT_EXERCISE_LABEL_PLURAL = "Oefeningen";
export const DEFAULT_EXERCISE_LABEL_SHORT = "Oef.";
export const EXERCISE_LABEL_SHORT_MAX_LENGTH = 12;
export const COLLECTION_LABEL_MAX_LENGTH = 40;

export class CollectionTerminologyError extends Error {}

export function normalizeThemeTerminology(
  input: { singular?: string; plural?: string },
  fallback = { singular: DEFAULT_THEME_LABEL_SINGULAR, plural: DEFAULT_THEME_LABEL_PLURAL },
): { singular: string; plural: string } {
  return normalizeCollectionTerminology(input, fallback);
}

export function normalizeSectionTerminology(
  input: { singular?: string; plural?: string },
  fallback = { singular: DEFAULT_SECTION_LABEL_SINGULAR, plural: DEFAULT_SECTION_LABEL_PLURAL },
): { singular: string; plural: string } {
  return normalizeCollectionTerminology(input, fallback);
}

export interface LearningSpaceTerminologyInput {
  themeLabelSingular?: string;
  themeLabelPlural?: string;
  collectionLabelSingular?: string;
  collectionLabelPlural?: string;
  sectionLabelSingular?: string;
  sectionLabelPlural?: string;
  exerciseLabelSingular?: string;
  exerciseLabelPlural?: string;
  exerciseLabelShort?: string;
}

/** Presentation defaults also support older callers that do not supply every label. */
export function getLearningSpaceTerminology(input: LearningSpaceTerminologyInput = {}) {
  const label = (value: string | undefined, fallback: string) => value?.trim() || fallback;
  return {
    theme: { singular: label(input.themeLabelSingular, DEFAULT_THEME_LABEL_SINGULAR), plural: label(input.themeLabelPlural, DEFAULT_THEME_LABEL_PLURAL) },
    collection: { singular: label(input.collectionLabelSingular, DEFAULT_COLLECTION_LABEL_SINGULAR), plural: label(input.collectionLabelPlural, DEFAULT_COLLECTION_LABEL_PLURAL) },
    section: { singular: label(input.sectionLabelSingular, DEFAULT_SECTION_LABEL_SINGULAR), plural: label(input.sectionLabelPlural, DEFAULT_SECTION_LABEL_PLURAL) },
    exercise: {
      singular: label(input.exerciseLabelSingular, DEFAULT_EXERCISE_LABEL_SINGULAR),
      plural: label(input.exerciseLabelPlural, DEFAULT_EXERCISE_LABEL_PLURAL),
      short: input.exerciseLabelShort?.trim() ?? DEFAULT_EXERCISE_LABEL_SHORT,
    },
  };
}

export function learningSpaceTerminologyLabel(
  input: LearningSpaceTerminologyInput,
  entity: "theme" | "collection" | "section" | "exercise",
  form: "singular" | "plural",
  context: "standalone" | "inline" = "standalone",
): string {
  return formatTerminologyLabel(getLearningSpaceTerminology(input)[entity][form], context);
}

export function normalizeCollectionTerminology(
  input: { singular?: string; plural?: string },
  fallback: { singular: string; plural: string } = {
    singular: DEFAULT_COLLECTION_LABEL_SINGULAR,
    plural: DEFAULT_COLLECTION_LABEL_PLURAL,
  },
): { singular: string; plural: string } {
  return {
    singular: normalizeLabel(input.singular ?? fallback.singular, "enkelvoud"),
    plural: normalizeLabel(input.plural ?? fallback.plural, "meervoud"),
  };
}

export function normalizeExerciseTerminology(
  input: { singular?: string; plural?: string },
  fallback: { singular: string; plural: string } = {
    singular: DEFAULT_EXERCISE_LABEL_SINGULAR,
    plural: DEFAULT_EXERCISE_LABEL_PLURAL,
  },
): { singular: string; plural: string } {
  return {
    singular: normalizeLabel(input.singular ?? fallback.singular, "enkelvoud"),
    plural: normalizeLabel(input.plural ?? fallback.plural, "meervoud"),
  };
}

export function normalizeExerciseShortLabel(value: string | undefined, fallback = DEFAULT_EXERCISE_LABEL_SHORT): string {
  const label = (value ?? fallback).trim();
  if (label.length > EXERCISE_LABEL_SHORT_MAX_LENGTH) {
    throw new CollectionTerminologyError(`De verkorte naam mag maximaal ${EXERCISE_LABEL_SHORT_MAX_LENGTH} tekens bevatten.`);
  }
  return label;
}

export function formatTerminologyLabel(value: string, context: "standalone" | "inline"): string {
  const normalized = value.toLocaleLowerCase("nl-BE");
  if (context === "inline") return normalized;
  const characters = Array.from(normalized);
  const letterIndex = characters.findIndex((character) => /\p{L}/u.test(character));
  if (letterIndex < 0) return normalized;
  characters[letterIndex] = characters[letterIndex].toLocaleUpperCase("nl-BE");
  return characters.join("");
}

export function miscellaneousCollectionLabel(plural: string): string {
  return `Overige ${formatTerminologyLabel(plural, "inline")}`;
}

export function initialLearningSpaceDescription(collectionPlural = DEFAULT_COLLECTION_LABEL_PLURAL, exercisePlural = DEFAULT_EXERCISE_LABEL_PLURAL): string {
  return `Overzicht van de ${formatTerminologyLabel(collectionPlural, "inline")} met ${formatTerminologyLabel(exercisePlural, "inline")}.`;
}

export function formatExerciseShortLabel(shortLabel: string, exerciseCode: string): string {
  const label = formatTerminologyLabel(shortLabel.trim(), "standalone");
  if (!label) return exerciseCode;
  const separator = /[\p{L}\p{N}]/u.test(label) ? " " : "";
  return `${label}${separator}${exerciseCode}`;
}


function normalizeLabel(value: string, form: "enkelvoud" | "meervoud"): string {
  const label = value.trim();
  if (!label) throw new CollectionTerminologyError(`Vul een label in voor het ${form}.`);
  if (label.length > COLLECTION_LABEL_MAX_LENGTH) {
    throw new CollectionTerminologyError(`Het label voor het ${form} mag maximaal ${COLLECTION_LABEL_MAX_LENGTH} tekens bevatten.`);
  }
  return label;
}
