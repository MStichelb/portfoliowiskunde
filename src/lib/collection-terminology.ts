export const DEFAULT_COLLECTION_LABEL_SINGULAR = "Portfolio";
export const DEFAULT_COLLECTION_LABEL_PLURAL = "Portfolio's";
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

export function miscellaneousCollectionLabel(plural: string): string {
  return plural === DEFAULT_COLLECTION_LABEL_PLURAL ? "Overige portfolio's" : `Overige ${plural}`;
}

function normalizeLabel(value: string, form: "enkelvoud" | "meervoud"): string {
  const label = value.trim();
  if (!label) throw new CollectionTerminologyError(`Vul een label in voor het ${form}.`);
  if (label.length > COLLECTION_LABEL_MAX_LENGTH) {
    throw new CollectionTerminologyError(`Het label voor het ${form} mag maximaal ${COLLECTION_LABEL_MAX_LENGTH} tekens bevatten.`);
  }
  return label;
}
