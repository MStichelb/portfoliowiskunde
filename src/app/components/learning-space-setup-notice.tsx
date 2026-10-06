import Link from "next/link";
import type { LearningSpaceSetup } from "@/lib/learning-space-setup";

export function LearningSpaceSetupNotice({ setup, slug, canConfigure, title = "Maak de configuratie af" }: {
  setup: LearningSpaceSetup;
  slug: string;
  canConfigure: boolean;
  title?: string | null;
}) {
  if (!setup.missingProfile && !setup.missingSource) return null;
  const settings = `/admin/${encodeURIComponent(slug)}/instellingen`;
  return <section className="archived-message learning-space-setup-notice" role="status">
    {title ? <h2>{title}</h2> : null}
    <ul>
      {setup.missingProfile ? <li><span>Bronprofiel ontbreekt</span>{canConfigure ? <Link className="secondary-button link-button" href={`${settings}#source-profile-settings`}>Bronprofiel instellen</Link> : null}</li> : null}
      {setup.missingSource ? <li><span>Bron ontbreekt</span>{canConfigure ? <Link className="secondary-button link-button" href={`${settings}#source-settings-heading`}>Bron instellen</Link> : null}</li> : null}
    </ul>
  </section>;
}
