import type { LearningSpaceTerminologyInput } from "./collection-terminology";
import { getLearningSpaceTerminology, formatTerminologyLabel } from "./collection-terminology";
import { exerciseModeContextLabel } from "./source-profile-recognition-labels";
import type { SourceProfileConfig } from "./source-profile-config";

/** Broad teacher-facing structure information, without individual matching rules. */
export function creationProfileSummary(config: SourceProfileConfig, labels: LearningSpaceTerminologyInput = {}): string[] {
  const terms = getLearningSpaceTerminology(labels);
  const collections = formatTerminologyLabel(terms.collection.plural, "inline");
  const mode = config.scanner.exercise.exerciseMode;
  const lines = [
    `${terms.collection.plural}: mappen met “${config.scanner.portfolio.marker}” en een nummer in de naam.`,
  ];
  if (config.scanner.portfolio.themeMode === "folder") lines.push(`${terms.theme.plural}: één mapniveau boven de ${collections}.`);
  lines.push(
    `${terms.exercise.plural}: ${formatTerminologyLabel(exerciseModeContextLabel(mode), "inline")}.`,
    config.exerciseResources.length ? `Materialen: ${config.exerciseResources.map((item) => item.label).join(", ")}.` : "Materialen: nog niet ingesteld.",
  );
  if (config.levelRecognition.method !== "none") lines.push(config.levelRecognition.method === "subdirectory" ? "Niveaus: bepaald door de map waarin materiaal staat." : "Niveaus: bepaald door tekens in de naam van een bestand of map.");
  lines.push(config.globalResources.length ? `Documenten bij ${collections}: ${config.globalResources.map((item) => item.label).join(", ")}.` : `Documenten bij ${collections}: nog niet ingesteld.`);
  return lines;
}
