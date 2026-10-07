import { parseSourceProfileConfig, type SourceProfileConfig } from "./source-profile-config";
import { EXERCISE_LEVELS } from "./exercise-level";
import { validateExerciseLevelPresentation } from "./exercise-level-presentation";
import { getLearningSpaceTerminology, normalizeCollectionTerminology, normalizeExerciseShortLabel, normalizeExerciseTerminology, normalizeSectionTerminology, normalizeThemeTerminology, type LearningSpaceTerminologyInput } from "./collection-terminology";

export type CreationProfileChoice =
  | { mode: "template"; id: string; config?: SourceProfileConfig }
  | { mode: "copy"; id: string; config?: SourceProfileConfig }
  | { mode: "link"; id: string }
  | { mode: "new"; config?: SourceProfileConfig }
  | { mode: "later" };

export interface CreationProfileOption {
  id: string;
  name: string;
  description: string | null;
  summary: string[];
  config?: SourceProfileConfig;
}
export interface LearningSpaceCreationOptions {
  templates: CreationProfileOption[];
  copies: CreationProfileOption[];
  links: CreationProfileOption[];
  newProfileConfig?: SourceProfileConfig;
}
export const WIZARD_DEFAULT_DESCRIPTION = "Klik op de kaartjes hieronder om te oefenen.";

export const EMPTY_CREATION_OPTIONS: LearningSpaceCreationOptions = { templates: [], copies: [], links: [] };
export const TERMINOLOGY_START_SCENARIOS: { id: string; label: string; values: LearningSpaceTerminologyInput }[] = [
  { id: "portfolio", label: "Thema → Portfolio → Onderdeel → Oefening", values: {} },
  { id: "chapter", label: "Deel → Hoofdstuk → Sectie → Oefening", values: { themeLabelSingular: "Deel", themeLabelPlural: "Delen", collectionLabelSingular: "Hoofdstuk", collectionLabelPlural: "Hoofdstukken", sectionLabelSingular: "Sectie", sectionLabelPlural: "Secties" } },
  { id: "bundle", label: "Thema → Bundel → Onderdeel → Opdracht", values: { collectionLabelSingular: "Bundel", collectionLabelPlural: "Bundels", exerciseLabelSingular: "Opdracht", exerciseLabelPlural: "Opdrachten", exerciseLabelShort: "Opdr." } },
];
export function terminologyScenario(id: string) {
  return getLearningSpaceTerminology(TERMINOLOGY_START_SCENARIOS.find((scenario) => scenario.id === id)?.values);
}

export type CreationResult =
  | { error: string; step: number }
  | { error: null; spaceId: string; slug: string; summary: string; warnings: string[]; editProfileId?: string };
export type CreationAction = (formData: FormData) => void | CreationResult | Promise<void | CreationResult>;

export function validateCreationStep(step: number, form: FormData): string | null {
  const value = (key: string) => String(form.get(key) ?? "").trim();
  if (step === 1) {
    if (!value("subjectId")) return "Kies een vak.";
    if (!value("name") || value("name").length > 100) return "Vul een naam in van maximaal 100 tekens.";
    if (!value("shortLabel") || value("shortLabel").length > 6) return "Vul een label in van maximaal 6 tekens.";
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value("slug"))) return "Gebruik voor de URL kleine letters, cijfers en enkele streepjes tussen woorden.";
    if (value("description").length > 240) return "De beschrijving mag maximaal 240 tekens bevatten.";
  }
  if (step === 2) {
    try {
      normalizeThemeTerminology({ singular: value("themeLabelSingular"), plural: value("themeLabelPlural") });
      normalizeCollectionTerminology({ singular: value("collectionLabelSingular"), plural: value("collectionLabelPlural") });
      normalizeSectionTerminology({ singular: value("sectionLabelSingular"), plural: value("sectionLabelPlural") });
      normalizeExerciseTerminology({ singular: value("exerciseLabelSingular"), plural: value("exerciseLabelPlural") });
      normalizeExerciseShortLabel(value("exerciseLabelShort"));
      if (form.has("levelSymbol_opwarmer")) validateExerciseLevelPresentation(Object.fromEntries(EXERCISE_LEVELS.map((level) => [level, {
        displayName: value(`levelName_${level}`), symbolId: value(`levelSymbol_${level}`), count: value(`levelCount_${level}`), color: value(`levelColor_${level}`), showPublicBackground: form.has(`levelShowPublicBackground_${level}`),
      }])));

      if (!/^#[a-f\d]{6}$/i.test(value("cardColor"))) return "Kies een geldige kleur.";
    } catch (error) { return error instanceof Error ? error.message : "Controleer de benamingen."; }
  }
  if (step === 3) {
    if (!["template", "copy", "link", "new", "later"].includes(value("profileMode"))) return "Kies wat je met het bronprofiel wilt doen.";
    if (["template", "copy", "link"].includes(value("profileMode")) && !value("profileSelectionId")) return "Kies een bronprofiel of sjabloon.";
    if (form.has("profileDraftEnabled")) {
      if (!["template", "copy", "new"].includes(value("profileMode"))) return "Een gekoppeld profiel kun je hier niet aanpassen.";
      try { parseCreationProfileDraft(form); } catch { return "Controleer de instellingen in je bronprofiel voordat je verdergaat."; }
    }
  }
  if (step === 4 && !["now", "later"].includes(value("sourceSetup"))) return "Kies een bron of kies Later instellen.";
  if (step === 4 && value("sourceSetup") !== "later") {
    const provider = value("sourceType");
    if (!["onedrive", "google_drive", "local"].includes(provider)) return "Kies een bron.";
    if (provider === "onedrive" && (!value("oneDriveDriveId") || !value("oneDriveFolderId"))) return "Vul de OneDrive drive-ID en map-ID in.";
    if (provider === "google_drive" && !/^[A-Za-z0-9_-]+$/.test(value("googleDriveFolderId"))) return "Vul een geldige Google Drive folder-ID in.";
    if (provider === "local" && !value("localSourcePath")) return "Vul het pad naar de lokale bronmap in.";
  }
  return null;
}

export const MISSING_PROFILE_MESSAGE = "Er is nog geen bronprofiel ingesteld. Bestanden kunnen nog niet automatisch worden herkend.";
export const MISSING_SOURCE_MESSAGE = "Er is nog geen bron gekoppeld. Synchronisatie is nog niet mogelijk.";

/** Read the same JSON fields emitted by the existing embedded profile editors. */
export function parseCreationProfileDraft(form: FormData): SourceProfileConfig {
  const json = (key: string) => JSON.parse(String(form.get(key) ?? "")) as unknown;
  return parseSourceProfileConfig({
    configVersion: 1,
    scanner: { portfolio: json("portfolioScannerJson"), exercise: json("exerciseScannerJson") },
    globalResources: json("resourcesJson"), exerciseResources: json("exerciseResourcesJson"), levelRecognition: json("levelRecognitionJson"),
  });
}
