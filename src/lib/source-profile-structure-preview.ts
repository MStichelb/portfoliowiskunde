import type {
  ExerciseLevelRecognitionConfig,
  ExerciseMode,
  ExerciseResourceConfig,
  ExerciseResourceDirectoryContextRecognition,
  ExerciseResourceFileContextRecognition,
  ExerciseScannerConfig,
  PortfolioScannerConfig,
} from "@/lib/source-profile-config";
import { DEFAULT_PORTFOLIO_SCANNER_CONFIG } from "@/lib/source-profile-config";

export type SourceStructurePreviewNode = {
  kind: "folder" | "file";
  name: string;
  children?: SourceStructurePreviewNode[];
};

export type SourceStructurePreview = {
  modeLabel: string;
  explanation: string;
  root: SourceStructurePreviewNode;
  notes: string[];
};

type Recognition = ExerciseResourceFileContextRecognition | ExerciseResourceDirectoryContextRecognition;
type ExerciseContext = "file" | "directory";

export function buildSourceStructurePreview(
  scanner: ExerciseScannerConfig,
  resources: readonly ExerciseResourceConfig[],
  levelRecognition: ExerciseLevelRecognitionConfig = { method: "none" },
  portfolioScanner: PortfolioScannerConfig = DEFAULT_PORTFOLIO_SCANNER_CONFIG,
): SourceStructurePreview {
  const portfolioMarker = safeStem(portfolioScanner.marker, "Portfolio");
  const compactMarker = portfolioMarker.length === 1;
  const root: SourceStructurePreviewNode = {
    kind: "folder",
    name: `${portfolioMarker}${compactMarker ? "1.1_" : "1.1 - "}Stelsels oplossen`,
    children: [],
  };
  const sectionOne = ensureFolder(root, "1 Inleiding");
  const sectionTwo = ensureFolder(root, "2 - Methode van Gauss-Jordan");
  ensureFolder(root, "3_Toepassingen");
  const notes = new Set<string>();
  const exerciseOne = exampleExerciseName(scanner, 1, "basis", levelRecognition);
  const exerciseTwo = exampleExerciseName(scanner, 2, "uitdaging", levelRecognition);
  const exerciseOneRoot = exampleExerciseRoot(sectionOne, "basis", levelRecognition);
  const exerciseTwoRoot = exampleExerciseRoot(sectionTwo, "uitdaging", levelRecognition);

  if (scanner.exerciseMode === "files") {
    addFileExercise(exerciseOneRoot, exerciseOne, resources, notes, levelRecognition, "basis");
  } else if (scanner.exerciseMode === "directories") {
    addDirectoryExercise(exerciseOneRoot, exerciseOne, resources, notes, levelRecognition, "basis");
  } else {
    addFileExercise(exerciseOneRoot, exerciseOne, resources, notes, levelRecognition, "basis");
    addDirectoryExercise(exerciseTwoRoot, exerciseTwo, resources, notes, levelRecognition, "uitdaging");
    notes.add("In deze stand mogen beide vormen door elkaar voorkomen. Je hoeft dus niet elke oefening zowel als bestand als map te maken.");
  }

  addPath(root, [{ kind: "file", name: "header.png" }]);
  notes.add(`Geldige portfoliocodes zijn bijvoorbeeld 1, A, 1A, A1, 1.1 en A.1. Mapnamen zoals “${portfolioMarker} 1.1 Stelsels”, “${portfolioMarker} 1.1 - Stelsels” en “${portfolioMarker}1.1-Stelsels” zijn geldig.`);
  notes.add("Onderdelen staan rechtstreeks onder het portfolio en beginnen met een nummer; een structurele map ‘Uitwerkingen’ is niet nodig.");

  addLevelRecognitionNote(notes, levelRecognition, resources);

  if (resources.some((resource) => resource.location.scope === "alongside_and_subdirectory")) {
    notes.add("Bij ‘direct … of in een submap’ toont dit voorbeeld één geldige plaats. De andere ingestelde plaats is ook toegestaan.");
  }

  return {
    modeLabel: modeLabel(scanner.exerciseMode),
    explanation: modeExplanation(scanner.exerciseMode),
    root,
    notes: [...notes],
  };
}

