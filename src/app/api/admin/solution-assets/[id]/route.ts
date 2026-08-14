import { isAdminAuthenticated } from "@/lib/auth";
import { mimeTypeForExtension, storageAssetResponse } from "@/lib/asset-response";
import { getAdminAsset, getAdminLearningSpaceBySlug } from "@/lib/repositories";
import { getStorageProvider } from "@/lib/storage";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

async function handleAssetRequest(request: Request, { params }: RouteContext) {
  if (!(await isAdminAuthenticated())) return new Response("Niet aangemeld.", { status: 401 });
  const { id } = await params;
  const slug = new URL(request.url).searchParams.get("space");
  const space = slug ? await getAdminLearningSpaceBySlug(slug) : null;
  if (!space) return new Response("Niet gevonden.", { status: 404 });
  const asset = await getAdminAsset(id, space.id);
  if (!asset) return new Response("Niet gevonden.", { status: 404 });
  return storageAssetResponse(request, () => getStorageProvider(asset.learningSpaceId), { sourceId: asset.sourceId, fileName: asset.fileName, contentType: mimeTypeForExtension(asset.extension) });
}

export const GET = handleAssetRequest;
export const HEAD = handleAssetRequest;
