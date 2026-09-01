import { getAuthenticatedUser } from "@/lib/auth";
import { storageAssetResponse } from "@/lib/asset-response";
import { canManageLearningSpace } from "@/lib/authorization";
import { getAdminLearningSpaceBySlug, getAdminPortfolioDocument } from "@/lib/repositories";
import { getStorageProvider } from "@/lib/storage";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; kind: string }> };

async function handleAssetRequest(request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) return new Response("Niet aangemeld.", { status: 401 });
  const { id, kind } = await params;
  if (kind !== "assignment" && kind !== "hints" && kind !== "final-solutions") return new Response("Niet gevonden.", { status: 404 });
  const slug = new URL(request.url).searchParams.get("space");
  const space = slug ? await getAdminLearningSpaceBySlug(slug) : null;
  if (!space) return new Response("Niet gevonden.", { status: 404 });
  if (!await canManageLearningSpace(user, space.id)) return new Response("Niet gevonden.", { status: 404 });
  const document = await getAdminPortfolioDocument(id, kind, space.id);
  if (!document) return new Response("Niet gevonden.", { status: 404 });
  return storageAssetResponse(request, () => getStorageProvider(document.learningSpaceId), { sourceId: document.sourceId, fileName: document.fileName, contentType: "application/pdf" });
}

export const GET = handleAssetRequest;
export const HEAD = handleAssetRequest;
