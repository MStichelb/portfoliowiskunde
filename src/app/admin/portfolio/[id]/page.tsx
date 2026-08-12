import { notFound, redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { getAdminPortfolioAny, getLearningSpace } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export default async function LegacyPortfolioAdminPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const portfolio = await getAdminPortfolioAny(id);
  const space = portfolio ? await getLearningSpace(portfolio.learningSpaceId) : null;
  if (!portfolio || !space) notFound();
  redirect(`/admin/${encodeURIComponent(space.slug)}/portfolio/${encodeURIComponent(id)}`);
}
