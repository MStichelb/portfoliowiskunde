import { Link2, SlidersHorizontal } from "lucide-react";
import Link from "next/link";

import type { AvailableSourceProfile } from "@/lib/source-profiles";
import { sourceProfileUsageLabel } from "@/lib/source-profile-usage";

export function SourceProfileCard({ profile, canConfigure }: {
  profile: AvailableSourceProfile;
  canConfigure: boolean;
}) {
  const isShared = profile.usageCount > 1;
  return <section className="settings-card source-profile-card" aria-labelledby="source-profile-heading">
    <div className="source-profile-heading">
      <div>
        <h2 id="source-profile-heading">Bronprofiel</h2>
        <p>Het bronprofiel bepaalt hoe bestanden en mappen in de bron worden geïnterpreteerd.</p>
      </div>
      <Link className="secondary-button link-button source-profile-management-link" href="/admin/bronprofielen">
        <SlidersHorizontal size={16} aria-hidden />Bronprofielen {canConfigure ? "beheren" : "bekijken"}
      </Link>
    </div>
    <div className="source-profile-summary">
      <span>Actief profiel</span>
      <strong>{profile.name}</strong>
      {profile.ownerName ? <small>Eigenaar: {profile.ownerName}</small> : null}
      {isShared ? <>
        <span className="source-profile-shared-status"><Link2 size={15} aria-hidden />Gekoppeld aan {profile.usageCount} leeromgevingen</span>
        <p className="source-profile-shared-usage">Gebruikt in: <strong>{sourceProfileUsageLabel(profile.usages)}</strong></p>
      </> : null}
      {profile.description ? <p>{displayProfileDescription(profile.description)}</p> : null}
    </div>
  </section>;
}

export function displayProfileDescription(description: string): string {
  return description === "Appbreed standaardsjabloon voor de huidige portfolio- en bestandsconventies."
    ? "Gebaseerd op het appbrede standaardsjabloon."
    : description;
}