function addFileExercise(
  root: SourceStructurePreviewNode,
  exerciseName: string,
  resources: readonly ExerciseResourceConfig[],
  notes: Set<string>,
  levelRecognition: ExerciseLevelRecognitionConfig,
  level: "basis" | "uitdaging",
) {
  addPath(root, [{ kind: "file", name: `${exerciseName}.png` }]);

  for (const resource of resources) {
    const recognition = resource.recognition.file;
    if (!recognition) continue;
    const extension = preferredExtension(resource);
    const fileName = withResourceLevelMarker(
      fileContextName(exerciseName, resource, recognition, extension),
      resource.id,
      level,
      levelRecognition,
    );
    if (!fileName) continue;

    if (resource.location.scope !== "alongside_exercise") {
      addPath(root, [
        { kind: "folder", name: resource.location.subdirectory },
        { kind: "file", name: fileName },
      ]);
    } else {
      addPath(root, [{ kind: "file", name: fileName }]);
    }
  }

  if (resources.some((resource) => resource.recognition.file?.target === "fallback" && resource.location.scope === "alongside_exercise")) {
    notes.add("Bij een standaardregel naast oefeningsbestanden moet de bestandsnaam nog steeds het oefeningnummer bevatten, zodat de app weet bij welke oefening het bestand hoort.");
  }
}

function addDirectoryExercise(
  root: SourceStructurePreviewNode,
  exerciseName: string,
  resources: readonly ExerciseResourceConfig[],
  notes: Set<string>,
  levelRecognition: ExerciseLevelRecognitionConfig,
  level: "basis" | "uitdaging",
) {
  const exerciseFolder = ensureFolder(root, exerciseName);

  for (const resource of resources) {
    const recognition = resource.recognition.directory;
    if (!recognition) continue;
    const extension = preferredExtension(resource);
    const fileName = withResourceLevelMarker(
      directoryContextName(exerciseName, resource, recognition, extension),
      resource.id,
      level,
      levelRecognition,
    );
    if (!fileName) continue;

    if (resource.location.scope !== "alongside_exercise") {
      addPath(exerciseFolder, [
        { kind: "folder", name: resource.location.subdirectory },
        { kind: "file", name: fileName },
      ]);
    } else {
      addPath(exerciseFolder, [{ kind: "file", name: fileName }]);
    }
  }

  if (resources.length === 0) {
    notes.add("Er zijn nog geen onderdelen per oefening ingesteld. Daarom is de oefeningsmap in het voorbeeld nog leeg.");
  }
}

function fileContextName(
  exerciseName: string,
  resource: ExerciseResourceConfig,
  recognition: ExerciseResourceFileContextRecognition,
  extension: string,
): string | null {
  if (recognition.target === "fallback") {
    if (resource.location.scope === "subdirectory") return `${exerciseName}.${extension}`;
    return `${exerciseName}-${safeStem(resource.label, "bestand")}.${extension}`;
  }
  return `${exerciseName}${representativeMatch(recognition.operator, recognition.value, "after_number")}.${extension}`;
}

function directoryContextName(
  exerciseName: string,
  resource: ExerciseResourceConfig,
  recognition: ExerciseResourceDirectoryContextRecognition,
  extension: string,
): string | null {
  if (recognition.target === "fallback") return `${safeStem(resource.label, "bestand")}.${extension}`;
  if (recognition.target === "after_exercise_number") {
    return `${exerciseName}${representativeMatch(recognition.operator, recognition.value, "after_number")}.${extension}`;
  }
  return `${representativeMatch(recognition.operator, recognition.value, "file_name")}.${extension}`;
}

function representativeMatch(
  operator: "starts_with" | "contains" | "exact" | "ends_with",
  value: string,
  context: "after_number" | "file_name",
): string {
  const clean = safeStem(value, context === "after_number" ? "-onderdeel" : "onderdeel");
  if (operator === "exact" || operator === "starts_with") return clean;
  if (operator === "contains") return context === "after_number" ? `-bestand-${clean}` : `bestand-${clean}`;
  return context === "after_number" ? `-bestand-${clean}` : `bestand-${clean}`;
}

function preferredExtension(resource: ExerciseResourceConfig): string {
  const extensions = resource.recognition.fileExtensions;
  if (extensions.includes("png")) return "png";
  if (extensions.includes("jpg")) return "jpg";
  if (extensions.includes("jpeg")) return "jpeg";
  return extensions[0] ?? "pdf";
}

function exerciseToken(scanner: ExerciseScannerConfig, number: number): string {
  if (scanner.numberLocation === "start") return String(number);
  return `${scanner.marker || "Oef"}${number}`;
}

