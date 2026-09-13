import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  maybeAutoSynchronize: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  canAccessPublicLearningSpace: vi.fn(),
  canManageLearningSpace: vi.fn(),
  getLearningSpaceBySlug: vi.fn(),
  getAdminLearningSpaceBySlug: vi.fn(),
  getPublicAsset: vi.fn(),
  getAdminAsset: vi.fn(),
  getPublicPortfolioDocument: vi.fn(),
  getAdminPortfolioDocument: vi.fn(),
  getPublicResourceAsset: vi.fn(),
  getAdminResourceAsset: vi.fn(),
  getStorageProvider: vi.fn(),
}));

vi.mock("@/lib/auto-sync", () => ({ maybeAutoSynchronize: mocks.maybeAutoSynchronize }));
vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: mocks.getAuthenticatedUser }));
vi.mock("@/lib/authorization", () => ({ canManageLearningSpace: mocks.canManageLearningSpace }));
vi.mock("@/lib/public-access", () => ({ canAccessPublicLearningSpace: mocks.canAccessPublicLearningSpace }));
vi.mock("@/lib/repositories", () => ({
  getLearningSpaceBySlug: mocks.getLearningSpaceBySlug,
  getAdminLearningSpaceBySlug: mocks.getAdminLearningSpaceBySlug,
  getPublicAsset: mocks.getPublicAsset,
  getAdminAsset: mocks.getAdminAsset,
  getPublicPortfolioDocument: mocks.getPublicPortfolioDocument,
  getAdminPortfolioDocument: mocks.getAdminPortfolioDocument,
  getPublicResourceAsset: mocks.getPublicResourceAsset,
  getAdminResourceAsset: mocks.getAdminResourceAsset,
}));
vi.mock("@/lib/storage", () => ({ getStorageProvider: mocks.getStorageProvider }));

import { GET as getAdminPortfolioDocument, HEAD as headAdminPortfolioDocument } from "./admin/portfolio-assets/[id]/[kind]/route";
import { GET as getAdminResource, HEAD as headAdminResource } from "./admin/resource-assets/[id]/route";
import { GET as getAdminSolution } from "./admin/solution-assets/[id]/route";
import { GET as getPublicPortfolioDocument } from "./portfolio-assets/[id]/[kind]/route";
import { GET as getPublicResource, HEAD as headPublicResource } from "./resource-assets/[id]/route";
import { GET as getPublicSolution, HEAD as headPublicSolution } from "./solution-assets/[id]/route";

const space = { id: "space-google", slug: "google" };
const solution = { learningSpaceId: space.id, sourceId: "source-id", fileName: "PF1-Oef1.png", extension: "png" };
const document = { learningSpaceId: space.id, sourceId: "document-id", fileName: "Portfolio 1.pdf", extension: "pdf" };
const resource = { learningSpaceId: space.id, sourceId: "resource-id", fileName: "PF1-Oef1-hint.jpg", extension: "jpg" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.maybeAutoSynchronize.mockResolvedValue(undefined);
  mocks.getAuthenticatedUser.mockResolvedValue({ id: "user", role: "superadmin", status: "active" });
  mocks.canAccessPublicLearningSpace.mockResolvedValue(true);
  mocks.canManageLearningSpace.mockResolvedValue(true);
  mocks.getLearningSpaceBySlug.mockResolvedValue(space);
  mocks.getAdminLearningSpaceBySlug.mockResolvedValue(space);
});

