import { getLearningSpaceBySlug, getPublicPortfolioDocument } from "@/lib/repositories";
import { getStorageProvider } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const { id, kind } = await params;
  if (kind !== "assignment" && kind !== "final-solutions") return new Response("Niet gevonden.", { status: 404 });
  const slug = new URL(request.url).searchParams.get("space");
  const space = slug ? await getLearningSpaceBySlug(slug) : null;
  if (!slug || !space) return new Response("Niet gevonden.", { status: 404 });
  const document = await getPublicPortfolioDocument(id, kind, space.id);
  if (!document) return new Response("Niet gevonden.", { status: 404 });
  try {
    const content = await (await getStorageProvider(document.learningSpaceId)).readFile(document.sourceId);
    return new Response(new Uint8Array(content), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${document.fileName.replaceAll('"', "")}"`,
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch {
    return new Response("Het bronbestand kon niet worden gelezen.", { status: 404 });
  }
}