function exampleExerciseRoot(
  root: SourceStructurePreviewNode,
  level: "basis" | "uitdaging",
  recognition: ExerciseLevelRecognitionConfig,
): SourceStructurePreviewNode {
  if (recognition.method !== "subdirectory") return root;
  const folderName = safeStem(recognition.mapping[level], "");
  return folderName ? ensureFolder(root, folderName) : root;
}

function exampleExerciseName(
  scanner: ExerciseScannerConfig,
  number: number,
  level: "basis" | "uitdaging",
  recognition: ExerciseLevelRecognitionConfig,
): string {
  const name = exerciseToken(scanner, number);
  if (recognition.method !== "marker" || recognition.source.type !== "exercise_directory") return name;
  const marker = levelMarker(recognition, level);
  return marker ? `${name}-${marker}` : name;
}

function withResourceLevelMarker(
  fileName: string | null,
  resourceId: string,
  level: "basis" | "uitdaging",
  recognition: ExerciseLevelRecognitionConfig,
): string | null {
  if (!fileName || recognition.method !== "marker" || recognition.source.type !== "exercise_resource" || recognition.source.resourceId !== resourceId) {
    return fileName;
  }
  const marker = levelMarker(recognition, level);
  if (!marker) return fileName;
  const extensionIndex = fileName.lastIndexOf(".");
  if (extensionIndex < 1) return `${fileName}-${marker}`;
  return `${fileName.slice(0, extensionIndex)}-${marker}${fileName.slice(extensionIndex)}`;
}

function levelMarker(
  recognition: Extract<ExerciseLevelRecognitionConfig, { method: "marker" }>,
  level: "basis" | "uitdaging",
): string {
  const code = safeStem(recognition.mapping[level], "");
  if (!code) return "";
  return recognition.convention === "prefixed_code" ? `${safeStem(recognition.prefix, "")}${code}` : code;
}

function addLevelRecognitionNote(
  notes: Set<string>,
  recognition: ExerciseLevelRecognitionConfig,
  resources: readonly ExerciseResourceConfig[],
) {
  if (recognition.method === "none") return;
  if (recognition.method === "subdirectory") {
    notes.add("De ingestelde submapnaam bepaalt in dit voorbeeld automatisch het interne oefeningniveau.");
    return;
  }
  if (recognition.source.type === "exercise_directory") {
    notes.add("De ingestelde code in de naam van de oefeningsmap bepaalt automatisch het interne oefeningniveau.");
    return;
  }
  const sourceResourceId = recognition.source.resourceId;
  const label = resources.find((resource) => resource.id === sourceResourceId)?.label ?? "het gekozen onderdeel";
  notes.add(`De ingestelde code in de bestandsnaam van “${label}” bepaalt automatisch het interne oefeningniveau.`);
}

function modeLabel(mode: ExerciseMode): string {
  if (mode === "files") return "Oefeningen als bestanden";
  if (mode === "directories") return "Oefeningen als mappen";
  return "Oefeningen als bestanden en mappen";
}

function modeExplanation(mode: ExerciseMode): string {
  if (mode === "files") {
    return "Elke oefening is een bestand. Extra bestanden moeten zelf het oefeningnummer bevatten, zodat de app weet bij welke oefening ze horen.";
  }
  if (mode === "directories") {
    return "Elke oefening is een map. Bestanden binnen die map horen automatisch bij die oefening; de herkenningsregel bepaalt alleen nog welk soort onderdeel het is.";
  }
  return "Beide vormen zijn toegestaan. In dit voorbeeld staat oefening 1 als bestand en oefening 2 als map, zodat je meteen ziet hoe beide structuren werken.";
}

function safeStem(value: string, fallback: string): string {
  const trimmed = value.trim().replace(/\.[a-z0-9]{1,5}$/i, "");
  const safe = trimmed.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
  return safe || fallback;
}

function addPath(root: SourceStructurePreviewNode, path: SourceStructurePreviewNode[]) {
  let parent = root;
  for (const segment of path) {
    if (segment.kind === "file") {
      if (!parent.children?.some((child) => child.kind === "file" && child.name === segment.name)) {
        (parent.children ??= []).push({ kind: "file", name: segment.name });
      }
      continue;
    }
    parent = ensureFolder(parent, segment.name);
  }
}

function ensureFolder(parent: SourceStructurePreviewNode, name: string): SourceStructurePreviewNode {
  parent.children ??= [];
  const existing = parent.children.find((child) => child.kind === "folder" && child.name === name);
  if (existing) return existing;
  const folder: SourceStructurePreviewNode = { kind: "folder", name, children: [] };
  parent.children.push(folder);
  return folder;
}
