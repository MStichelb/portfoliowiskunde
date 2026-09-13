import { notFound } from "next/navigation";

import { AdminExercisePreviewToolbar } from "@/app/components/admin-exercise-preview-toolbar";
import { AdminSpaceHeader } from "@/app/components/admin-space-header";
import { SolutionImage } from "@/app/components/solution-image";
import { SolutionVariantHeading } from "@/app/components/solution-variant-heading";
import { requireAdminUser } from "@/lib/auth";
import { canManageLearningSpace } from "@/lib/authorization";
import { adminExercisePortfolioHref } from "@/lib/admin-routes";
import { getAdminExercise, getAdminLearningSpaceBySlug, type ExerciseResource } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export default async function LearningSpaceAdminExercisePage({ params }: { params: Promise<{ spaceSlug: string; id: string }> }) {
  const user = await requireAdminUser();
  const { spaceSlug, id } = await params;
  const space = await getAdminLearningSpaceBySlug(spaceSlug);
  if (!space || !await canManageLearningSpace(user, space.id)) notFound();
  const exercise = await getAdminExercise(id, space.id);
  if (!exercise) notFound();

  const resources = exercise.resources.filter((resource) => resource.available && resource.legacyVariant !== null);

  return <main className="page-shell admin-page admin-space-page solution-page">
    <AdminSpaceHeader current={space} section="portfolios" user={user} />
    <AdminExercisePreviewToolbar portfolioHref={adminExercisePortfolioHref(space.slug, exercise.portfolioId, exercise.id)} />
    <h2>Oefening {exercise.code}</h2><p>{exercise.portfolioTitle} - {exercise.sectionTitle}</p>
    {!exercise.isIndexed
      ? <p className="form-message" role="status">Deze oefening is niet meer aanwezig in de bronmap. De historische metadata blijft behouden tot je de index opschoont.</p>
      : resources.map((resource) => <Variant resource={resource} spaceSlug={space.slug} key={resource.id} />)}
  </main>;
}

function Variant({ resource, spaceSlug }: { resource: ExerciseResource; spaceSlug: string }) {
  if (!resource.legacyVariant) return null;
  return <section className="solution-variant">
    <SolutionVariantHeading kind={resource.legacyVariant} label={resource.label} icon={resource.icon} />
    {resource.assets.map((asset) => <figure className="solution-asset" key={asset.id}>
      {asset.extension === "pdf"
        ? <iframe title={asset.fileName} src={`/api/admin/solution-assets/${encodeURIComponent(asset.id)}?space=${encodeURIComponent(spaceSlug)}`} />
        : <SolutionImage src={`/api/admin/solution-assets/${encodeURIComponent(asset.id)}?space=${encodeURIComponent(spaceSlug)}`} alt={asset.fileName} />}
      <figcaption><a href={`/api/admin/solution-assets/${encodeURIComponent(asset.id)}?space=${encodeURIComponent(spaceSlug)}`} target="_blank" rel="noreferrer">Open oorspronkelijk bestand</a></figcaption>
    </figure>)}
  </section>;
}
