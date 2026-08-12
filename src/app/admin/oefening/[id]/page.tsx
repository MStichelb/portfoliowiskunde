import { notFound, redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { getAdminExercise, getLearningSpace } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export default async function LegacyAdminExercisePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const exercise = await getAdminExercise(id);
  const space = exercise ? await getLearningSpace(exercise.learningSpaceId) : null;
  if (!exercise || !space) notFound();
  redirect(`/admin/${encodeURIComponent(space.slug)}/oefening/${encodeURIComponent(id)}`);
}
