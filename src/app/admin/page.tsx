import { FlashToast } from "@/app/components/flash-toast";
import { Link2, Settings, SlidersHorizontal, Users } from "lucide-react";
import Link from "next/link";

import { AdminLearningSpaceOverview } from "@/app/components/admin-learning-space-overview";
import { LearningSpaceCreateModal } from "@/app/components/learning-space-create-modal";
import { PageBanner } from "@/app/components/page-banner";
import { buildAdminLearningSpaceCards, providerLabel } from "@/lib/admin-learning-space-overview";
import { requireAdminUser } from "@/lib/auth";
import { getAccessibleLearningSpaceIds, getManageableLearningSpaceIds } from "@/lib/authorization";
import { getLearningSpaces, type LearningSpace } from "@/lib/repositories";
import { listActiveSubjects } from "@/lib/subjects";
import { getLearningSpaceCreationOptions } from "@/lib/learning-space-creation-options";
import { orderLearningSpacesForUser } from "@/lib/user-learning-space-order";
import { listManagedGroupMappings, listManagedMemberships } from "@/lib/user-management";

import { createLearningSpaceAction } from "./actions";
import { savePersonalLearningSpaceOrderAction } from "./learning-space-order-actions";

export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ smartschool?: string; create?: string; createError?: string; created?: string; error?: string }> }) {
  const user = await requireAdminUser();
  const [allSpaces, activeAccessibleIds, activeManageableIds, memberships, groupMappings, subjects, params, creationOptions] = await Promise.all([
    getLearningSpaces(),
    getAccessibleLearningSpaceIds(user),
    getManageableLearningSpaceIds(user),
    listManagedMemberships(),
    listManagedGroupMappings(),
    listActiveSubjects(),
    searchParams,
    getLearningSpaceCreationOptions(user),
  ]);
  const accessibleIds = new Set(activeAccessibleIds);
  const accessibleSpaces = allSpaces.filter((space) => space.isActive && accessibleIds.has(space.id));
  const orderedAccessibleSpaces = await orderLearningSpacesForUser(user.id, accessibleSpaces);
  const orderedSpaces = [...orderedAccessibleSpaces, ...allSpaces.filter((space) => !accessibleIds.has(space.id))];
  const cards = buildAdminLearningSpaceCards({ spaces: orderedSpaces, activeManageableIds, memberships, groupMappings, user });
  const orderItems = orderedAccessibleSpaces
    .map((space) => ({ id: space.id, shortLabel: space.shortLabel, displayName: space.name }));
  return <main className="page-shell admin-page">
    <PageBanner variant="admin" />
    <header className="admin-header">
      <div><p className="eyebrow">Beheer</p><h1>Leeromgevingen</h1><p>Kies een leeromgeving om portfolio&apos;s binnen deze leeromgeving te beheren.</p></div>
      <div className="admin-actions"><Link className="secondary-button link-button" href="/admin/bronprofielen"><SlidersHorizontal size={17} aria-hidden />Bronprofielen</Link><Link className="secondary-button link-button" href="/admin/verbindingen"><Link2 size={17} aria-hidden />Verbindingen</Link>{user.role === "superadmin" ? <><Link className="secondary-button link-button" href="/admin/gebruikers"><Users size={17} aria-hidden />Gebruikers</Link><Link className="secondary-button link-button" href="/admin/systeem"><Settings size={17} aria-hidden />Systeem</Link></> : null}<LearningSpaceCreateModal action={createLearningSpaceAction} subjects={subjects} options={creationOptions} initialOpen={params.create === "1"} error={createErrorMessage(params.createError)} /></div>
    </header>
    {params.smartschool === "linked" ? <FlashToast type="success" message="Smartschool-account gekoppeld." feedbackKey="smartschool" /> : null}
    {params.smartschool && params.smartschool !== "linked" ? <FlashToast type="error" message="De Smartschool-koppeling is niet gelukt." feedbackKey="smartschool" /> : null}
    {params.created === "1" ? <FlashToast type="success" message="Leeromgeving toegevoegd." feedbackKey="created" /> : null}
    {adminErrorMessage(params.error) ? <FlashToast type="error" message={adminErrorMessage(params.error)!} feedbackKey="error" /> : null}
    <AdminLearningSpaceOverview cards={cards} orderItems={orderItems} orderAction={savePersonalLearningSpaceOrderAction} />
  </main>;
}

function createErrorMessage(error: string | undefined): string | null {
  if (error === "duplicate") return "Deze URL bestaat al. Kies een andere URL.";
  if (error === "invalid") return "Controleer de ingevulde gegevens.";
  if (error === "subject") return "Kies een geldig actief vak.";
  return null;
}

function adminErrorMessage(error: string | undefined): string | null {
  if (error === "archive-before-delete") return "Archiveer de leeromgeving eerst voordat je ze permanent verwijdert.";
  if (error === "delete-failed") return "De leeromgeving kon niet worden verwijderd. Vernieuw de pagina en probeer opnieuw.";
  return null;
}

export function sourceSummary(space: LearningSpace): string {
  const primary = space.primarySource ? providerLabel(space.primarySource.providerType) : providerLabel(space.sourceType);
  const mirror = space.mirrorSource ? ` · Mirror • ${providerLabel(space.mirrorSource.providerType)}` : "";
  return `Bron • ${primary}${mirror}`;
}
