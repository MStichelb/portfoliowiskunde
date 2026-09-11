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
