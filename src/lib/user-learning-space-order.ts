import { executeBatch, getDatabase } from "@/lib/database";

export interface OrderableLearningSpace {
  id: string;
  name: string;
  sortOrder: number;
}

export async function orderLearningSpacesForUser<T extends OrderableLearningSpace>(userId: string, spaces: readonly T[]): Promise<T[]> {
  const preferences = await getUserLearningSpacePreferences(userId);
  return applyUserLearningSpaceOrder(spaces, preferences);
}

export async function getUserLearningSpacePreferences(userId: string): Promise<Map<string, number>> {
  const result = await (await getDatabase()).execute({
    sql: `SELECT learning_space_id, sort_order
      FROM user_learning_space_preferences
      WHERE user_id = ?
      ORDER BY sort_order, learning_space_id`,
    args: [userId],
  });
  return new Map(result.rows.map((row) => [String(row.learning_space_id), Number(row.sort_order)]));
}

export function applyUserLearningSpaceOrder<T extends OrderableLearningSpace>(
  spaces: readonly T[],
  preferences: ReadonlyMap<string, number>,
): T[] {
  return [...spaces].sort((left, right) => {
    const leftPreference = preferences.get(left.id);
    const rightPreference = preferences.get(right.id);
    if (leftPreference !== undefined && rightPreference !== undefined) {
      return leftPreference - rightPreference || fallbackComparison(left, right);
    }
    if (leftPreference !== undefined) return -1;
    if (rightPreference !== undefined) return 1;
    return fallbackComparison(left, right);
  });
}

export async function saveUserLearningSpaceOrder(userId: string, orderedLearningSpaceIds: readonly string[]): Promise<void> {
  await executeBatch(orderedLearningSpaceIds.map((learningSpaceId, index) => ({
    sql: `INSERT INTO user_learning_space_preferences (user_id, learning_space_id, sort_order)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, learning_space_id) DO UPDATE SET sort_order = excluded.sort_order`,
    args: [userId, learningSpaceId, (index + 1) * 10],
  })));
}

function fallbackComparison(left: OrderableLearningSpace, right: OrderableLearningSpace): number {
  return left.sortOrder - right.sortOrder
    || left.name.localeCompare(right.name, "nl", { sensitivity: "base" })
    || left.id.localeCompare(right.id);
}
