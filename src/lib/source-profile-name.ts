import { z } from "zod";

import { getDatabase } from "@/lib/database";

export const sourceProfileNameSchema = z.string().trim().min(1, "Geef het bronprofiel een naam.").max(80, "Een profielnaam mag maximaal 80 tekens bevatten.");

export async function uniqueSourceProfileName(managementLearningSpaceId: string, value: string, excludeProfileId?: string): Promise<string> {
  const result = sourceProfileNameSchema.safeParse(value);
  if (!result.success) throw new Error(result.error.issues[0]?.message ?? "Ongeldige profielnaam.");
  const name = result.data;
  const duplicate = await (await getDatabase()).execute({
    sql: `SELECT 1 FROM source_profiles
      WHERE type = 'custom' AND management_learning_space_id = ? AND LOWER(TRIM(name)) = LOWER(?)
        AND (? IS NULL OR id <> ?)
      LIMIT 1`,
    args: [managementLearningSpaceId, name, excludeProfileId ?? null, excludeProfileId ?? null],
  });
  if (duplicate.rows[0]) throw new Error("Binnen deze beheercontext bestaat al een bronprofiel met deze naam.");
  return name;
}

export async function availableSourceProfileName(managementLearningSpaceId: string, value: string): Promise<string> {
  const parsed = sourceProfileNameSchema.safeParse(value);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Ongeldige profielnaam.");
  const names = (await (await getDatabase()).execute({
    sql: "SELECT name FROM source_profiles WHERE type = 'custom' AND management_learning_space_id = ?",
    args: [managementLearningSpaceId],
  })).rows.map((row) => String(row.name).trim().toLocaleLowerCase("nl"));
  for (let number = 1; number <= names.length + 1; number += 1) {
    const suffix = number === 1 ? "" : ` (${number})`;
    const name = parsed.data.slice(0, 80 - suffix.length).trimEnd() + suffix;
    if (!names.includes(name.toLocaleLowerCase("nl"))) return name;
  }
  throw new Error("Er kon geen unieke naam voor de profielkopie worden gemaakt.");
}
