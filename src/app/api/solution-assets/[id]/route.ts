import { mimeTypeForExtension, storageAssetResponse } from "@/lib/asset-response";
import { getAuthenticatedUser } from "@/lib/auth";
import { canAccessLearningSpace } from "@/lib/authorization";
import { getLearningSpaceBySlug, getPublicAsset } from "@/lib/repositories";
import { getStorageProvider } from "@/lib/storage";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

async function handleAssetRequest(request: Request, { params }: RouteContext) {
  const slug = new URL(request.url).searchParams.get("space");
  const space = slug ? await getLearningSpaceBySlug(slug) : null;
  if (!slug || !space) return new Response("Niet gevonden.", { status: 404 });
  const user = await getAuthenticatedUser();
  if (!user) return new Response("Niet aangemeld.", { status: 401 });
  if (!await canAccessLearningSpace(user, space.id)) return new Response("Niet gevonden.", { status: 404 });
  const { id } = await params;
  const asset = await getPublicAsset(id, space.id);
  if (!asset) return new Response("Niet gevonden.", { status: 404 });

  return storageAssetResponse(request, () => getStorageProvider(asset.learningSpaceId), {
    sourceId: asset.sourceId,
    fileName: asset.fileName,
    contentType: mimeTypeForExtension(asset.extension),
  });
}

export const GET = handleAssetRequest;
export const HEAD = handleAssetRequest;
