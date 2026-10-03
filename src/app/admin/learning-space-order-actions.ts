"use server";

import { revalidatePath } from "next/cache";

import { requireAdminUser } from "@/lib/auth";
import { AuthorizationError, getAccessibleLearningSpaceIds } from "@/lib/authorization";
import { saveUserLearningSpaceOrder } from "@/lib/user-learning-space-order";

export async function savePersonalLearningSpaceOrderAction(formData: FormData): Promise<void> {
  const user = await requireAdminUser();
  const orderedIds = formData.getAll("learningSpaceId")
    .map((value) => String(value).trim())
    .filter(Boolean);
  const accessibleIds = await getAccessibleLearningSpaceIds(user);

  if (!isExactIdSet(orderedIds, accessibleIds)) {
    throw new AuthorizationError("De gekozen volgorde bevat een ontoegankelijke of ontbrekende leeromgeving.");
  }

  await saveUserLearningSpaceOrder(user.id, orderedIds);
  revalidatePath("/", "layout");
  revalidatePath("/admin");
}

function isExactIdSet(submittedIds: readonly string[], allowedIds: readonly string[]): boolean {
  if (submittedIds.length !== allowedIds.length || new Set(submittedIds).size !== submittedIds.length) return false;
  const allowed = new Set(allowedIds);
  return submittedIds.every((id) => allowed.has(id));
}
