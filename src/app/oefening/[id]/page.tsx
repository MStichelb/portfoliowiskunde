import Link from "next/link";
import { notFound } from "next/navigation";

import { getVisibleExercise } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export default async function ExercisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const exercise = await getVisibleExercise(id);
  if (!exercise) notFound();

  const standard = exercise.assets.filter((asset) => asset.kind === "standard");
  const alternative = exercise.assets.filter((asset) => asset.kind === "alternative");

  return (
    <main className="page-shell solution-page">
      <Link href="/" className="back-link">Terug naar portfolio&apos;s</Link>
      <p className="eyebrow">Portfolio {exercise.portfolioCode}</p>
      <h1>Oefening {exercise.code}</h1>
      <p>{exercise.portfolioTitle}</p>
      <SolutionVariant title="Standaard" assets={standard} />
      {alternative.length > 0 && <SolutionVariant title="Alternatief" assets={alternative} />}
    </main>
  );
}

function SolutionVariant({
  title,
  assets,
}: {
  title: string;
  assets: Array<{ id: string; fileName: string; extension: string; step: number }>;
}) {
  if (assets.length === 0) return null;
  return (
    <section className="solution-variant">
      <h2>{title}</h2>
      <ol>
        {assets.map((asset) => (
          <li key={asset.id}>
            <a href={`/api/solution-assets/${encodeURIComponent(asset.id)}`} target="_blank" rel="noreferrer">
              {assets.length > 1 ? `Stap ${asset.step}: ` : "Open uitwerking: "}{asset.fileName}
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}
