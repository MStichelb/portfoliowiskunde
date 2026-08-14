import { mkdtemp, open, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { storageAssetResponse } from "../asset-response";
import { LocalFilesystemProvider } from "./local-filesystem-provider";

let temporaryDirectory: string | undefined;

afterEach(async () => {
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = undefined;
});

describe("LocalFilesystemProvider streaming", () => {
  it("opens a file larger than 5 MB as a stream without reading it into a Buffer first", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-large-stream-"));
    const filePath = path.join(temporaryDirectory, "large.pdf");
    const handle = await open(filePath, "w");
    await handle.truncate(6 * 1024 * 1024 + 17);
    await handle.close();

    const opened = await new LocalFilesystemProvider(temporaryDirectory).openFile("large.pdf");
    expect(opened.contentLength).toBeGreaterThan(5 * 1024 * 1024);
    expect(opened.body).toBeInstanceOf(ReadableStream);
    const reader = opened.body!.getReader();
    const firstChunk = await reader.read();
    expect(firstChunk.value!.byteLength).toBeLessThan(opened.contentLength);
    await reader.cancel();
  });

  it("serves GET, HEAD and supported byte ranges with correct headers", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-range-stream-"));
    const bytes = Uint8Array.from({ length: 250 }, (_, index) => index);
    await writeFile(path.join(temporaryDirectory, "sample.pdf"), bytes);
    const provider = new LocalFilesystemProvider(temporaryDirectory);
    const asset = { sourceId: "sample.pdf", fileName: "sample.pdf", contentType: "application/pdf" };

    const full = await storageAssetResponse(new Request("http://localhost/file"), provider, asset);
    expect(full.status).toBe(200);
    expect(full.headers.get("content-type")).toBe("application/pdf");
    expect(full.headers.get("content-length")).toBe("250");
    expect(full.headers.get("accept-ranges")).toBe("bytes");
    expect(new Uint8Array(await full.arrayBuffer())).toEqual(bytes);

    const head = await storageAssetResponse(new Request("http://localhost/file", { method: "HEAD" }), provider, asset);
    expect(head.status).toBe(200);
    expect(head.body).toBeNull();
    expect(head.headers.get("content-length")).toBe("250");

    const bounded = await rangedResponse(provider, asset, "bytes=0-99");
    expect(bounded.status).toBe(206);
    expect(bounded.headers.get("content-range")).toBe("bytes 0-99/250");
    expect(new Uint8Array(await bounded.arrayBuffer())).toEqual(bytes.slice(0, 100));

    const openEnded = await rangedResponse(provider, asset, "bytes=100-");
    expect(openEnded.headers.get("content-length")).toBe("150");
    expect(new Uint8Array(await openEnded.arrayBuffer())).toEqual(bytes.slice(100));

    const suffix = await rangedResponse(provider, asset, "bytes=-25");
    expect(suffix.headers.get("content-range")).toBe("bytes 225-249/250");
    expect(new Uint8Array(await suffix.arrayBuffer())).toEqual(bytes.slice(-25));
  });

  it("returns 416 for malformed and unsatisfiable ranges before streaming", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-invalid-range-"));
    await writeFile(path.join(temporaryDirectory, "sample.png"), Uint8Array.from([1, 2, 3]));
    const provider = new LocalFilesystemProvider(temporaryDirectory);
    const asset = { sourceId: "sample.png", fileName: "sample.png", contentType: "image/png" };

    const malformed = await rangedResponse(provider, asset, "bytes=abc");
    expect(malformed.status).toBe(416);
    const outOfRange = await rangedResponse(provider, asset, "bytes=10-");
    expect(outOfRange.status).toBe(416);
    expect(outOfRange.headers.get("content-range")).toBe("bytes */3");
  });

  it.each([
    ["document.pdf", "application/pdf"],
    ["image.png", "image/png"],
    ["photo.jpg", "image/jpeg"],
  ])("reports the MIME type for %s", async (fileName, contentType) => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-mime-stream-"));
    await writeFile(path.join(temporaryDirectory, fileName), Uint8Array.from([1]));
    const opened = await new LocalFilesystemProvider(temporaryDirectory).openFile(fileName, { headOnly: true });
    expect(opened.contentType).toBe(contentType);
  });
});

function rangedResponse(provider: LocalFilesystemProvider, asset: { sourceId: string; fileName: string; contentType: string }, range: string) {
  return storageAssetResponse(new Request("http://localhost/file", { headers: { Range: range } }), provider, asset);
}
