/* eslint-disable @next/next/no-img-element -- authenticated, dynamic solution URLs cannot use the image optimizer. */
import Link from "next/link";
import { notFound } from "next/navigation";

import { ErrorReportForm } from "@/app/components/error-report-form";
import { maybeAutoSynchronize } from "@/lib/auto-sync";
import { getVisibleExercise } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export default async function ExercisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await maybeAutoSynchronize();
  const exercise = await getVisibleExercise(id);
  if (!exercise) notFound();
  const standard = exercise.assets.filter((asset) => asset.kind === "standard");
  const alternative = exercise.assets.filter((asset) => asset.kind === "alternative");
  return <main className="page-shell solution-page"><Link href={`/portfolio/${encodeURIComponent(`portfolio-${exercise.portfolioCode}`)}`} className="back-link">Terug naar portfolio</Link><p className="eyebrow">Portfolio {exercise.portfolioCode} · {exercise.sectionTitle}</p><h1>Oefening {exercise.code}</h1><p>{exercise.portfolioTitle}</p><SolutionVariant title="Uitwerking" assets={standard} />{alternative.length > 0 && <SolutionVariant title="Alternatieve uitwerking" assets={alternative} />}<ErrorReportForm exerciseId={exercise.id} variants={alternative.length > 0 ? ["standard", "alternative"] : ["standard"]} /></main>;
}

function SolutionVariant({ title, assets }: { title: string; assets: Array<{ id: string; fileName: string; extension: string; step: number }> }) {
  if (assets.length === 0) return null;
  return <section className="solution-variant"><h2>{title}</h2>{assets.map((asset) => <figure className="solution-asset" key={asset.id}>{asset.extension === "pdf" ? <iframe title={`${title} ${asset.fileName}`} src={`/api/solution-assets/${encodeURIComponent(asset.id)}`} /> : <img src={`/api/solution-assets/${encodeURIComponent(asset.id)}`} alt={`${title}, ${assets.length > 1 ? `stap ${asset.step}` : "uitwerking"}`} /> }<figcaption>{assets.length > 1 ? `Stap ${asset.step}: ` : ""}<a href={`/api/solution-assets/${encodeURIComponent(asset.id)}`} target="_blank" rel="noreferrer">Open oorspronkelijk bestand</a></figcaption></figure>)}</section>;
}
