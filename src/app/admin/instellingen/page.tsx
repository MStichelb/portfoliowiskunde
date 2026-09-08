import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LegacySettingsPage() {
  await requireAdmin();

  // Legacy global settings now live on the admin overview and per-space settings tabs.
  redirect("/admin");
}
