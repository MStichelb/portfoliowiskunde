import { redirect } from "next/navigation";

import { getAuthenticationProblem, isAdminAuthenticated } from "@/lib/auth";

import { loginAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await isAdminAuthenticated()) redirect("/admin");
  const { error } = await searchParams;
  const configurationProblem = getAuthenticationProblem();

  return (
    <main className="page-shell narrow-page">
      <p className="eyebrow">Beheer</p>
      <h1>Inloggen</h1>
      {error === "config" || configurationProblem ? <p className="error-message">Stel eerst ADMIN_PASSWORD in .env.local in.</p> : null}
      {error === "invalid" ? <p className="error-message">Het wachtwoord klopt niet.</p> : null}
      {error === "rate-limited" ? <p className="error-message">Te veel pogingen. Probeer over enkele minuten opnieuw.</p> : null}
      {!configurationProblem ? (
        <form className="login-form" action={loginAction}>
          <label htmlFor="password">Wachtwoord</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
          <button className="primary-button" type="submit">Inloggen</button>
        </form>
      ) : null}
    </main>
  );
}
