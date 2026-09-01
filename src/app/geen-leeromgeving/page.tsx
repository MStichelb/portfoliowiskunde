import { redirect } from "next/navigation";

import { requireAuthenticatedUser } from "@/lib/auth";
import { getAccessibleLearningSpaceIds } from "@/lib/authorization";

export const dynamic = "force-dynamic";

export default async function NoLearningSpacePage() {
  const user = await requireAuthenticatedUser();
  if ((await getAccessibleLearningSpaceIds(user)).length > 0) redirect("/");
  return <main className="page-shell narrow-page"><p className="eyebrow">Portfolio Wiskunde</p><h1>Geen leeromgeving beschikbaar</h1><p>Je Smartschoolaccount is momenteel niet aan een leeromgeving gekoppeld. Neem contact op met je leraar of beheerder.</p></main>;
}
