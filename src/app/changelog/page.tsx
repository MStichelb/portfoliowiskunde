import { PageBanner } from "@/app/components/page-banner";
import { ChangelogHistory } from "@/app/components/changelog-history";
import { requireAuthenticatedUser } from "@/lib/auth";
import { getChangelogForRole } from "@/lib/changelog";

export default async function ChangelogPage() {
  const user = await requireAuthenticatedUser();
  return <main className="page-shell student-page changelog-page">
    <PageBanner variant="main" />
    <header className="page-header"><p className="eyebrow">Wijzigingen</p><h1>Changelog</h1><p>Wat is er nieuw of verbeterd in Portfolio Wiskunde?</p></header>
    <ChangelogHistory entries={getChangelogForRole(user.role)} canFilter={user.role !== "student"} />
  </main>;
}
