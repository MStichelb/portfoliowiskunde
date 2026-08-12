/* eslint-disable @next/next/no-img-element -- authenticated source previews use direct protected URLs. */
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { getAdminExercise, getLearningSpaceBySlug } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export default async function LearningSpaceAdminExercisePage({ params }: { params: Promise<{ spaceSlug: string; id: string }> }) {
  await requireAdmin();
  const { spaceSlug, id } = await params;
  const space = await getLearningSpaceBySlug(spaceSlug);
  if (!space) notFound();
  const exercise = await getAdminExercise(id, space.id);
  if (!exercise) notFound();

  return <main className="page-shell solution-page">
    <Link href={`/admin/${encodeURIComponent(space.slug)}/portfolio/${encodeURIComponent(`portfolio-${exercise.portfolioCode}`)}#exercise-${encodeURIComponent(exercise.id)}`} className="back-link">Terug naar portfolio</Link>
    <aside className="admin-preview-banner" role="note"><strong>Adminweergave</strong><span>Deze pagina kan inhoud tonen die voor leerlingen verborgen is.</span></aside>
    <h1>Oefening {exercise.code}</h1><p>{exercise.portfolioTitle} - {exercise.sectionTitle}</p>
    {!exercise.isIndexed ? <p className="form-message" role="status">Deze oefening is niet meer aanwezig in de bronmap. De historische metadata blijft behouden tot je de index opschoont.</p> : (["standard", "alternative"] as const).map((kind) => {
      const assets = exercise.assets.filter((asset) => asset.kind === kind);
      return assets.length === 0 ? null : <section className="solution-variant" key={kind}><h2>{kind === "standard" ? "Uitwerking" : "Alternatieve uitwerking"}</h2>{assets.map((asset) => <figure className="solution-asset" key={asset.id}>{asset.extension === "pdf" ? <iframe title={asset.fileName} src={`/api/admin/solution-assets/${encodeURIComponent(asset.id)}?space=${encodeURIComponent(space.slug)}`} /> : <img src={`/api/admin/solution-assets/${encodeURIComponent(asset.id)}?space=${encodeURIComponent(space.slug)}`} alt={asset.fileName} />}<figcaption><a href={`/api/admin/solution-assets/${encodeURIComponent(asset.id)}?space=${encodeURIComponent(space.slug)}`} target="_blank" rel="noreferrer">Open oorspronkelijk bestand</a></figcaption></figure>)}</section>;
    })}
  </main>;
}
