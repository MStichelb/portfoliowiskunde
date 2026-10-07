import type {
  PortfolioScannerConfig,
  ExerciseMode,
  ExerciseResourceDirectoryContextRecognition,
  ExerciseResourceFileContextRecognition,
  ExerciseResourceLocation,
  ExerciseScannerConfig,
  GlobalResourceFileRecognition,
} from "./source-profile-config";

type ExerciseResourceRule = ExerciseResourceFileContextRecognition | ExerciseResourceDirectoryContextRecognition;

export function exerciseNumberRuleLabel(scanner: ExerciseScannerConfig): string {
  if (scanner.numberLocation === "start") {
    const subject = scanner.exerciseMode === "files" ? "Bestandsnaam" : scanner.exerciseMode === "directories" ? "Mapnaam" : "Bestands- of mapnaam";
    return `${subject} begint met het nummer`;
  }
  return `Nummer staat na tekst “${scanner.marker}”`;
}

export function exerciseModeContextLabel(mode: ExerciseMode): string {
  if (mode === "files") return "Bestanden";
  if (mode === "directories") return "Mappen";
  return "Bestanden en mappen";
}

export function exerciseResourceRuleLabel(rule: ExerciseResourceRule, exerciseLabel = "oefening"): string {
  if (rule.target === "fallback") return "Standaard / overige bestanden";
  const subject = rule.target === "file_name" ? "Bestandsnaam" : `Tekst na ${exerciseLabel}nummer`;
  const operator = { starts_with: "begint met", contains: "bevat", exact: "is exact", ends_with: "eindigt op" }[rule.operator];
  return `${subject} ${operator} “${rule.value}”`;
}

export function globalResourceRuleLabel(rule: GlobalResourceFileRecognition): string {
  const operator = { starts_with: "begint met", contains: "bevat", ends_with: "eindigt op" }[rule.operator];
  return `Bestandsnaam ${operator} “${rule.value}”`;
}

export function globalResourceCaseLabel(caseSensitive: boolean): string {
  return caseSensitive ? "Hoofdlettergevoelig" : "Niet hoofdlettergevoelig";
}

export function exerciseResourceLocationLabels(mode: ExerciseMode, exerciseLabel = "oefening"): { alongside: string; subdirectory: string; both: string } {
  if (mode === "files") return { alongside: `Bij de ${exerciseLabel}`, subdirectory: "In een submap", both: `Bij de ${exerciseLabel} of in een submap` };
  if (mode === "directories") return { alongside: `In de map van de ${exerciseLabel}`, subdirectory: `In een submap van de ${exerciseLabel}`, both: `In de map of een submap van de ${exerciseLabel}` };
  return { alongside: `Direct bij de ${exerciseLabel}`, subdirectory: "In een submap", both: `Direct bij de ${exerciseLabel} of in een submap` };
}

export function exerciseResourceLocationLabel(location: ExerciseResourceLocation, mode: ExerciseMode, exerciseLabel = "oefening"): string {
  const labels = exerciseResourceLocationLabels(mode, exerciseLabel);
  if (location.scope === "alongside_exercise") return labels.alongside;
  if (location.scope === "subdirectory") return `${labels.subdirectory} “${location.subdirectory}”`;
  return `${labels.both} “${location.subdirectory}”`;
}

export function portfolioNumberRuleLabel(config: Pick<PortfolioScannerConfig, "marker">): string {
  const marker = config.marker.trim();
  return marker ? `Mapnaam begint met “${marker}”, gevolgd door de code en eventueel een titel` : "Vul de vaste tekst vóór de code in.";
}

export function sectionNumberRuleLabel(): string {
  return "Mapnaam begint met een cijfercode (bijvoorbeeld 1, 1.2 of 1.10)";
}
