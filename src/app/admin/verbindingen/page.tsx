import { ArrowLeft, CheckCircle2, CircleAlert, CircleHelp, Cloud, KeyRound, School } from "lucide-react";
import Link from "next/link";

import { setPublicEmergencyAccessAction } from "@/app/admin/instellingen/actions";
import { EmergencyAccessControl } from "@/app/components/emergency-access-control";
import { OneDriveConnectLink } from "@/app/components/onedrive-connect-link";
import { SmartschoolConnectLink } from "@/app/components/smartschool-connect-link";
import { requireAdminUser } from "@/lib/auth";
import { getGoogleServiceAccountConfigurationProblem } from "@/lib/google-service-account-config";
import { getMicrosoftConfigurationProblem, hasOneDriveAuthorization } from "@/lib/onedrive";
import { getPublicEmergencyAccess } from "@/lib/public-access";
import { getSmartschoolConfig } from "@/lib/smartschool-client";
import { listManagedUsers } from "@/lib/user-management";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<{ onedrive?: string; emergency?: string }> }) {
  const user = await requireAdminUser();
  const isSuperadmin = user.role === "superadmin";
  const [{ onedrive, emergency }, authorized, emergencyAccess, managedUsers] = await Promise.all([
    searchParams,
    hasOneDriveAuthorization(user.id),
    isSuperadmin ? getPublicEmergencyAccess() : Promise.resolve(null),
    isSuperadmin ? listManagedUsers() : Promise.resolve([]),
  ]);
  const configurationProblem = getMicrosoftConfigurationProblem();
  const connected = authorized && !configurationProblem;
  const smartschoolProblem = isSuperadmin ? getSmartschoolConfigurationProblem() : null;
  const smartschoolLinked = isSuperadmin && managedUsers.some((candidate) => candidate.id === user.id && candidate.hasSmartschoolIdentity);
  const smartschoolConnected = !smartschoolProblem && smartschoolLinked;
  const googleProblem = isSuperadmin ? getGoogleServiceAccountConfigurationProblem() : null;

  return <main className="page-shell admin-page personal-connections-page">
    <Link className="secondary-button compact-back-button" href="/admin"><ArrowLeft size={16} aria-hidden />Terug naar beheer</Link>
    <header className="page-header"><p className="eyebrow">Beheer</p><h1>Verbindingen</h1><p>Beheer persoonlijke en applicatiebrede koppelingen op één centrale plaats.</p></header>
    {onedrive === "connected" ? <p className="success-message" role="status">OneDrive is verbonden.</p> : null}
    {onedrive === "authorization-failed" || onedrive === "connection-failed" ? <p className="form-message" role="alert">OneDrive verbinden is niet gelukt. Probeer opnieuw of controleer de Microsoft-configuratie.</p> : null}
    {emergency ? <p className="success-message" role="status">Publieke noodtoegang is {emergency === "enabled" ? "ingeschakeld" : "uitgeschakeld"}.</p> : null}
    <section className="admin-card connections-card" aria-labelledby="onedrive-heading">
      <div className="card-heading"><div><h2 id="onedrive-heading" className="heading-with-icon"><KeyRound size={20} aria-hidden />OneDrive</h2><p>Deze persoonlijke verbinding behoort uitsluitend aan jouw account.</p></div></div>
      <div className="connection-list"><div className="connection-row"><ConnectionStatus ok={connected} label={connected ? "OneDrive geconnecteerd" : "OneDrive niet geconnecteerd"} detail={configurationProblem} /><OneDriveConnectLink authorized={authorized} /></div></div>
    </section>
    {isSuperadmin ? <>
      <section className="admin-card connections-card" aria-labelledby="smartschool-heading">
        <div className="card-heading"><div><h2 id="smartschool-heading" className="heading-with-icon"><School size={20} aria-hidden />Smartschool</h2><p>Applicatiebrede koppeling voor aanmelden en opgeslagen groepsinformatie.</p></div></div>
        <div className="connection-list"><div className="connection-row"><ConnectionStatus ok={smartschoolConnected} label={smartschoolConnected ? "Smartschool verbonden" : "Smartschool niet verbonden"} detail={smartschoolProblem} /><SmartschoolConnectLink /></div></div>
        <div className="connection-subsection" aria-labelledby="emergency-access-heading">
          <div><h3 id="emergency-access-heading">Toegang bij Smartschoolstoring</h3><p>Deze uitzondering geldt alleen voor publieke leerlinginhoud. Beheer blijft altijd aangemeld.</p></div>
          {emergencyAccess ? <EmergencyAccessControl state={emergencyAccess} action={setPublicEmergencyAccessAction} /> : null}
        </div>
      </section>
      <section className="admin-card connections-card" aria-labelledby="google-drive-heading">
        <div className="card-heading"><div><h2 id="google-drive-heading" className="heading-with-icon"><Cloud size={20} aria-hidden />Google Drive</h2><p>Applicatiebrede, read-only mirrorverbinding via het serviceaccount.</p></div><Link className="secondary-button link-button connection-action" href="/admin/help/bronnen"><CircleHelp size={17} aria-hidden />Hulp bij bronnen</Link></div>
        <div className="connection-list"><div className="connection-row"><ConnectionStatus ok={!googleProblem} label={googleProblem ? "Google Drive service niet geconfigureerd" : "Google Drive service geconfigureerd"} detail={googleProblem} /></div></div>
      </section>
    </> : null}
  </main>;
}

function ConnectionStatus({ ok, label, detail }: { ok: boolean; label: string; detail?: string | null }) {
  return <div className={`connection-status ${ok ? "connection-ok" : "connection-problem"}`}>{ok ? <CheckCircle2 size={19} aria-hidden /> : <CircleAlert size={19} aria-hidden />}<div><strong>{label}</strong>{detail ? <small>{detail}</small> : null}</div></div>;
}

function getSmartschoolConfigurationProblem(): string | null {
  try {
    getSmartschoolConfig();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "De Smartschool-configuratie is ongeldig.";
  }
}
