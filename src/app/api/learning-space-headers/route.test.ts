import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  canAccessPublicLearningSpace: vi.fn(),
  getLearningSpaceBySlug: vi.fn(),
  getPublicLearningSpaceHeaderAsset: vi.fn(),
  getStorageProviderForSource: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: mocks.getAuthenticatedUser }));
vi.mock("@/lib/public-access", () => ({ canAccessPublicLearningSpace: mocks.canAccessPublicLearningSpace }));
vi.mock("@/lib/repositories", () => ({ getLearningSpaceBySlug: mocks.getLearningSpaceBySlug }));
vi.mock("@/lib/learning-space-header", () => ({ getPublicLearningSpaceHeaderAsset: mocks.getPublicLearningSpaceHeaderAsset }));
vi.mock("@/lib/storage", () => ({ getStorageProviderForSource: mocks.getStorageProviderForSource }));

import { GET, HEAD } from "./[id]/route";

const space = { id: "space-5", slug: "5wis" };
const asset = {
  id: "learning-space-header-safe-id",
  learningSpaceId: space.id,
  learningSpaceSourceId: "space-5:primary",
  sourceId: "opaque-onedrive-item-id",
  relativePath: "header.png",
  fileName: "header.png",
  extension: "png",
  lastModifiedAt: null,
  sourceVersion: "etag-v1",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthenticatedUser.mockResolvedValue({ id: "student-1", role: "student", status: "active" });
  mocks.canAccessPublicLearningSpace.mockResolvedValue(true);
  mocks.getLearningSpaceBySlug.mockResolvedValue(space);
  mocks.getPublicLearningSpaceHeaderAsset.mockResolvedValue(asset);
});

describe("LearningSpace header asset route", () => {
  it("streams the opaque primary-source asset with the recognized MIME type", async () => {
    const provider = streamingProvider();
    mocks.getStorageProviderForSource.mockResolvedValue({ provider });

    const response = await GET(request(), context());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(mocks.getStorageProviderForSource).toHaveBeenCalledWith(space.id, "space-5:primary");
    expect(provider.openFile).toHaveBeenCalledWith("opaque-onedrive-item-id", expect.objectContaining({ headOnly: false }));
    expect(await response.text()).toBe("header-bytes");
  });

  it("supports HEAD without exposing a provider URL or credential", async () => {
    const provider = streamingProvider();
    mocks.getStorageProviderForSource.mockResolvedValue({ provider });

    const response = await HEAD(request("HEAD"), context());

    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
    expect(response.headers.get("location")).toBeNull();
    expect(JSON.stringify([...response.headers])).not.toContain("access-token");
  });

  it("serves a recognized JPG header as image/jpeg", async () => {
    const provider = streamingProvider();
    mocks.getPublicLearningSpaceHeaderAsset.mockResolvedValue({ ...asset, fileName: "header.jpg", extension: "jpg" });
    mocks.getStorageProviderForSource.mockResolvedValue({ provider });

    const response = await GET(request(), context());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
  });

  it("does not look up or open the asset when LearningSpace access is denied", async () => {
    mocks.canAccessPublicLearningSpace.mockResolvedValue(false);

    const response = await GET(request(), context());

    expect(response.status).toBe(404);
    expect(mocks.getPublicLearningSpaceHeaderAsset).not.toHaveBeenCalled();
    expect(mocks.getStorageProviderForSource).not.toHaveBeenCalled();
  });

  it("returns 401 for an unauthenticated user when public access is not allowed", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null);
    mocks.canAccessPublicLearningSpace.mockResolvedValue(false);

    const response = await GET(request(), context());

    expect(response.status).toBe(401);
    expect(mocks.getPublicLearningSpaceHeaderAsset).not.toHaveBeenCalled();
  });

  it("scopes the stable asset reference to the requested LearningSpace", async () => {
    mocks.getPublicLearningSpaceHeaderAsset.mockResolvedValue(null);

    const response = await GET(request(), context("other-header-id"));

    expect(response.status).toBe(404);
    expect(mocks.getPublicLearningSpaceHeaderAsset).toHaveBeenCalledWith("other-header-id", space.id);
    expect(mocks.getStorageProviderForSource).not.toHaveBeenCalled();
  });
});

function request(method = "GET") {
  return new Request("http://localhost/api/learning-space-headers/learning-space-header-safe-id?space=5wis", { method });
}

function context(id = asset.id) {
  return { params: Promise.resolve({ id }) };
}

function streamingProvider() {
  return {
    id: "onedrive",
    list: vi.fn(),
    readFile: vi.fn(),
    openFile: vi.fn(async (_sourceId: string, options?: { headOnly?: boolean }) => ({
      body: options?.headOnly ? null : new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("header-bytes"));
          controller.close();
        },
      }),
      contentLength: 12,
      totalLength: 12,
      acceptRanges: true,
    })),
  };
}
