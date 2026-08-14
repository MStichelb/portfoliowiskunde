import { describe, expect, it, vi } from "vitest";

import { OneDriveProvider } from "./onedrive-provider";

describe("OneDriveProvider streaming", () => {
  it("passes a resolved range to the Graph download without buffering", async () => {
    const openGraphFile = vi.fn(async () => new Response(Uint8Array.from({ length: 100 }, (_, index) => index), {
      status: 206,
      headers: { "content-range": "bytes 0-99/500" },
    }));
    const provider = OneDriveProvider.fromSpaceConnection({ driveId: "drive-id", folderId: "root-id" }, {
      graphJson: async <T>() => ({ id: "asset-id", size: 500, eTag: '"etag"', lastModifiedDateTime: "2026-08-14T10:00:00Z", file: { mimeType: "application/pdf" } }) as T,
      openGraphFile,
    });

    const opened = await provider.openFile("asset-id", { range: { kind: "offset", start: 0, end: 99 } });
    expect(openGraphFile).toHaveBeenCalledWith("drive-id", "asset-id", "bytes=0-99", undefined);
    expect(opened).toMatchObject({ contentLength: 100, totalLength: 500, contentRange: "bytes 0-99/500", contentType: "application/pdf" });
    expect(opened.body).toBeInstanceOf(ReadableStream);
  });

  it("uses metadata only for HEAD", async () => {
    const openGraphFile = vi.fn();
    const provider = OneDriveProvider.fromSpaceConnection({ driveId: "drive-id", folderId: "root-id" }, {
      graphJson: async <T>() => ({ id: "asset-id", size: 500, file: { mimeType: "image/png" } }) as T,
      openGraphFile,
    });
    const opened = await provider.openFile("asset-id", { headOnly: true });
    expect(opened.body).toBeNull();
    expect(openGraphFile).not.toHaveBeenCalled();
  });
});
