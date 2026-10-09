import type { ExerciseResourceSemanticRole, GlobalResourceSemanticRole } from "@/lib/source-profile-config";
import type { ExerciseLevel } from "@/lib/exercise-level";
import type { StorageIdentityContext } from "@/lib/source-identity";

export type SolutionVariantKind = "standard" | "alternative";

export interface ParsedPortfolioDirectory {
  code: string;
  title: string;
}

export interface ParsedSectionDirectory {
  code: string;
  title: string;
}

export interface ParsedExerciseIdentity {
  exerciseNumber: number;
  exerciseSuffix: string;
  exerciseCode: string;
}

export interface ExerciseNumberCandidate extends ParsedExerciseIdentity {
  remainder: string;
  consumedLength: number;
  hasBoundaryAfterNumber: boolean;
}

export interface ParsedSolutionFile {
  portfolioCode: string;
  exerciseNumber: number;
  exerciseSuffix: string;
  exerciseCode: string;
  variant: SolutionVariantKind;
  step: number;
  extension: "pdf" | "png" | "jpg" | "jpeg";
}

export interface IndexWarning {
  severity: "warning" | "info";
  path: string;
  message: string;
}

export interface IndexedPortfolioResourceAsset {
  sourceIdentityContext?: StorageIdentityContext;
  resourceId: string;
  semanticRole: GlobalResourceSemanticRole;
  relativePath: string;
  sourceId: string;
  fileName: string;
  extension: string;
  lastModifiedAt: string | null;
  sourceVersion: string | null;
}

export interface IndexedAsset {
  sourceIdentityContext?: StorageIdentityContext;
  resourceId: string;
  semanticRole: ExerciseResourceSemanticRole;
  legacyVariant: SolutionVariantKind | null;
  relativePath: string;
  sourceId: string;
  fileName: string;
  lastModifiedAt: string | null;
  sourceVersion: string | null;
  parsed: ParsedSolutionFile;
}

export interface IndexedExercise {
  code: string;
  number: number;
  suffix: string;
  levelSource?: ExerciseLevel | null;
  assets: IndexedAsset[];
}

export interface IndexedSection {
  code: string;
  sortOrder: number;
  title: string;
  relativePath: string;
  sourceId?: string;
  exercises: IndexedExercise[];
}

export interface IndexedSourceTheme {
  name: string;
  relativePath: string;
  sourceId: string;
}

export interface IndexedPortfolio {
  code: string;
  title: string;
  relativePath: string;
  sourceId?: string;
  sourceIdentityContext?: StorageIdentityContext;
  sourceTheme?: IndexedSourceTheme;
  assignmentPdfPath: string | null;
  assignmentPdfSourceId: string | null;
  hintsDocumentPath: string | null;
  hintsDocumentSourceId: string | null;
  finalSolutionsPdfPath: string | null;
  finalSolutionsPdfSourceId: string | null;
  resourceAssets: IndexedPortfolioResourceAsset[];
  /** Exercises directly inside the portfolio, without a section. Omitted in legacy fixtures. */
  exercises?: IndexedExercise[];
  sections: IndexedSection[];
  warnings: IndexWarning[];
}
