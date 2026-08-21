import { mimeTypeForExtension, storageAssetResponse } from "@/lib/asset-response";
import { getLearningSpaceBySlug, getPublicAsset } from "@/lib/repositories";
import { getStorageProvider } from "@/lib/storage";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

async function handleAssetRequest(request: Request, { params }: RouteContext) {
  const slug = new URL(request.url).searchParams.get("space");
  const space = slug ? await getLearningSpaceBySlug(slug) : null;
  if (!slug || !space) return new Response("Niet gevonden.", { status: 404 });
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
