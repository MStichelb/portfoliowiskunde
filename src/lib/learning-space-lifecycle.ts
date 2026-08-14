export type LearningSpaceLifecycleAction = "manage" | "archive" | "restore" | "delete";

export function getLearningSpaceLifecycleActions(isActive: boolean): LearningSpaceLifecycleAction[] {
  return isActive ? ["manage", "archive"] : ["manage", "restore", "delete"];
}

export function canPermanentlyDeleteLearningSpace(space: { isActive: boolean; archivedAt: string | null }): boolean {
  return !space.isActive && Boolean(space.archivedAt);
}
