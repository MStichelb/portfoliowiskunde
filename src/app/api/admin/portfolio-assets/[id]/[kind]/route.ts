import { isAdminAuthenticated } from "@/lib/auth";
import { getAdminPortfolioDocument, getLearningSpaceBySlug } from "@/lib/repositories";
import { getStorageProvider } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; kind: string }> }) {
  if (!(await isAdminAuthenticated())) return new Response("Niet aangemeld.", { status: 401 });
  const { id, kind } = await params;
  if (kind !== "assignment" && kind !== "final-solutions") return new Response("Niet gevonden.", { status: 404 });
  const slug = new URL(request.url).searchParams.get("space");
  const space = slug ? await getLearningSpaceBySlug(slug) : null;
  if (!space) return new Response("Niet gevonden.", { status: 404 });
  const document = await getAdminPortfolioDocument(id, kind, space.id);
  if (!document) return new Response("Niet gevonden.", { status: 404 });
  try {
    const content = await (await getStorageProvider(document.learningSpaceId)).readFile(document.sourceId);
    return new Response(new Uint8Array(content), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${document.fileName.replaceAll('"', "")}"`, "Cache-Control": "private, no-store, max-age=0" } });
  } catch {
    return new Response("Het bronbestand kon niet worden gelezen.", { status: 404 });
  }
}
