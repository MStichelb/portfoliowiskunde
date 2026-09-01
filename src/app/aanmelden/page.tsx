import Link from "next/link";
import { redirect } from "next/navigation";

import { getAuthenticatedUser } from "@/lib/auth";
import { SMARTSCHOOL_UNAVAILABLE_MESSAGE } from "@/lib/smartschool-client";
import { safeLocalReturnTo } from "@/lib/smartschool-oauth-state";

export const dynamic = "force-dynamic";

const errors: Record<string, string> = {
  auth: SMARTSCHOOL_UNAVAILABLE_MESSAGE,
  code: "Smartschool heeft geen geldige aanmeldcode teruggestuurd.",
  config: SMARTSCHOOL_UNAVAILABLE_MESSAGE,
  disabled: "Deze gebruiker is uitgeschakeld. Neem contact op met de beheerder.",
  oauth: "De Smartschool-aanmelding werd geannuleerd of geweigerd.",
  state: "De aanmeldpoging is verlopen of ongeldig. Start opnieuw.",
};

export default async function SmartschoolLoginPage({ searchParams }: { searchParams: Promise<{ error?: string; returnTo?: string }> }) {
  if (await getAuthenticatedUser()) redirect("/");
  const params = await searchParams;
  const message = params.error ? errors[params.error] : null;
  const returnTo = safeLocalReturnTo(params.returnTo);
  const href = `/api/auth/smartschool/login${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`;
  return <main className="page-shell narrow-page">
    <p className="eyebrow">Portfolio Wiskunde</p>
    <h1>Aanmelden</h1>
    <p>Meld je aan met je Smartschoolaccount om je leeromgeving te openen.</p>
    {message ? <p className="error-message" role="alert">{message}</p> : null}
    <a className="primary-button link-button smartschool-login-button" href={href}>Aanmelden met Smartschool</a>
    <p className="login-fallback"><Link href="/admin/login">Hersteltoegang beheer</Link></p>
  </main>;
}
