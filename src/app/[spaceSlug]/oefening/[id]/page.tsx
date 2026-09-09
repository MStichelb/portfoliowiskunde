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
import { getLearningSpaceBySlug, getVisibleExercise } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export default async function LearningSpaceExercisePage({ params }: { params: Promise<{ spaceSlug: string; id: string }> }) {
  const { spaceSlug, id } = await params;
  const space = await getLearningSpaceBySlug(spaceSlug);
  if (!space || !space.isActive) notFound();
  const user = await requirePublicLearningSpaceAccess(space.id, `/${encodeURIComponent(space.slug)}/oefening/${encodeURIComponent(id)}`);
  await preparePublicIndex(space.id, { isPrefetch: isNextPrefetchRequest(await headers()) });
  const exercise = await getVisibleExercise(id, space.id);
  if (!exercise) notFound();
  const standard = exercise.assets.filter((asset) => asset.kind === "standard");
  const alternative = exercise.assets.filter((asset) => asset.kind === "alternative");
  const variants: Array<"standard" | "alternative"> = alternative.length > 0 ? ["standard", "alternative"] : ["standard"];
  return <main className="page-shell solution-page"><Link href={`/${encodeURIComponent(space.slug)}/portfolio/${encodeURIComponent(exercise.portfolioId)}`} className="secondary-button compact-back-button"><ArrowLeft size={17} aria-hidden />Terug naar portfolio</Link><header className="exercise-page-heading"><p className="eyebrow">Portfolio {exercise.portfolioCode} • {exercise.portfolioTitle}</p><h1>Oefening {exercise.code}</h1><p>{exercise.sectionTitle}</p></header><ExerciseSolutionWithNote customNote={exercise.customNote} noteLabel={exercise.noteLabel} notePosition={exercise.notePosition}><Variant title="Uitwerking" assets={standard} spaceSlug={space.slug} />{alternative.length > 0 && <Variant title="Alternatieve uitwerking" assets={alternative} spaceSlug={space.slug} />}</ExerciseSolutionWithNote>{user ? <ErrorReportForm exerciseId={exercise.id} variants={variants} /> : null}</main>;
}

function Variant({ title, assets, spaceSlug }: { title: string; assets: Array<{ id: string; fileName: string; extension: string; step: number }>; spaceSlug: string }) { const kind = title === "Uitwerking" ? "standard" : "alternative"; return <section className="solution-variant"><SolutionVariantHeading kind={kind} />{assets.map((asset) => <figure className="solution-asset" key={asset.id}>{asset.extension === "pdf" ? <iframe title={`${title} ${asset.fileName}`} src={`/api/solution-assets/${encodeURIComponent(asset.id)}?space=${encodeURIComponent(spaceSlug)}`} /> : <SolutionImage src={`/api/solution-assets/${encodeURIComponent(asset.id)}?space=${encodeURIComponent(spaceSlug)}`} alt={asset.fileName} />}<figcaption><a href={`/api/solution-assets/${encodeURIComponent(asset.id)}?space=${encodeURIComponent(spaceSlug)}`} target="_blank" rel="noreferrer">Open het oorspronkelijke bestand</a></figcaption></figure>)}</section>; }
