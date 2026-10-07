import { getAuthenticatedUser } from "@/lib/auth";
import { markChangelogSeen } from "@/lib/changelog-read-state";

export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "Niet aangemeld." }, { status: 401 });
  try {
    const lastSeenId = await markChangelogSeen(user);
    return Response.json({ lastSeenId }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Leesstatus kon niet worden opgeslagen." }, { status: 503 });
  }
}
