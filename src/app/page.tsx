import { UserRound } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageBanner } from "@/app/components/page-banner";
import { StudentHandledReportNotificationBanner } from "@/app/components/student-handled-report-notification";
import { getAuthenticatedUser } from "@/lib/auth";
import { getPubliclyAccessibleLearningSpaceIds } from "@/lib/public-access";
import { getLearningSpaces } from "@/lib/repositories";
import { listPendingHandledReportNotificationsForCurrentUser } from "@/lib/student-error-reports";
import { cardColorStyle, DEFAULT_LEARNING_SPACE_COLOR } from "@/lib/ui-colors";
import { listLearningSpaceOwnerNames } from "@/lib/user-management";

export const dynamic = "force-dynamic";

export default async function StudentPage() {
  const user = await getAuthenticatedUser();
  const [allSpaces, accessibleIds] = await Promise.all([getLearningSpaces(true), getPubliclyAccessibleLearningSpaceIds(user)]);
  const spaces = allSpaces.filter((space) => accessibleIds.includes(space.id));
  if (!user && spaces.length === 0) redirect("/aanmelden");
  if (user?.role === "student" && spaces.length === 0) redirect("/geen-leeromgeving");
  if (user?.role === "student" && spaces.length === 1) redirect(`/${encodeURIComponent(spaces[0].slug)}`);
  const [notification, ownerNamesBySpace] = await Promise.all([
    user?.role === "student" ? listPendingHandledReportNotificationsForCurrentUser() : null,
    user && spaces.length > 1 ? listLearningSpaceOwnerNames(spaces.map((space) => space.id)) : Promise.resolve(new Map<string, string[]>()),
  ]);
  return <main className="page-shell student-page"><PageBanner variant="main" /><StudentHandledReportNotificationBanner notification={notification} /><header className="page-header public-home-heading"><h1>Kies je leeromgeving</h1></header><div className="portfolio-cards learning-space-cards">{spaces.map((space) => {
    const ownerNames = ownerNamesBySpace.get(space.id) ?? [];
    return <Link className="portfolio-card color-card" style={cardColorStyle(space.cardColor, DEFAULT_LEARNING_SPACE_COLOR)} key={space.id} href={`/${encodeURIComponent(space.slug)}`}><strong>{space.name}</strong><small>{space.description}</small>{ownerNames.length > 0 ? <span className="learning-space-owner"><UserRound size={15} aria-hidden /><span>{ownerNames.join(", ")}</span></span> : null}</Link>;
  })}</div></main>;
}
