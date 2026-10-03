import { getDatabase, type DatabaseRow } from "@/lib/database";
import type { StorageEntry, StorageProvider } from "@/lib/storage/provider";

export type LearningSpaceHeaderExtension = "png" | "jpg";

export interface IndexedLearningSpaceHeader {
  sourceId: string;
  relativePath: string;
  fileName: string;
  extension: LearningSpaceHeaderExtension;
  lastModifiedAt: string | null;
  sourceVersion: string | null;
}

export interface LearningSpaceHeaderAsset extends IndexedLearningSpaceHeader {
  id: string;
  learningSpaceId: string;
  learningSpaceSourceId: string;
}

const HEADER_NAMES: ReadonlyArray<{ fileName: string; extension: LearningSpaceHeaderExtension }> = [
  { fileName: "header.png", extension: "png" },
  { fileName: "header.jpg", extension: "jpg" },
];

export async function detectLearningSpaceHeader(provider: StorageProvider): Promise<IndexedLearningSpaceHeader | null> {
  const rootEntries = await provider.list("");
  for (const candidate of HEADER_NAMES) {
    const entry = rootEntries.find((item) => isRootFile(item)
      && item.name.toLocaleLowerCase("en-US") === candidate.fileName);
    if (entry) return indexedHeader(entry, candidate.extension);
  }
  return null;
}

export async function getLearningSpaceHeaderAsset(learningSpaceId: string): Promise<LearningSpaceHeaderAsset | null> {
  const result = await (await getDatabase()).execute({
    sql: "SELECT * FROM learning_space_header_assets WHERE learning_space_id = ?",
    args: [learningSpaceId],
  });
  return result.rows[0] ? headerAssetFromRow(result.rows[0]) : null;
}

export async function getPublicLearningSpaceHeaderAsset(id: string, learningSpaceId: string): Promise<LearningSpaceHeaderAsset | null> {
  const result = await (await getDatabase()).execute({
    sql: "SELECT * FROM learning_space_header_assets WHERE id = ? AND learning_space_id = ?",
    args: [id, learningSpaceId],
  });
  return result.rows[0] ? headerAssetFromRow(result.rows[0]) : null;
}

function isRootFile(entry: StorageEntry): boolean {
  return entry.kind === "file" && !/[\\/]/.test(entry.relativePath);
}

function indexedHeader(entry: StorageEntry, extension: LearningSpaceHeaderExtension): IndexedLearningSpaceHeader {
  return {
    sourceId: entry.sourceId ?? entry.relativePath,
    relativePath: entry.relativePath,
    fileName: entry.name,
    extension,
    lastModifiedAt: entry.lastModifiedAt ?? null,
    sourceVersion: entry.sourceVersion ?? null,
  };
}

function headerAssetFromRow(row: DatabaseRow): LearningSpaceHeaderAsset {
  return {
    id: String(row.id),
    learningSpaceId: String(row.learning_space_id),
    learningSpaceSourceId: String(row.learning_space_source_id),
    sourceId: String(row.source_id),
    relativePath: String(row.relative_path),
    fileName: String(row.file_name),
    extension: row.extension === "jpg" ? "jpg" : "png",
    lastModifiedAt: typeof row.last_modified_at === "string" ? row.last_modified_at : null,
    sourceVersion: typeof row.source_version === "string" ? row.source_version : null,
  };
}
