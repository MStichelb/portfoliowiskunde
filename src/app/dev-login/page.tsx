import { notFound } from "next/navigation";

import { PageBanner } from "@/app/components/page-banner";
import { listDevDummyUsers } from "@/lib/dev-users";

import { devLoginAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function DevLoginPage({ searchParams }: { searchParams?: Promise<{ error?: string }> } = {}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const [users, params] = await Promise.all([
    listDevDummyUsers(),
    searchParams ?? Promise.resolve<{ error?: string }>({}),
  ]);

  return <main className="page-shell narrow-page login-page">
    <PageBanner variant="main" />
    <h1>Development-login</h1>
    <p>Kies een lokaal dummyaccount. Deze pagina is alleen beschikbaar in development.</p>
    {params.error === "disabled" ? <p className="error-message" role="alert">Deze gebruiker is uitgeschakeld. Neem contact op met de beheerder.</p> : null}
    <section className="admin-card" aria-labelledby="dummy-accounts-heading">
      <div className="card-heading"><div><h2 id="dummy-accounts-heading">Dummyaccounts</h2><p>De gewone interne applicatiesessie wordt gebruikt; er is geen wachtwoord nodig.</p></div></div>
      {users.length ? <div className="space-list">{users.map((user) => <div className="space-list-item" key={user.id}><div className="space-list-info"><strong>{user.displayName}</strong><span>{user.role === "teacher" ? "Teacher" : "Student"}</span></div><div className="space-list-actions"><form action={devLoginAction}><input type="hidden" name="userId" value={user.id} /><button className="primary-button" type="submit">Inloggen</button></form></div></div>)}</div> : <p className="empty-state">Nog geen dummyaccounts gevonden. Voer eerst <code>pnpm seed:dev-users</code> uit.</p>}
    </section>
  </main>;
}
