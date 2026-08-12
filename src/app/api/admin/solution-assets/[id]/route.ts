import { isAdminAuthenticated } from "@/lib/auth";
import { getAdminAsset, getLearningSpaceBySlug } from "@/lib/repositories";
import { getStorageProvider } from "@/lib/storage";

const mimeTypes: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" };
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return new Response("Niet aangemeld.", { status: 401 });
  const { id } = await params;
  const slug = new URL(request.url).searchParams.get("space");
  const space = slug ? await getLearningSpaceBySlug(slug) : null;
  if (!space) return new Response("Niet gevonden.", { status: 404 });
  const asset = await getAdminAsset(id, space.id);
  if (!asset) return new Response("Niet gevonden.", { status: 404 });
  try { const content = await (await getStorageProvider(asset.learningSpaceId)).readFile(asset.sourceId); return new Response(new Uint8Array(content), { headers: { "Content-Type": mimeTypes[asset.extension] ?? "application/octet-stream", "Content-Disposition": `inline; filename="${asset.fileName.replaceAll('"', "")}"`, "Cache-Control": "private, no-store, max-age=0" } }); } catch { return new Response("Het bronbestand kon niet worden gelezen.", { status: 404 }); }
}
