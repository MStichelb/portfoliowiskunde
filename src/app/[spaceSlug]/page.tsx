import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { PageBanner } from "@/app/components/page-banner";
import { StudentHandledReportNotificationBanner } from "@/app/components/student-handled-report-notification";
import { isNextPrefetchRequest, preparePublicIndex } from "@/lib/public-index";
import { requirePublicLearningSpaceAccess } from "@/lib/learning-space-access";
import { getLearningSpaceBySlug, getStudentPortfolios, getThemes } from "@/lib/repositories";
import { listPendingHandledReportNotificationsForCurrentUser } from "@/lib/student-error-reports";
import { cardColorStyle, DEFAULT_PORTFOLIO_COLOR } from "@/lib/ui-colors";
import { formatTerminologyLabel, miscellaneousCollectionLabel } from "@/lib/collection-terminology";
import { buildPortfolioThemeGroups } from "@/lib/portfolio-theme-groups";
import { getLearningSpaceHeaderAsset } from "@/lib/learning-space-header";

export const dynamic = "force-dynamic";

export default async function LearningSpacePage({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const { spaceSlug } = await params;
  const space = await getLearningSpaceBySlug(spaceSlug);
  if (!space || !space.isActive) notFound();
  const user = await requirePublicLearningSpaceAccess(space.id, `/${encodeURIComponent(space.slug)}`);
  await preparePublicIndex(space.id, { isPrefetch: isNextPrefetchRequest(await headers()) });
  const [portfolios, themes, notification, headerAsset] = await Promise.all([
    getStudentPortfolios(space.id),
    getThemes(space.id),
    user?.role === "student" ? listPendingHandledReportNotificationsForCurrentUser() : Promise.resolve(null),
    getLearningSpaceHeaderAsset(space.id),
  ]);
  const groups = buildPortfolioThemeGroups(portfolios, themes, miscellaneousCollectionLabel(space.collectionLabelPlural));
  const homeNotification = notification?.singleLearningSpaceId === space.id ? notification : null;
  const headerSrc = headerAsset
    ? `/api/learning-space-headers/${encodeURIComponent(headerAsset.id)}?space=${encodeURIComponent(space.slug)}`
    : undefined;
  return <main className="page-shell student-page"><PageBanner variant="portfolio" customSrc={headerSrc} /><StudentHandledReportNotificationBanner notification={homeNotification} /><header className="page-header"><p className="eyebrow">{space.subjectName}</p><h1>{space.name}</h1><p>{formatTerminologyLabel(space.collectionLabelPlural, "standalone")}</p></header>{groups.length === 0 ? <p className="empty-state">Er zijn momenteel geen zichtbare items.</p> : groups.map((group) => <section className="theme-group" key={group.id}>{group.name ? <h2>{group.name}</h2> : null}<div className="portfolio-cards">{group.portfolios.map((portfolio) => <Link className="portfolio-card color-card" style={cardColorStyle(portfolio.cardColor, DEFAULT_PORTFOLIO_COLOR)} key={portfolio.id} href={`/${encodeURIComponent(space.slug)}/portfolio/${encodeURIComponent(portfolio.id)}`}><span>{formatTerminologyLabel(space.collectionLabelSingular, "standalone")} {portfolio.code}</span><strong>{portfolio.title}</strong></Link>)}</div></section>)}</main>;
}
