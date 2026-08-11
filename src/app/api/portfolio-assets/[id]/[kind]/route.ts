import { getPublicPortfolioDocument } from "@/lib/repositories";
import { getStorageProvider } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const { id, kind } = await params;
  if (kind !== "assignment" && kind !== "final-solutions") return new Response("Niet gevonden.", { status: 404 });
  const document = await getPublicPortfolioDocument(id, kind);
  if (!document) return new Response("Niet gevonden.", { status: 404 });
  try {
    const content = await (await getStorageProvider()).readFile(document.sourceId);
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
