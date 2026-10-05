import type {
  ExerciseNumberCandidate,
  ParsedExerciseIdentity,
  ParsedPortfolioDirectory,
  ParsedSectionDirectory,
  ParsedSolutionFile,
} from "@/lib/domain";
import type { ExerciseScannerConfig, PortfolioScannerConfig } from "@/lib/source-profile-config";

type ExerciseNumberScannerConfig = Pick<ExerciseScannerConfig, "numberLocation" | "marker">;

const SIMPLE_PORTFOLIO_CODE_SOURCE = "(?:\\d+[a-z]+|[a-z]+\\d+|\\d+|[a-z]+)";
const HIERARCHICAL_PORTFOLIO_CODE_SOURCE = "(?:(?:\\d+|[a-z]+)(?:\\.(?:\\d+|[a-z]+))+)";
const PORTFOLIO_CODE_SOURCE = `(?:${HIERARCHICAL_PORTFOLIO_CODE_SOURCE}|${SIMPLE_PORTFOLIO_CODE_SOURCE})`;
const PORTFOLIO_CODE = new RegExp(`^${PORTFOLIO_CODE_SOURCE}$`, "i");
const PORTFOLIO_DOCUMENT_BOUNDARY = "(?=\\s|-|$)";
const PORTFOLIO_DOCUMENT_PREFIX = new RegExp(`^portfolio\\s+(${PORTFOLIO_CODE_SOURCE})${PORTFOLIO_DOCUMENT_BOUNDARY}`, "i");
const HINTS_DOCUMENT_PREFIX = new RegExp(`^hints\\s+portfolio\\s+(${PORTFOLIO_CODE_SOURCE})${PORTFOLIO_DOCUMENT_BOUNDARY}`, "i");
const SECTION_CODE_SOURCE = "(?:\\d+(?:\\.\\d+)*)";
const SECTION_CODE = new RegExp(`^${SECTION_CODE_SOURCE}$`);
const SECTION_DIRECTORY = new RegExp(`^(${SECTION_CODE_SOURCE})(?:[\\s_-]*|\\.\\s*)(\\p{L}.*)$`, "u");
const SOLUTION_PREFIX = new RegExp(`^pf(${PORTFOLIO_CODE_SOURCE})\\s*-\\s*oef(\\d+)([a-z]?)(.*)\\.(pdf|png|jpe?g)$`, "i");
const STEP_TOKEN = /\((\d+)\)/g;

export function normalizePortfolioCode(code: string): string {
  return code.trim().toUpperCase();
}

export function isValidPortfolioId(code: string): boolean {
  return PORTFOLIO_CODE.test(normalizePortfolioCode(code));
}

export function comparePortfolioIds(left: string, right: string): number {
  const normalizedLeft = normalizePortfolioCode(left);
  const normalizedRight = normalizePortfolioCode(right);
  if (!isValidPortfolioId(normalizedLeft) || !isValidPortfolioId(normalizedRight)) {
    return compareText(normalizedLeft, normalizedRight);
  }
  const leftSegments = normalizedLeft.split(".");
  const rightSegments = normalizedRight.split(".");
  for (let index = 0; index < Math.min(leftSegments.length, rightSegments.length); index += 1) {
    const comparison = comparePortfolioCodeSegment(leftSegments[index], rightSegments[index]);
    if (comparison !== 0) return comparison;
  }
  if (leftSegments.length !== rightSegments.length) return leftSegments.length - rightSegments.length;
  return compareText(normalizedLeft, normalizedRight);
}

export function comparePortfolioRelativePaths(left: string, right: string): number {
  return left.replaceAll("\\", "/").localeCompare(right.replaceAll("\\", "/"), "nl", {
    numeric: true,
    sensitivity: "base",
  });
}

export function looksLikeSolutionFileName(name: string): boolean {
  return new RegExp(`^pf\\s*${PORTFOLIO_CODE_SOURCE}\\s*-\\s*oef`, "i").test(name.trim());
}

export function parsePortfolioDirectory(
  name: string,
  config: Pick<PortfolioScannerConfig, "marker">,
): ParsedPortfolioDirectory | null {
  const marker = config.marker.trim();
  if (!marker) return null;
  const pattern = new RegExp(`^${escapeRegExp(marker)}[\\s_-]*(${PORTFOLIO_CODE_SOURCE})[\\s_-]+(.+)$`, "i");
  const match = name.trim().match(pattern);
  if (!match) return null;

  const title = match[2].trim();
  if (!title) return null;

  return {
    code: normalizePortfolioCode(match[1]),
    title,
  };
}

export function parsePortfolioDocumentCode(name: string): string | null {
  const match = documentStem(name).match(PORTFOLIO_DOCUMENT_PREFIX);
  return match ? normalizePortfolioCode(match[1]) : null;
}

export function parseHintsDocumentCode(name: string): string | null {
  const match = documentStem(name).match(HINTS_DOCUMENT_PREFIX);
  return match ? normalizePortfolioCode(match[1]) : null;
}

export function parseSectionDirectory(name: string): ParsedSectionDirectory | null {
  const match = name.trim().match(SECTION_DIRECTORY);
  if (!match) return null;
  // Preserve the source spelling for display; normalize only for identity/comparison.
  const code = match[1];
  return isValidSectionCode(code) ? { code, title: match[2].trim() } : null;
}

export function normalizeSectionCode(code: string): string {
  return code.trim().split(".").map((segment) => {
    if (!/^\d+$/.test(segment)) return segment;
    return BigInt(segment).toString();
  }).join(".");
}

