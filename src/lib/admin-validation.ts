export function bulkSelectionError(selectedCount: number): string | null {
  return selectedCount === 0 ? "Selecteer eerst minstens één oefening." : null;
}
