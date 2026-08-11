import Link from "next/link";

import { maybeAutoSynchronize } from "@/lib/auto-sync";
import { getStudentPortfolios } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export default async function StudentPage() {
  await maybeAutoSynchronize();
  const portfolios = await getStudentPortfolios();
  return <main className="page-shell student-page"><header className="page-header"><p className="eyebrow">Wiskunde</p><h1>Portfolio&apos;s</h1><p>Uitwerkingen die je leerkracht heeft vrijgegeven.</p></header>
    {portfolios.length === 0 ? <p className="empty-state">Er zijn momenteel geen zichtbare portfolio&apos;s.</p> : <div className="portfolio-cards">{portfolios.map((portfolio) => <Link className="portfolio-card" key={portfolio.id} href={`/portfolio/${encodeURIComponent(portfolio.id)}`}><span>Portfolio {portfolio.code}</span><strong>{portfolio.title}</strong><small>{portfolio.sections.length} onderdelen</small></Link>)}</div>}
  </main>;
}
