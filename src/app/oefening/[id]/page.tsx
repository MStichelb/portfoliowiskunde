import { notFound, redirect } from "next/navigation";

import { requirePublicLearningSpaceAccess } from "@/lib/learning-space-access";
import { getLearningSpace, getVisibleExercise } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export default async function LegacyExercisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const exercise = await getVisibleExercise(id);
  const space = exercise ? await getLearningSpace(exercise.learningSpaceId) : null;
  if (!exercise || !space?.isActive) notFound();
  await requirePublicLearningSpaceAccess(space.id, `/oefening/${encodeURIComponent(id)}`);
  redirect(`/${encodeURIComponent(space.slug)}/oefening/${encodeURIComponent(id)}`);
}
