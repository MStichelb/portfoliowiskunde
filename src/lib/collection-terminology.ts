export const DEFAULT_COLLECTION_LABEL_SINGULAR = "Portfolio";
export const DEFAULT_COLLECTION_LABEL_PLURAL = "Portfolio's";
export const DEFAULT_EXERCISE_LABEL_SINGULAR = "Oefening";
export const DEFAULT_EXERCISE_LABEL_PLURAL = "Oefeningen";
export const DEFAULT_EXERCISE_LABEL_SHORT = "Oef.";
export const EXERCISE_LABEL_SHORT_MAX_LENGTH = 12;
export const COLLECTION_LABEL_MAX_LENGTH = 40;

export class CollectionTerminologyError extends Error {}

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
