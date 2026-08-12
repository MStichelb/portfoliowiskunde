import { notFound, redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { getLearningSpaces } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export default async function LegacyReportsPage() {
  await requireAdmin();
  const space = (await getLearningSpaces(true)).at(-1);
  if (!space) notFound();
  redirect(`/admin/${encodeURIComponent(space.slug)}/foutmeldingen`);
}
