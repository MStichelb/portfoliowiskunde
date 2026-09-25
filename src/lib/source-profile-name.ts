import { z } from "zod";

import { getDatabase } from "@/lib/database";

export const sourceProfileNameSchema = z.string().trim().min(1, "Geef het bronprofiel een naam.").max(80, "Een profielnaam mag maximaal 80 tekens bevatten.");
export const SOURCE_PROFILE_NAME_UNIQUE_INDEX = "source_profiles_owner_normalized_name_unique";
export const SOURCE_PROFILE_NAME_CONFLICT_MESSAGE = "Je hebt al een bronprofiel met deze naam.";

export async function uniqueSourceProfileName(ownerUserId: string, value: string, excludeProfileId?: string): Promise<string> {
  const result = sourceProfileNameSchema.safeParse(value);
  if (!result.success) throw new Error(result.error.issues[0]?.message ?? "Ongeldige profielnaam.");
  const name = result.data;
  const duplicate = await (await getDatabase()).execute({
    sql: `SELECT 1 FROM source_profiles
      WHERE type = 'custom' AND owner_user_id = ? AND LOWER(TRIM(name)) = LOWER(?)
        AND (? IS NULL OR id <> ?)
      LIMIT 1`,
    args: [ownerUserId, name, excludeProfileId ?? null, excludeProfileId ?? null],
  });
  if (duplicate.rows[0]) throw new Error(SOURCE_PROFILE_NAME_CONFLICT_MESSAGE);
  return name;
}

export function rethrowUniqueNameConflict(error: unknown, indexName: string, message: string): never {
  if (isUniqueIndexViolation(error, indexName)) throw new Error(message);
  throw error;
}

function isUniqueIndexViolation(error: unknown, indexName: string): boolean {
  let current = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
    const candidate = current as { code?: unknown; constraint?: unknown; constraintName?: unknown; message?: unknown; cause?: unknown };
    const code = typeof candidate.code === "string" ? candidate.code : "";
    const constraint = typeof candidate.constraint === "string"
      ? candidate.constraint
      : typeof candidate.constraintName === "string" ? candidate.constraintName : "";
    const message = typeof candidate.message === "string" ? candidate.message : "";
    const isUniqueViolation = code === "23505" || code === "SQLITE_CONSTRAINT_UNIQUE" || code === "SQLITE_CONSTRAINT";
    if (isUniqueViolation && (constraint === indexName || message.includes(indexName))) return true;
    current = candidate.cause;
  }
  return false;
}

export async function availableSourceProfileName(ownerUserId: string, value: string): Promise<string> {
  const parsed = sourceProfileNameSchema.safeParse(value);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Ongeldige profielnaam.");
  const names = (await (await getDatabase()).execute({
    sql: "SELECT name FROM source_profiles WHERE type = 'custom' AND owner_user_id = ?",
    args: [ownerUserId],
  })).rows.map((row) => String(row.name).trim().toLocaleLowerCase("nl"));
  for (let number = 1; number <= names.length + 1; number += 1) {
    const suffix = number === 1 ? "" : ` (${number})`;
    const name = parsed.data.slice(0, 80 - suffix.length).trimEnd() + suffix;
    if (!names.includes(name.toLocaleLowerCase("nl"))) return name;
  }
  throw new Error("Er kon geen unieke naam voor de profielkopie worden gemaakt.");
}
