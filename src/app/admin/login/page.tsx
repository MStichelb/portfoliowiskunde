import { redirect } from "next/navigation";

import { getAuthenticationProblem, isAdminUserAuthenticated } from "@/lib/auth";

import { loginAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await isAdminUserAuthenticated()) redirect("/admin");
  const { error } = await searchParams;
  const configurationProblem = getAuthenticationProblem();

  return (
    <main className="page-shell narrow-page">
      <p className="eyebrow">Beheer</p>
      <h1>Aanmelden voor beheer</h1>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a className="primary-button link-button smartschool-login-button" href="/api/auth/smartschool/login?returnTo=%2Fadmin">Aanmelden met Smartschool</a>
      <details className="break-glass-login" open={Boolean(error)}>
        <summary>Break-glass admin access</summary>
        <p>Gebruik deze hersteltoegang alleen wanneer Smartschool tijdelijk niet beschikbaar is.</p>
        {error === "config" || configurationProblem ? <p className="error-message">De beveiligde hersteltoegang is niet correct geconfigureerd.</p> : null}
        {error === "invalid" ? <p className="error-message">Het wachtwoord klopt niet.</p> : null}
        {error === "rate-limited" ? <p className="error-message">Te veel pogingen. Probeer over enkele minuten opnieuw.</p> : null}
        {!configurationProblem ? <form className="login-form" action={loginAction}><label htmlFor="password">Herstelwachtwoord</label><input id="password" name="password" type="password" autoComplete="current-password" required /><button className="secondary-button" type="submit">Hersteltoegang gebruiken</button></form> : null}
      </details>
    </main>
  );
}
