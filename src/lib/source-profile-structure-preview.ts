import type {
  ExerciseMode,
  ExerciseResourceConfig,
  ExerciseResourceDirectoryContextRecognition,
  ExerciseResourceFileContextRecognition,
  ExerciseScannerConfig,
} from "@/lib/source-profile-config";

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
): SourceStructurePreview {
  const root: SourceStructurePreviewNode = { kind: "folder", name: "Portfolio 1", children: [] };
  const notes = new Set<string>();
  const exerciseOne = exerciseToken(scanner, 1);
  const exerciseTwo = exerciseToken(scanner, 2);

  if (scanner.exerciseMode === "files") {
    addFileExercise(root, exerciseOne, resources, notes);
  } else if (scanner.exerciseMode === "directories") {
    addDirectoryExercise(root, exerciseOne, resources, notes);
  } else {
    addFileExercise(root, exerciseOne, resources, notes);
    addDirectoryExercise(root, exerciseTwo, resources, notes);
    notes.add("In deze stand mogen beide vormen door elkaar voorkomen. Je hoeft dus niet elke oefening zowel als bestand als map te maken.");
  }

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
) {
  addPath(root, [{ kind: "file", name: `${exerciseName}.png` }]);

  for (const resource of resources) {
    const recognition = resource.recognition.file;
    if (!recognition) continue;
    const extension = preferredExtension(resource);
    const fileName = fileContextName(exerciseName, resource, recognition, extension);
    if (!fileName) continue;

    if (resource.location.scope === "subdirectory") {
      addPath(root, [
        { kind: "folder", name: resource.location.subdirectory },
        { kind: "file", name: fileName },
      ]);
    } else {
      // For the combined location we deliberately show the direct variant. The
      // accompanying note explains that the configured subdirectory is valid too.
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
) {
  const exerciseFolder = ensureFolder(root, exerciseName);

  for (const resource of resources) {
    const recognition = resource.recognition.directory;
    if (!recognition) continue;
    const extension = preferredExtension(resource);
    const fileName = directoryContextName(exerciseName, resource, recognition, extension);
    if (!fileName) continue;

    if (resource.location.scope === "subdirectory") {
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
