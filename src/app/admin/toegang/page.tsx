import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LegacyAccessPage() {
  await requireAdmin();

  // Legacy global access management has moved to users and per-space access tabs.
  redirect("/admin/gebruikers");
}
