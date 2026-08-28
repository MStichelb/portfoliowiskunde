import { notFound } from "next/navigation";

import { AdminExercisePreviewToolbar } from "@/app/components/admin-exercise-preview-toolbar";
import { AdminSpaceHeader } from "@/app/components/admin-space-header";
import { SolutionImage } from "@/app/components/solution-image";
import { SolutionVariantHeading } from "@/app/components/solution-variant-heading";
import { requireAdmin } from "@/lib/auth";
import { adminExercisePortfolioHref } from "@/lib/admin-routes";
import { getAdminExercise, getAdminLearningSpaceBySlug } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export default async function LearningSpaceAdminExercisePage({ params }: { params: Promise<{ spaceSlug: string; id: string }> }) {
  await requireAdmin();
  const { spaceSlug, id } = await params;
  const space = await getAdminLearningSpaceBySlug(spaceSlug);
  if (!space) notFound();
  const exercise = await getAdminExercise(id, space.id);
  if (!exercise) notFound();

  return <main className="page-shell admin-page admin-space-page solution-page">
    <AdminSpaceHeader current={space} section="portfolios" />
    <AdminExercisePreviewToolbar portfolioHref={adminExercisePortfolioHref(space.slug, exercise.portfolioId, exercise.id)} />
    <h2>Oefening {exercise.code}</h2><p>{exercise.portfolioTitle} - {exercise.sectionTitle}</p>
    {!exercise.isIndexed ? <p className="form-message" role="status">Deze oefening is niet meer aanwezig in de bronmap. De historische metadata blijft behouden tot je de index opschoont.</p> : (["standard", "alternative"] as const).map((kind) => {
      const assets = exercise.assets.filter((asset) => asset.kind === kind);
      return assets.length === 0 ? null : <section className="solution-variant" key={kind}><SolutionVariantHeading kind={kind} />{assets.map((asset) => <figure className="solution-asset" key={asset.id}>{asset.extension === "pdf" ? <iframe title={asset.fileName} src={`/api/admin/solution-assets/${encodeURIComponent(asset.id)}?space=${encodeURIComponent(space.slug)}`} /> : <SolutionImage src={`/api/admin/solution-assets/${encodeURIComponent(asset.id)}?space=${encodeURIComponent(space.slug)}`} alt={asset.fileName} />}<figcaption><a href={`/api/admin/solution-assets/${encodeURIComponent(asset.id)}?space=${encodeURIComponent(space.slug)}`} target="_blank" rel="noreferrer">Open oorspronkelijk bestand</a></figcaption></figure>)}</section>;
    })}
  </main>;
}
