import { storageAssetResponse } from "@/lib/asset-response";
import { getLearningSpaceBySlug, getPublicPortfolioDocument } from "@/lib/repositories";
import { getStorageProvider } from "@/lib/storage";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; kind: string }> };

async function handleAssetRequest(request: Request, { params }: RouteContext) {
  const { id, kind } = await params;
  if (kind !== "assignment" && kind !== "final-solutions") return new Response("Niet gevonden.", { status: 404 });
  const slug = new URL(request.url).searchParams.get("space");
  const space = slug ? await getLearningSpaceBySlug(slug) : null;
  if (!slug || !space) return new Response("Niet gevonden.", { status: 404 });
  const document = await getPublicPortfolioDocument(id, kind, space.id);
  if (!document) return new Response("Niet gevonden.", { status: 404 });
  return storageAssetResponse(request, () => getStorageProvider(document.learningSpaceId), { sourceId: document.sourceId, fileName: document.fileName, contentType: "application/pdf" });
}

export const GET = handleAssetRequest;
export const HEAD = handleAssetRequest;
