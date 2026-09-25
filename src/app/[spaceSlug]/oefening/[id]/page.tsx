import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { ErrorReportForm } from "@/app/components/error-report-form";
import { ExerciseSolutionWithNote } from "@/app/components/exercise-solution-with-note";
import { SolutionImage } from "@/app/components/solution-image";
import { SolutionVariantHeading } from "@/app/components/solution-variant-heading";
import { isNextPrefetchRequest, preparePublicIndex } from "@/lib/public-index";
import { requirePublicLearningSpaceAccess } from "@/lib/learning-space-access";
import { getLearningSpaceBySlug, getVisibleExercise, type ExerciseResource } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export default async function LearningSpaceExercisePage({ params }: { params: Promise<{ spaceSlug: string; id: string }> }) {
  const { spaceSlug, id } = await params;
  const space = await getLearningSpaceBySlug(spaceSlug);
  if (!space || !space.isActive) notFound();
  const user = await requirePublicLearningSpaceAccess(space.id, `/${encodeURIComponent(space.slug)}/oefening/${encodeURIComponent(id)}`);
  await preparePublicIndex(space.id, { isPrefetch: isNextPrefetchRequest(await headers()) });
  const exercise = await getVisibleExercise(id, space.id);
  if (!exercise) notFound();

  const resources = exercise.resources.filter((resource) => resource.available && resource.legacyVariant !== null);
  const variants = resources
    .map((resource) => resource.legacyVariant)
    .filter((variant): variant is "standard" | "alternative" => variant !== null);
  const reportVariants: Array<"standard" | "alternative"> = [...new Set(variants)];
  if (reportVariants.length === 0) reportVariants.push("standard");

  return <main className="page-shell solution-page">
    <Link href={`/${encodeURIComponent(space.slug)}/portfolio/${encodeURIComponent(exercise.portfolioId)}`} className="secondary-button compact-back-button"><ArrowLeft size={17} aria-hidden />Terug naar portfolio</Link>
    <header className="exercise-page-heading"><p className="eyebrow">Portfolio {exercise.portfolioCode} • {exercise.portfolioTitle}</p><h1>Oefening {exercise.code}</h1><p>{exercise.sectionTitle}</p></header>
    <ExerciseSolutionWithNote customNote={exercise.customNote} noteLabel={exercise.noteLabel} notePosition={exercise.notePosition}>
      {resources.map((resource) => <Variant resource={resource} spaceSlug={space.slug} key={resource.id} />)}
    </ExerciseSolutionWithNote>
    {user ? <ErrorReportForm exerciseId={exercise.id} variants={reportVariants} /> : null}
  </main>;
}

function Variant({ resource, spaceSlug }: { resource: ExerciseResource; spaceSlug: string }) {
  if (!resource.legacyVariant) return null;
  return <section className="solution-variant">
    <SolutionVariantHeading kind={resource.legacyVariant} label={resource.label} icon={resource.icon} />
    {resource.assets.map((asset) => <figure className="solution-asset" key={asset.id}>
      {asset.extension === "pdf"
        ? <iframe title={`${resource.label} ${asset.fileName}`} src={`/api/solution-assets/${encodeURIComponent(asset.id)}?space=${encodeURIComponent(spaceSlug)}`} />
        : <SolutionImage src={`/api/solution-assets/${encodeURIComponent(asset.id)}?space=${encodeURIComponent(spaceSlug)}`} alt={asset.fileName} />}
      <figcaption><a href={`/api/solution-assets/${encodeURIComponent(asset.id)}?space=${encodeURIComponent(spaceSlug)}`} target="_blank" rel="noreferrer">Open het oorspronkelijke bestand</a></figcaption>
    </figure>)}
  </section>;
}
