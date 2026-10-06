import { formatTerminologyLabel, getLearningSpaceTerminology, type LearningSpaceTerminologyInput } from "./collection-terminology";

export interface SourceProfilePresentationSpace extends LearningSpaceTerminologyInput {
  id: string;
  name: string;
  shortLabel: string;
  sortOrder: number;
}

export function sourceProfilePresentationSpaces(spaces: readonly SourceProfilePresentationSpace[], linkedIds: readonly string[], allowedIds: readonly string[]) {
  const linked = new Set(linkedIds);
  const allowed = new Set(allowedIds);
  return spaces.filter((space) => linked.has(space.id) && allowed.has(space.id))
    .toSorted((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "nl") || a.id.localeCompare(b.id));
}

export function sourceProfileLabels(input: LearningSpaceTerminologyInput = {}) {
  const terms = getLearningSpaceTerminology(input);
  const inline = (entity: keyof typeof terms) => formatTerminologyLabel(terms[entity].singular, "inline");
  const plural = (entity: keyof typeof terms) => formatTerminologyLabel(terms[entity].plural, "inline");
  return {
    tabCollection: formatTerminologyLabel(terms.collection.plural, "standalone"),
    tabSection: formatTerminologyLabel(terms.section.plural, "standalone"),
    tabExercise: formatTerminologyLabel(terms.exercise.plural, "standalone"),
    terms, collection: inline("collection"), exercise: inline("exercise"), section: inline("section"), theme: inline("theme"),
    collections: plural("collection"), exercises: plural("exercise"), sections: plural("section"), themes: plural("theme"),
    collectionHeading: `${formatTerminologyLabel(terms.collection.plural, "standalone")} herkennen`,
    documentsHeading: `Documenten bij ${plural("collection")}`,
    sectionHeading: `${formatTerminologyLabel(terms.section.plural, "standalone")} herkennen`,
    exerciseHeading: `${formatTerminologyLabel(terms.exercise.plural, "standalone")} herkennen`,
    materialsHeading: `Materialen bij ${plural("exercise")}`,
  };
}
