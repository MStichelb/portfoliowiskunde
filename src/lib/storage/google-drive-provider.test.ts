import { describe, expect, it, vi } from "vitest";

import { SourceAccessError } from "../source-errors";
import { GoogleDriveProvider } from "./google-drive-provider";

const folderMimeType = "application/vnd.google-apps.folder";

describe("GoogleDriveProvider", () => {
  it("lists paginated files and nested folders below the configured root and ignores trash and shortcuts", async () => {
    const requests: URL[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      requests.push(url);
      if (url.pathname.endsWith("/files/root-id")) return json({ id: "root-id", name: "Mirror", mimeType: folderMimeType, trashed: false });
      if (url.searchParams.get("q") === "'root-id' in parents and trashed = false" && !url.searchParams.has("pageToken")) {
        return json({
          nextPageToken: "next-page",
          files: [
            { id: "portfolio-id", name: "Portfolio 3 - Integralen", mimeType: folderMimeType, modifiedTime: "2026-08-14T10:00:00Z", version: "4" },
            { id: "ignored-trash", name: "oud.pdf", mimeType: "application/pdf", trashed: true },
            { id: "ignored-shortcut", name: "Buiten root", mimeType: "application/vnd.google-apps.shortcut", trashed: false },
          ],
        });
      }
      if (url.searchParams.get("pageToken") === "next-page") {
        return json({ files: [{ id: "assignment-id", name: "Portfolio 3 - Integralen.pdf", mimeType: "application/pdf", md5Checksum: "abc", trashed: false }] });
      }
      if (url.searchParams.get("q") === "'portfolio-id' in parents and trashed = false") {
        return json({ files: [{ id: "solutions-id", name: "Uitwerkingen", mimeType: folderMimeType, trashed: false }] });
      }
      return new Response(null, { status: 404 });
    });
    const provider = createProvider(fetchMock);

    const root = await provider.list();
    expect(root.map((entry) => [entry.name, entry.kind, entry.sourceId])).toEqual([
      ["Portfolio 3 - Integralen", "directory", "portfolio-id"],
      ["Portfolio 3 - Integralen.pdf", "file", "assignment-id"],
    ]);
    expect(root[0].sourceVersion).toBe("4");
    expect(root[1].sourceVersion).toBe("abc");
    await expect(provider.list("Portfolio 3 - Integralen")).resolves.toMatchObject([
      { name: "Uitwerkingen", relativePath: "Portfolio 3 - Integralen/Uitwerkingen", sourceId: "solutions-id", kind: "directory" },
    ]);
    expect(requests.filter((url) => url.pathname.endsWith("/files/root-id"))).toHaveLength(1);
    expect(requests.some((url) => url.searchParams.get("fields")?.includes("nextPageToken"))).toBe(true);
  });

  it("downloads a file by Google ID within the current Buffer contract", async () => {
    const provider = createProvider(vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.searchParams.get("alt") === "media") return new Response(new Uint8Array([1, 2, 3]));
      return json({ id: "root-id", mimeType: folderMimeType, trashed: false });
    }));
    await expect(provider.readFile("asset-id")).resolves.toEqual(Buffer.from([1, 2, 3]));
  });

  it("streams a byte range from Drive upstream with file metadata", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.searchParams.get("alt") === "media") {
        expect(new Headers(init?.headers).get("range")).toBe("bytes=0-99");
        return new Response(Uint8Array.from({ length: 100 }, (_, index) => index), {
          status: 206,
          headers: { "content-range": "bytes 0-99/500" },
        });
      }
      return json({
        id: "asset-id",
        name: "sample.pdf",
        size: "500",
        mimeType: "application/pdf",
        modifiedTime: "2026-08-14T10:00:00Z",
        md5Checksum: "abc123",
        trashed: false,
      });
    });
    const provider = createProvider(fetchMock);

    const opened = await provider.openFile("asset-id", { range: { kind: "offset", start: 0, end: 99 } });
    expect(opened).toMatchObject({
      contentLength: 100,
      totalLength: 500,
      contentType: "application/pdf",
      contentRange: "bytes 0-99/500",
      etag: '"abc123"',
    });
    expect(opened.body).toBeInstanceOf(ReadableStream);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses metadata only for HEAD", async () => {
    const fetchMock = vi.fn(async () => json({ id: "asset-id", size: "3", mimeType: "image/jpeg", trashed: false }));
    const opened = await createProvider(fetchMock).openFile("asset-id", { headOnly: true });
    expect(opened.body).toBeNull();
    expect(opened.contentLength).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("allows an old but complete mirror marker and never exposes the marker to the indexer", async () => {
    const provider = createMarkerProvider(JSON.stringify({
      completedAt: "2001-01-01T00:00:00.0000000Z",
      source: "school-onedrive",
      status: "complete",
    }));

    await expect(provider.assertReadyForIndex()).resolves.toBeUndefined();
    await expect(provider.list()).resolves.toEqual([
      expect.objectContaining({ name: "Portfolio 3 - Integralen", sourceId: "portfolio-id", kind: "directory" }),
    ]);
  });

  it("rejects a missing completion marker", async () => {
    await expect(createMarkerProvider().assertReadyForIndex()).rejects.toThrow("laatst geldige index blijft actief");
  });

  it.each([
    ["an incomplete status", JSON.stringify({ completedAt: "2026-08-14T15:20:00.000Z", status: "syncing" })],
    ["invalid JSON", "{not-json"],
    ["an invalid completedAt", JSON.stringify({ completedAt: "gisteren", status: "complete" })],
  ])("rejects a marker with %s", async (_label, markerBody) => {
    await expect(createMarkerProvider(markerBody).assertReadyForIndex()).rejects.toThrow("laatst geldige index blijft actief");
  });

  it.each([
    [403, "geen toegang"],
    [404, "bestaat niet"],
  ])("turns an inaccessible root with HTTP %i into a controlled source error", async (status, message) => {
    const provider = createProvider(vi.fn(async () => new Response(null, { status })));
    await expect(provider.list()).rejects.toThrow(message);
    await expect(provider.list()).rejects.toBeInstanceOf(SourceAccessError);
  });

  it("retries rate limits and then continues normally", async () => {
    const sleep = vi.fn(async () => undefined);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { "retry-after": "1" } }))
      .mockResolvedValueOnce(json({ id: "root-id", mimeType: folderMimeType, trashed: false }))
      .mockResolvedValueOnce(json({ files: [] }));
    const provider = GoogleDriveProvider.fromSpaceConnection({ folderId: "root-id" }, {
      fetch: fetchMock,
      getAccessToken: async () => "test-token",
      sleep,
      maxRetries: 2,
    });
    await expect(provider.list()).resolves.toEqual([]);
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it("does not resolve arbitrary paths or follow ambiguous duplicate names", async () => {
    const provider = createProvider(vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/files/root-id")) return json({ id: "root-id", mimeType: folderMimeType, trashed: false });
      return json({ files: [
        { id: "one", name: "Portfolio 3", mimeType: folderMimeType },
        { id: "two", name: "portfolio 3", mimeType: folderMimeType },
      ] });
    }));
    await expect(provider.list("niet-ontdekt")).rejects.toThrow("buiten de ingestelde bronmap");
    await expect(provider.list()).rejects.toThrow("dubbele namen");
  });
});

function createProvider(fetchImplementation: typeof fetch | ReturnType<typeof vi.fn>) {
  return GoogleDriveProvider.fromSpaceConnection({ folderId: "root-id" }, {
    fetch: fetchImplementation as typeof fetch,
    getAccessToken: async () => "test-token",
    sleep: async () => undefined,
  });
}

function createMarkerProvider(markerBody?: string) {
  return createProvider(vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/files/root-id")) {
      return json({ id: "root-id", name: "Mirror", mimeType: folderMimeType, trashed: false });
    }
    if (url.searchParams.get("q") === "'root-id' in parents and trashed = false") {
      return json({ files: [
        ...(markerBody === undefined ? [] : [{ id: "marker-id", name: "_mirror-complete.json", mimeType: "application/json", trashed: false }]),
        { id: "portfolio-id", name: "Portfolio 3 - Integralen", mimeType: folderMimeType, trashed: false },
      ] });
    }
    if (url.pathname.endsWith("/files/marker-id") && url.searchParams.get("alt") === "media") {
      return new Response(markerBody, { headers: { "content-type": "application/json" } });
    }
    return new Response(null, { status: 404 });
  }));
}

function json(value: unknown): Response {
  return Response.json(value);
}