describe("asset route authorization before provider access", () => {
  it("does not open the provider for a hidden student asset", async () => {
    mocks.getPublicAsset.mockResolvedValue(null);
    const response = await getPublicSolution(request(), solutionContext());
    expect(response.status).toBe(404);
    expect(mocks.maybeAutoSynchronize).not.toHaveBeenCalled();
    expect(mocks.getStorageProvider).not.toHaveBeenCalled();
  });

  it.each(["archived", "deleted"])("returns 404 for a public asset in an %s LearningSpace before asset lookup", async () => {
    mocks.getLearningSpaceBySlug.mockResolvedValue(null);
    const response = await getPublicSolution(request(), solutionContext());
    expect(response.status).toBe(404);
    expect(mocks.getPublicAsset).not.toHaveBeenCalled();
    expect(mocks.getStorageProvider).not.toHaveBeenCalled();
  });

  it("does not open the provider when an alternative is hidden by the student toggle", async () => {
    mocks.getPublicAsset.mockResolvedValue(null);
    const response = await getPublicSolution(request(), solutionContext("alternative-id"));
    expect(response.status).toBe(404);
    expect(mocks.maybeAutoSynchronize).not.toHaveBeenCalled();
    expect(mocks.getStorageProvider).not.toHaveBeenCalled();
  });

  it("denies an unauthenticated admin before any asset or provider lookup", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null);
    const response = await getAdminSolution(request(), solutionContext());
    expect(response.status).toBe(401);
    expect(mocks.getAdminAsset).not.toHaveBeenCalled();
    expect(mocks.getStorageProvider).not.toHaveBeenCalled();
  });

  it("does not open the provider for a hidden generic student resource", async () => {
    mocks.getPublicResourceAsset.mockResolvedValue(null);
    const response = await getPublicResource(request(), resourceContext());
    expect(response.status).toBe(404);
    expect(mocks.getPublicResourceAsset).toHaveBeenCalledWith("resource-asset-id", space.id);
    expect(mocks.getStorageProvider).not.toHaveBeenCalled();
  });

  it("denies an unauthenticated generic admin resource before lookup", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null);
    const response = await getAdminResource(request(), resourceContext());
    expect(response.status).toBe(401);
    expect(mocks.getAdminResourceAsset).not.toHaveBeenCalled();
    expect(mocks.getStorageProvider).not.toHaveBeenCalled();
  });

  it("denies a student asset outside the mapped LearningSpace before provider access", async () => {
    mocks.canAccessPublicLearningSpace.mockResolvedValue(false);
    const response = await getPublicSolution(request(), solutionContext());
    expect(response.status).toBe(404);
    expect(mocks.getPublicAsset).not.toHaveBeenCalled();
    expect(mocks.getStorageProvider).not.toHaveBeenCalled();
  });

  it("does not open the provider for a mismatched LearningSpace", async () => {
    mocks.getPublicAsset.mockResolvedValue(null);
    const response = await getPublicSolution(request("other-space"), solutionContext());
    expect(response.status).toBe(404);
    expect(mocks.getPublicAsset).toHaveBeenCalledWith("asset-id", space.id);
    expect(mocks.getStorageProvider).not.toHaveBeenCalled();
  });

  it("allows an unauthenticated public asset only when the central emergency-access check permits it", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null);
    mocks.canAccessPublicLearningSpace.mockResolvedValue(true);
    mocks.getPublicAsset.mockResolvedValue(solution);
    mocks.getStorageProvider.mockResolvedValue(streamingProvider("google-drive"));
    expect((await getPublicSolution(request(), solutionContext())).status).toBe(200);

    mocks.canAccessPublicLearningSpace.mockResolvedValue(false);
    expect((await getPublicSolution(request(), solutionContext())).status).toBe(401);
  });
});

