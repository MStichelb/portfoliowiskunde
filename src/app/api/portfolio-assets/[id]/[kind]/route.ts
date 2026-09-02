import { storageAssetResponse } from "@/lib/asset-response";
import { getAuthenticatedUser } from "@/lib/auth";
import { canAccessPublicLearningSpace } from "@/lib/public-access";
import { getLearningSpaceBySlug, getPublicPortfolioDocument } from "@/lib/repositories";
import { getStorageProvider } from "@/lib/storage";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; kind: string }> };

async function handleAssetRequest(request: Request, { params }: RouteContext) {
  const { id, kind } = await params;
  if (kind !== "assignment" && kind !== "hints" && kind !== "final-solutions") return new Response("Niet gevonden.", { status: 404 });
  const slug = new URL(request.url).searchParams.get("space");
  const space = slug ? await getLearningSpaceBySlug(slug) : null;
  if (!slug || !space) return new Response("Niet gevonden.", { status: 404 });
  const user = await getAuthenticatedUser();
  if (!await canAccessPublicLearningSpace(user, space.id)) {
    return new Response(user ? "Niet gevonden." : "Niet aangemeld.", { status: user ? 404 : 401 });
  }
  const document = await getPublicPortfolioDocument(id, kind, space.id);
  if (!document) return new Response("Niet gevonden.", { status: 404 });
  return storageAssetResponse(request, () => getStorageProvider(document.learningSpaceId), { sourceId: document.sourceId, fileName: document.fileName, contentType: "application/pdf" });
}

export const GET = handleAssetRequest;
export const HEAD = handleAssetRequest;
