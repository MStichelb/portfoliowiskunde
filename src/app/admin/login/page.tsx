import { redirect } from "next/navigation";

import { PageBanner } from "@/app/components/page-banner";
import { isAdminUserAuthenticated } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await isAdminUserAuthenticated()) redirect("/admin");

  return (
    <main className="page-shell narrow-page login-page">
      <PageBanner variant="main" />
      <h1>Aanmelden</h1>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a className="primary-button link-button smartschool-login-button" href="/api/auth/smartschool/login?returnTo=%2Fadmin">Aanmelden met Smartschool</a>
    </main>
  );
}