export function isValidSectionCode(code: string): boolean {
  return SECTION_CODE.test(code.trim());
}

export function compareSectionCodes(left: string, right: string): number {
  const leftCode = normalizeSectionCode(left);
  const rightCode = normalizeSectionCode(right);
  if (!isValidSectionCode(leftCode) || !isValidSectionCode(rightCode)) return compareText(leftCode, rightCode);
  const leftSegments = leftCode.split(".").map(BigInt);
  const rightSegments = rightCode.split(".").map(BigInt);
  for (let index = 0; index < Math.min(leftSegments.length, rightSegments.length); index += 1) {
    if (leftSegments[index] !== rightSegments[index]) return leftSegments[index] < rightSegments[index] ? -1 : 1;
  }
  return leftSegments.length - rightSegments.length;
}

export function relativePathBelongsToDirectory(relativePath: string, directoryPath: string): boolean {
  const candidate = normalizeRelativePath(relativePath);
  const directory = normalizeRelativePath(directoryPath);
  return Boolean(directory) && (candidate === directory || candidate.startsWith(`${directory}/`));
}

export function findExerciseNumberCandidates(
  stem: string,
  config: ExerciseNumberScannerConfig,
): ExerciseNumberCandidate[] {
  const starts = exerciseNumberStarts(stem, config);
  const candidates: ExerciseNumberCandidate[] = [];
  const seen = new Set<string>();

  for (const start of starts) {
    const tail = stem.slice(start);
    const number = tail.match(/^(\d+)/);
    if (!number) continue;
    const main = number[1];
    addExerciseNumberCandidate(candidates, seen, stem, start, main, "");

    const afterMain = tail.slice(main.length);
    const letter = afterMain.match(/^([a-z])/i);
    if (!letter) continue;
    const part = letter[1].toLowerCase();
    addExerciseNumberCandidate(candidates, seen, stem, start, main, part);

    const afterLetter = afterMain.slice(letter[1].length);
    const numericSubpart = afterLetter.match(/^(\d+)/);
    if (numericSubpart) addExerciseNumberCandidate(candidates, seen, stem, start, main, `${part}${numericSubpart[1]}`);
  }

  return candidates.sort((left, right) => right.consumedLength - left.consumedLength || left.exerciseCode.localeCompare(right.exerciseCode, "nl"));
}

export function parseExerciseDirectoryIdentity(name: string, config: ExerciseNumberScannerConfig): ParsedExerciseIdentity | null {
  const exact = findExerciseNumberCandidates(name.trim(), config).filter((candidate) => candidate.remainder.trim() === "");
  if (exact.length === 0) return null;
  const longest = exact[0];
  if (exact.some((candidate) => candidate.consumedLength === longest.consumedLength && candidate.exerciseCode !== longest.exerciseCode)) return null;
  return { exerciseNumber: longest.exerciseNumber, exerciseSuffix: longest.exerciseSuffix, exerciseCode: longest.exerciseCode };
}

function exerciseNumberStarts(stem: string, config: ExerciseNumberScannerConfig): number[] {
  if (config.numberLocation === "start") return [0];
  const marker = config.marker.trim();
  if (!marker) return [];
  const haystack = stem.toLocaleLowerCase("nl");
  const needle = marker.toLocaleLowerCase("nl");
  const starts: number[] = [];
  let offset = 0;
  while (offset <= haystack.length - needle.length) {
    const found = haystack.indexOf(needle, offset);
    if (found < 0) break;
    starts.push(found + marker.length);
    offset = found + Math.max(1, needle.length);
  }
  return starts;
}

function addExerciseNumberCandidate(
  candidates: ExerciseNumberCandidate[],
  seen: Set<string>,
  stem: string,
  start: number,
  main: string,
  suffix: string,
): void {
  const exerciseNumber = Number(main);
  if (!Number.isSafeInteger(exerciseNumber)) return;
  const exerciseCode = `${exerciseNumber}${suffix}`;
  const consumedLength = main.length + suffix.length;
  const key = `${start}:${exerciseCode}`;
  if (seen.has(key)) return;
  seen.add(key);
  const rawRemainder = stem.slice(start + consumedLength);
  candidates.push({
    exerciseNumber,
    exerciseSuffix: suffix,
    exerciseCode,
    remainder: rawRemainder.trimStart(),
    consumedLength,
    hasBoundaryAfterNumber: rawRemainder.length === 0 || /^\s|^[-_(\[{.]/.test(rawRemainder),
  });
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

function comparePortfolioCodeSegment(left: string, right: string): number {
  const leftTokens = left.match(/\d+|[A-Z]+/g) ?? [];
  const rightTokens = right.match(/\d+|[A-Z]+/g) ?? [];
  for (let index = 0; index < Math.min(leftTokens.length, rightTokens.length); index += 1) {
    const leftToken = leftTokens[index];
    const rightToken = rightTokens[index];
    const leftNumeric = /^\d+$/.test(leftToken);
    const rightNumeric = /^\d+$/.test(rightToken);
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    if (leftNumeric) {
      const leftNumber = BigInt(leftToken);
      const rightNumber = BigInt(rightToken);
      if (leftNumber !== rightNumber) return leftNumber < rightNumber ? -1 : 1;
      if (leftToken.length !== rightToken.length) return leftToken.length - rightToken.length;
    } else {
      const comparison = compareText(leftToken, rightToken);
      if (comparison !== 0) return comparison;
    }
  }
  return leftTokens.length - rightTokens.length;
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function documentStem(name: string): string {
  return name.trim().replace(/\.pdf$/i, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeRelativePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/g, "");
}
