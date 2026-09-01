import { notFound, redirect } from "next/navigation";

import { requirePublicLearningSpaceAccess } from "@/lib/learning-space-access";
import { getAdminPortfolioAny, getLearningSpace, getStudentPortfolio } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export default async function LegacyPortfolioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const indexedPortfolio = await getAdminPortfolioAny(id);
  const space = indexedPortfolio ? await getLearningSpace(indexedPortfolio.learningSpaceId) : null;
  if (!space?.isActive) notFound();
  await requirePublicLearningSpaceAccess(space.id, `/portfolio/${encodeURIComponent(id)}`);
  if (!await getStudentPortfolio(id, space.id)) notFound();
  redirect(`/${encodeURIComponent(space.slug)}/portfolio/${encodeURIComponent(id)}`);
}
