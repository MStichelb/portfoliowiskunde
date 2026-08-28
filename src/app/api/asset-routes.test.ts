import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  maybeAutoSynchronize: vi.fn(),
  isAdminAuthenticated: vi.fn(),
  getLearningSpaceBySlug: vi.fn(),
  getAdminLearningSpaceBySlug: vi.fn(),
  getPublicAsset: vi.fn(),
  getAdminAsset: vi.fn(),
  getPublicPortfolioDocument: vi.fn(),
  getAdminPortfolioDocument: vi.fn(),
  getStorageProvider: vi.fn(),
}));

vi.mock("@/lib/auto-sync", () => ({ maybeAutoSynchronize: mocks.maybeAutoSynchronize }));
vi.mock("@/lib/auth", () => ({ isAdminAuthenticated: mocks.isAdminAuthenticated }));
vi.mock("@/lib/repositories", () => ({
  getLearningSpaceBySlug: mocks.getLearningSpaceBySlug,
  getAdminLearningSpaceBySlug: mocks.getAdminLearningSpaceBySlug,
  getPublicAsset: mocks.getPublicAsset,
  getAdminAsset: mocks.getAdminAsset,
  getPublicPortfolioDocument: mocks.getPublicPortfolioDocument,
  getAdminPortfolioDocument: mocks.getAdminPortfolioDocument,
}));
vi.mock("@/lib/storage", () => ({ getStorageProvider: mocks.getStorageProvider }));

import { GET as getAdminPortfolioDocument, HEAD as headAdminPortfolioDocument } from "./admin/portfolio-assets/[id]/[kind]/route";
import { GET as getAdminSolution } from "./admin/solution-assets/[id]/route";
import { GET as getPublicPortfolioDocument } from "./portfolio-assets/[id]/[kind]/route";
import { GET as getPublicSolution, HEAD as headPublicSolution } from "./solution-assets/[id]/route";

const space = { id: "space-google", slug: "google" };
const solution = { learningSpaceId: space.id, sourceId: "source-id", fileName: "PF1-Oef1.png", extension: "png" };
const document = { learningSpaceId: space.id, sourceId: "document-id", fileName: "Portfolio 1.pdf" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.maybeAutoSynchronize.mockResolvedValue(undefined);
  mocks.isAdminAuthenticated.mockResolvedValue(true);
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
    mocks.isAdminAuthenticated.mockResolvedValue(false);
    const response = await getAdminSolution(request(), solutionContext());
    expect(response.status).toBe(401);
    expect(mocks.getAdminAsset).not.toHaveBeenCalled();
    expect(mocks.getStorageProvider).not.toHaveBeenCalled();
  });

  it("does not open the provider for a mismatched LearningSpace", async () => {
    mocks.getPublicAsset.mockResolvedValue(null);
    const response = await getPublicSolution(request("other-space"), solutionContext());
    expect(response.status).toBe(404);
    expect(mocks.getPublicAsset).toHaveBeenCalledWith("asset-id", space.id);
    expect(mocks.getStorageProvider).not.toHaveBeenCalled();
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
