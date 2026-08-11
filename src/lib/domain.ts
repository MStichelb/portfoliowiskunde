export type SolutionVariantKind = "standard" | "alternative";

export interface ParsedPortfolioDirectory {
  code: string;
  title: string;
}

export interface ParsedSectionDirectory {
  order: number;
  title: string;
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

export interface IndexedAsset {
  relativePath: string;
  fileName: string;
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
  finalSolutionsPdfPath: string | null;
  sections: IndexedSection[];
  warnings: IndexWarning[];
}
