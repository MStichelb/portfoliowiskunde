import { ArrowLeft, CheckCircle2, CircleAlert, KeyRound } from "lucide-react";
import Link from "next/link";

import { OneDriveConnectLink } from "@/app/components/onedrive-connect-link";
import { requireAdminUser } from "@/lib/auth";
import { getMicrosoftConfigurationProblem, hasOneDriveAuthorization } from "@/lib/onedrive";

export const dynamic = "force-dynamic";

export default async function PersonalConnectionsPage({ searchParams }: { searchParams: Promise<{ onedrive?: string }> }) {
  const user = await requireAdminUser();
  const [{ onedrive }, authorized] = await Promise.all([searchParams, hasOneDriveAuthorization(user.id)]);
  const configurationProblem = getMicrosoftConfigurationProblem();
  const connected = authorized && !configurationProblem;
  return <main className="page-shell admin-page personal-connections-page">
    <Link className="secondary-button compact-back-button" href="/admin"><ArrowLeft size={16} aria-hidden />Terug naar beheer</Link>
    <header className="page-header"><p className="eyebrow">Persoonlijk beheer</p><h1>Mijn verbindingen</h1><p>Beheer uitsluitend storageverbindingen die aan jouw eigen account toebehoren.</p></header>
    {onedrive === "connected" ? <p className="success-message" role="status">OneDrive is verbonden.</p> : null}
    {onedrive === "authorization-failed" || onedrive === "connection-failed" ? <p className="form-message" role="alert">OneDrive verbinden is niet gelukt. Probeer opnieuw of controleer de Microsoft-configuratie.</p> : null}
    <section className="admin-card connections-card" aria-labelledby="personal-connections-heading">
      <div className="card-heading"><div><h2 id="personal-connections-heading" className="heading-with-icon"><KeyRound size={20} aria-hidden />Persoonlijke verbindingen</h2><p>Tokens worden versleuteld en alleen voor jouw eigen OneDrive-verbinding gebruikt.</p></div></div>
      <div className="connection-list"><div className="connection-row"><div className={`connection-status ${connected ? "connection-ok" : "connection-problem"}`}>{connected ? <CheckCircle2 size={19} aria-hidden /> : <CircleAlert size={19} aria-hidden />}<div><strong>{connected ? "OneDrive geconnecteerd" : "OneDrive niet geconnecteerd"}</strong>{configurationProblem ? <small>{configurationProblem}</small> : null}</div></div><OneDriveConnectLink authorized={authorized} /></div></div>
    </section>
  </main>;
}
