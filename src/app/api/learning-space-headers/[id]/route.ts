import { mimeTypeForExtension, storageAssetResponse } from "@/lib/asset-response";
import { getAuthenticatedUser } from "@/lib/auth";
import { getPublicLearningSpaceHeaderAsset } from "@/lib/learning-space-header";
import { canAccessPublicLearningSpace } from "@/lib/public-access";
import { getLearningSpaceBySlug } from "@/lib/repositories";
import { getStorageProviderForSource } from "@/lib/storage";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

async function handleHeaderRequest(request: Request, { params }: RouteContext) {
  const slug = new URL(request.url).searchParams.get("space");
  const space = slug ? await getLearningSpaceBySlug(slug) : null;
  if (!slug || !space) return new Response("Niet gevonden.", { status: 404 });

  const user = await getAuthenticatedUser();
  if (!await canAccessPublicLearningSpace(user, space.id)) {
    return new Response(user ? "Niet gevonden." : "Niet aangemeld.", { status: user ? 404 : 401 });
  }

  const { id } = await params;
  const asset = await getPublicLearningSpaceHeaderAsset(id, space.id);
  if (!asset) return new Response("Niet gevonden.", { status: 404 });

  return storageAssetResponse(
    request,
    () => getStorageProviderForSource(asset.learningSpaceId, asset.learningSpaceSourceId).then(({ provider }) => provider),
    { sourceId: asset.sourceId, fileName: asset.fileName, contentType: mimeTypeForExtension(asset.extension) },
  );
}

export const GET = handleHeaderRequest;
export const HEAD = handleHeaderRequest;