describe("asset route streaming", () => {
  it.each(["google-drive", "onedrive", "local-filesystem"])("streams a visible student asset through %s", async (providerId) => {
    const provider = streamingProvider(providerId);
    mocks.getPublicAsset.mockResolvedValue(solution);
    mocks.getStorageProvider.mockResolvedValue(provider);
    const response = await getPublicSolution(request(), solutionContext());
    expect(response.status).toBe(200);
    expect(mocks.maybeAutoSynchronize).not.toHaveBeenCalled();
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(provider.openFile).toHaveBeenCalledWith("source-id", expect.objectContaining({ headOnly: false }));
  });

  it("returns HEAD metadata without a response body", async () => {
    const provider = streamingProvider("google-drive");
    mocks.getPublicAsset.mockResolvedValue(solution);
    mocks.getStorageProvider.mockResolvedValue(provider);
    const response = await headPublicSolution(request("google", "HEAD"), solutionContext());
    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
    expect(provider.openFile).toHaveBeenCalledWith("source-id", expect.objectContaining({ headOnly: true }));
  });

  it("uses streaming for student and admin portfolio documents", async () => {
    const provider = streamingProvider("google-drive");
    mocks.getPublicPortfolioDocument.mockResolvedValue(document);
    mocks.getAdminPortfolioDocument.mockResolvedValue(document);
    mocks.getStorageProvider.mockResolvedValue(provider);

    expect((await getPublicPortfolioDocument(request(), portfolioContext())).status).toBe(200);
    expect((await getPublicPortfolioDocument(request(), portfolioContext("hints"))).status).toBe(200);
    expect(mocks.getPublicPortfolioDocument).toHaveBeenLastCalledWith("portfolio-id", "hints", space.id);
    expect((await getAdminPortfolioDocument(request(), portfolioContext())).status).toBe(200);
    expect((await headAdminPortfolioDocument(request("google", "HEAD"), portfolioContext())).body).toBeNull();
    expect(provider.openFile).toHaveBeenCalledTimes(4);
  });

  it("serves non-PDF portfolio documents with the MIME type from their extension", async () => {
    const provider = streamingProvider("google-drive");
    const pngDocument = { learningSpaceId: space.id, sourceId: "hint-image", fileName: "dit is een tip.png", extension: "png" };
    mocks.getPublicPortfolioDocument.mockResolvedValue(pngDocument);
    mocks.getAdminPortfolioDocument.mockResolvedValue(pngDocument);
    mocks.getStorageProvider.mockResolvedValue(provider);

    const publicResponse = await getPublicPortfolioDocument(request(), portfolioContext("hints"));
    const adminResponse = await getAdminPortfolioDocument(request(), portfolioContext("hints"));

    expect(publicResponse.status).toBe(200);
    expect(publicResponse.headers.get("content-type")).toBe("image/png");
    expect(adminResponse.status).toBe(200);
    expect(adminResponse.headers.get("content-type")).toBe("image/png");
  });

  it("serves DOCX source resources with the configured Office MIME type", async () => {
    const provider = streamingProvider("onedrive");
    const docxResource = { learningSpaceId: space.id, sourceId: "worksheet-source", fileName: "Werkblad.docx", extension: "docx" };
    mocks.getPublicResourceAsset.mockResolvedValue(docxResource);
    mocks.getStorageProvider.mockResolvedValue(provider);

    const response = await getPublicResource(request(), resourceContext());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  });

  it("streams generic public and admin resources with MIME type and HEAD support", async () => {
    const provider = streamingProvider("onedrive");
    mocks.getPublicResourceAsset.mockResolvedValue(resource);
    mocks.getAdminResourceAsset.mockResolvedValue(resource);
    mocks.getStorageProvider.mockResolvedValue(provider);

    const publicResponse = await getPublicResource(request(), resourceContext());
    const publicHead = await headPublicResource(request("google", "HEAD"), resourceContext());
    const adminResponse = await getAdminResource(request(), resourceContext());
    const adminHead = await headAdminResource(request("google", "HEAD"), resourceContext());

    expect(publicResponse.status).toBe(200);
    expect(publicResponse.headers.get("content-type")).toBe("image/jpeg");
    expect(publicHead.body).toBeNull();
    expect(adminResponse.status).toBe(200);
    expect(adminResponse.headers.get("content-type")).toBe("image/jpeg");
    expect(adminHead.body).toBeNull();
    expect(mocks.getPublicResourceAsset).toHaveBeenCalledWith("resource-asset-id", space.id);
    expect(mocks.getAdminResourceAsset).toHaveBeenCalledWith("resource-asset-id", space.id);
    expect(provider.openFile).toHaveBeenCalledTimes(4);
  });
});

function request(slug = "google", method = "GET") {
  return new Request(`http://localhost/api/file?space=${slug}`, { method });
}

function solutionContext(id = "asset-id") {
  return { params: Promise.resolve({ id }) };
}

function portfolioContext(kind = "assignment") {
  return { params: Promise.resolve({ id: "portfolio-id", kind }) };
}

function resourceContext(id = "resource-asset-id") {
  return { params: Promise.resolve({ id }) };
}

function streamingProvider(id: string) {
  return {
    id,
    list: vi.fn(),
    readFile: vi.fn(),
    openFile: vi.fn(async (_sourceId: string, options?: { headOnly?: boolean }) => ({
      body: options?.headOnly ? null : new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(Uint8Array.from([1, 2, 3])); controller.close(); } }),
      contentLength: 3,
      totalLength: 3,
      acceptRanges: true,
    })),
  };
}
