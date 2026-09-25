import type { ExerciseResourceSemanticRole, GlobalResourceSemanticRole } from "@/lib/source-profile-config";

export type SolutionVariantKind = "standard" | "alternative";

export interface ParsedPortfolioDirectory {
  code: string;
  title: string;
}

export interface ParsedSectionDirectory {
  order: number;
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
  assets: IndexedAsset[];
}

export interface IndexedSection {
  order: number;
  title: string;
  relativePath: string;
  exercises: IndexedExercise[];
}

export interface IndexedPortfolio {
  code: string;
  title: string;
  relativePath: string;
  assignmentPdfPath: string | null;
  assignmentPdfSourceId: string | null;
  hintsDocumentPath: string | null;
  hintsDocumentSourceId: string | null;
  finalSolutionsPdfPath: string | null;
  finalSolutionsPdfSourceId: string | null;
  resourceAssets: IndexedPortfolioResourceAsset[];
  sections: IndexedSection[];
  warnings: IndexWarning[];
}
