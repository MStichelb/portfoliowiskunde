/* eslint-disable @next/next/no-img-element -- authenticated source previews use direct protected URLs. */
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { getAdminExercise } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export default async function AdminExercisePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const exercise = await getAdminExercise(id);
  if (!exercise) notFound();
  return <main className="page-shell solution-page"><Link href={`/admin/portfolio/${encodeURIComponent(`portfolio-${exercise.portfolioCode}`)}#exercise-${encodeURIComponent(exercise.id)}`} className="back-link">Terug naar portfolio</Link><p className="eyebrow">Adminvoorbeeld - ook zichtbaar wanneer verborgen voor leerlingen</p><h1>Oefening {exercise.code}</h1><p>{exercise.portfolioTitle} - {exercise.sectionTitle}</p>{(["standard", "alternative"] as const).map((kind) => { const assets = exercise.assets.filter((asset) => asset.kind === kind); return assets.length === 0 ? null : <section className="solution-variant" key={kind}><h2>{kind === "standard" ? "Standaard" : "Alternatief"}</h2>{assets.map((asset) => <figure className="solution-asset" key={asset.id}>{asset.extension === "pdf" ? <iframe title={asset.fileName} src={`/api/admin/solution-assets/${encodeURIComponent(asset.id)}`} /> : <img src={`/api/admin/solution-assets/${encodeURIComponent(asset.id)}`} alt={asset.fileName} />}<figcaption><a href={`/api/admin/solution-assets/${encodeURIComponent(asset.id)}`} target="_blank" rel="noreferrer">Open oorspronkelijk bestand</a></figcaption></figure>)}</section>; })}</main>;
}
