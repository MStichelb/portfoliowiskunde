import { redirect } from "next/navigation";

import { getAuthenticationProblem, isAdminUserAuthenticated } from "@/lib/auth";

import { breakGlassLoginAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function BreakGlassPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await isAdminUserAuthenticated()) redirect("/admin");
  const { error } = await searchParams;
  const configurationProblem = getAuthenticationProblem();
  return <main className="page-shell narrow-page breakglass-page">
    <p className="eyebrow">Hersteltoegang</p>
    <h1>Noodtoegang beheer</h1>
    <p>Gebruik deze toegang alleen wanneer aanmelden via Smartschool tijdelijk niet beschikbaar is.</p>
    {error === "config" || configurationProblem ? <p className="error-message" role="alert">De beveiligde hersteltoegang is niet correct geconfigureerd.</p> : null}
    {error === "invalid" ? <p className="error-message" role="alert">Het wachtwoord klopt niet.</p> : null}
    {error === "rate-limited" ? <p className="error-message" role="alert">Te veel pogingen. Probeer over enkele minuten opnieuw.</p> : null}
    {!configurationProblem ? <form className="login-form" action={breakGlassLoginAction}><label htmlFor="password">Herstelwachtwoord</label><input id="password" name="password" type="password" autoComplete="current-password" required /><button className="primary-button" type="submit">Aanmelden</button></form> : null}
  </main>;
}
