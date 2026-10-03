import type { LearningSpace } from "./repositories";

export function sortLearningSpacesForViewer<T extends Pick<LearningSpace, "id" | "slug" | "name" | "subjectName">>(spaces: T[]): T[] {
  return [...spaces].sort((left, right) => compare(left.subjectName, right.subjectName)
    || compare(left.name, right.name)
    || compare(left.id || left.slug, right.id || right.slug));
}

function compare(left: string, right: string): number {
  return left.localeCompare(right, "nl", { sensitivity: "base", numeric: true });
}
