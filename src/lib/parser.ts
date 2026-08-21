import type {
  ParsedPortfolioDirectory,
  ParsedSectionDirectory,
  ParsedSolutionFile,
} from "@/lib/domain";

const PORTFOLIO_ID_SOURCE = "(?:\\d+[a-z]*|[a-z]+)";
const PORTFOLIO_DIRECTORY = new RegExp(`^portfolio\\s+(${PORTFOLIO_ID_SOURCE})\\s*-\\s*(.+)$`, "i");
const SECTION_DIRECTORY = /^(\d+)\s*-\s*(.+)$/;
const SOLUTION_PREFIX = new RegExp(`^pf(${PORTFOLIO_ID_SOURCE})\\s*-\\s*oef(\\d+)([a-z]?)(.*)\\.(pdf|png|jpe?g)$`, "i");
const STEP_TOKEN = /\((\d+)\)/g;
const NUMERIC_PORTFOLIO_ID = /^(\d+)([A-Z]*)$/;
const ALPHABETIC_PORTFOLIO_ID = /^[A-Z]+$/;

export function normalizePortfolioCode(code: string): string {
  return code.trim().toUpperCase();
}

export function comparePortfolioIds(left: string, right: string): number {
  const leftId = portfolioIdParts(left);
  const rightId = portfolioIdParts(right);
  if (!leftId || !rightId) return compareText(normalizePortfolioCode(left), normalizePortfolioCode(right));
  if (leftId.kind !== rightId.kind) return leftId.kind === "numeric" ? -1 : 1;
  if (leftId.kind === "numeric" && rightId.kind === "numeric") {
    if (leftId.number !== rightId.number) return leftId.number < rightId.number ? -1 : 1;
    return compareText(leftId.suffix, rightId.suffix);
  }
  return compareText(leftId.code, rightId.code);
}

export function portfolioCodeFromRelativePath(relativePath: string): string | null {
  const rootDirectory = relativePath.replaceAll("\\", "/").replace(/^\.\//, "").split("/")[0];
  return parsePortfolioDirectory(rootDirectory)?.code ?? null;
}

export function comparePortfolioRelativePaths(left: string, right: string): number {
  const leftCode = portfolioCodeFromRelativePath(left);
  const rightCode = portfolioCodeFromRelativePath(right);
  if (leftCode && rightCode) {
    const codeOrder = comparePortfolioIds(leftCode, rightCode);
    if (codeOrder !== 0) return codeOrder;
  } else if (leftCode !== rightCode) {
    return leftCode ? -1 : 1;
  }
  return compareText(left.replaceAll("\\", "/"), right.replaceAll("\\", "/"));
}

export function looksLikeSolutionFileName(name: string): boolean {
  return /^pf\s*[a-z0-9]+\s*-\s*oef/i.test(name.trim());
}

export function parsePortfolioDirectory(
  name: string,
): ParsedPortfolioDirectory | null {
  const match = name.trim().match(PORTFOLIO_DIRECTORY);
  if (!match) return null;

  return {
    code: normalizePortfolioCode(match[1]),
    title: match[2].trim(),
  };
}

export function parseSectionDirectory(name: string): ParsedSectionDirectory | null {
  const match = name.trim().match(SECTION_DIRECTORY);
  if (!match) return null;

  return { order: Number(match[1]), title: match[2].trim() };
}

export function parseSolutionFileName(name: string): ParsedSolutionFile | null {
  const match = name.trim().match(SOLUTION_PREFIX);
  if (!match) return null;

  const exerciseNumber = Number(match[2]);
  const exerciseSuffix = (match[3] ?? "").toLowerCase();
  const extension = match[5].toLowerCase() as ParsedSolutionFile["extension"];
  const tail = match[4].trim();
  const steps = [...tail.matchAll(STEP_TOKEN)];
  if (steps.length > 1) return null;
  const withoutStep = tail.replace(STEP_TOKEN, "");
  if (/[()]/.test(withoutStep)) return null;
  if (withoutStep && !withoutStep.startsWith("-")) return null;

  const tokens = withoutStep ? withoutStep.slice(1).split("-").map((token) => token.trim()) : [];
  if (tokens.some((token) => token.length === 0)) return null;
  const alternativeMarkers = tokens.filter((token) => token.toLowerCase() === "alt");
  if (alternativeMarkers.length > 1) return null;

  return {
    portfolioCode: normalizePortfolioCode(match[1]),
    exerciseNumber,
    exerciseSuffix,
    exerciseCode: `${exerciseNumber}${exerciseSuffix}`,
    // Only an exact hyphen-delimited `alt` token is structural. All other tokens are descriptions.
    variant: alternativeMarkers.length === 1 ? "alternative" : "standard",
    step: steps[0] ? Number(steps[0][1]) : 1,
    extension,
  };
}

function portfolioIdParts(code: string):
  | { kind: "numeric"; number: bigint; suffix: string; code: string }
  | { kind: "alphabetic"; code: string }
  | null {
  const normalized = normalizePortfolioCode(code);
  const numeric = normalized.match(NUMERIC_PORTFOLIO_ID);
  if (numeric) return { kind: "numeric", number: BigInt(numeric[1]), suffix: numeric[2], code: normalized };
  if (ALPHABETIC_PORTFOLIO_ID.test(normalized)) return { kind: "alphabetic", code: normalized };
  return null;
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
