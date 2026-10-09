import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { supportsStableNativeIdentity } from "../source-identity";
import { OneDriveProvider } from "./onedrive-provider";
import { GoogleDriveProvider } from "./google-drive-provider";
import { LocalFilesystemProvider } from "./local-filesystem-provider";
import { indexSource } from "./portfolio-indexer";

describe("provider folder identity through the indexer", () => {
  it("passes OneDrive portfolio/section item IDs with the drive and source-root namespace", async () => {
    const provider = OneDriveProvider.fromSpaceConnection({ driveId: "drive-a", folderId: "root-a" }, {
      graphJson: async <T>(url: string) => ({ value: url.includes("/items/root-a/")
        ? [{ id: "p-id", name: "Portfolio 1 Bron", folder: {} }]
        : url.includes("/items/p-id/") ? [{ id: "s-id", name: "1.1 Onderdeel", folder: {} }] : [] }) as T,
    });
    const [indexed] = await indexSource(provider);
    expect(indexed).toMatchObject({ sourceId: "p-id", sourceIdentityContext: {
      providerType: "onedrive", providerNamespace: JSON.stringify(["drive", "drive-a", "root", "root-a"]), identityKind: "native",
    }, sections: [{ sourceId: "s-id" }] });
    expect(supportsStableNativeIdentity(indexed.sourceIdentityContext!)).toBe(true);
    const anotherDrive = OneDriveProvider.fromSpaceConnection({ driveId: "drive-b", folderId: "root-a" });
    expect(anotherDrive.identityContext.providerNamespace).not.toBe(provider.identityContext.providerNamespace);
  });

  it("passes Google IDs scoped to the reading account and configured root, without upstream mirror identity", async () => {
    const folder = "application/vnd.google-apps.folder";
    const provider = GoogleDriveProvider.fromSpaceConnection({ folderId: "root-a", accountId: "reader-a" }, {
      getAccessToken: async () => "fixture-token",
      fetch: async (input) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("/files/root-a")) return Response.json({ id: "root-a", mimeType: folder });
        const parent = url.searchParams.get("q");
        return Response.json({ files: parent?.startsWith("'root-a'") ? [{ id: "p-id", name: "Portfolio 1 Bron", mimeType: folder }]
          : parent?.startsWith("'p-id'") ? [{ id: "s-id", name: "1.1 Onderdeel", mimeType: folder }] : [] });
      },
    });
    const [indexed] = await indexSource(provider);
    expect(indexed).toMatchObject({ sourceId: "p-id", sourceIdentityContext: {
      providerType: "google_drive", providerNamespace: JSON.stringify(["account", "reader-a", "root", "root-a"]), identityKind: "native",
    }, sections: [{ sourceId: "s-id" }] });
    const otherAccount = GoogleDriveProvider.fromSpaceConnection({ folderId: "root-a", accountId: "reader-b" });
    expect(otherAccount.identityContext!.providerNamespace).not.toBe(provider.identityContext!.providerNamespace);
    expect(GoogleDriveProvider.fromSpaceConnection({ folderId: "root-a" }).identityContext).toBeUndefined();
  });

  it("retains native identity on duplicate-code candidates so publication can reject the complete ambiguous scan", async () => {
    const provider = OneDriveProvider.fromSpaceConnection({ driveId: "drive-a", folderId: "root-a" }, {
      graphJson: async <T>() => ({ value: [
        { id: "first-folder", name: "Portfolio 1 Eerste", folder: {} },
        { id: "second-folder", name: "Portfolio 1 Tweede", folder: {} },
      ] }) as T,
    });
    const indexed = await indexSource(provider);
    expect(indexed).toHaveLength(2);
    expect(indexed.map((portfolio) => portfolio.sourceId)).toEqual(["first-folder", "second-folder"]);
    expect(indexed.every((portfolio) => portfolio.sourceIdentityContext === provider.identityContext)).toBe(true);
    expect(indexed.every((portfolio) => portfolio.warnings.some((warning) => warning.message.includes("Dubbele portfoliocode")))).toBe(true);
  });

  it("passes LocalFS current paths but explicitly denies stable native identity", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "local-folder-identity-"));
    try {
      await mkdir(path.join(root, "Portfolio 1 Bron", "1.1 Onderdeel"), { recursive: true });
      const [indexed] = await indexSource(new LocalFilesystemProvider(root));
      expect(indexed).toMatchObject({ sourceId: "Portfolio 1 Bron", sourceIdentityContext: {
        providerType: "local", identityKind: "path",
      }, sections: [{ sourceId: "Portfolio 1 Bron/1.1 Onderdeel" }] });
      expect(supportsStableNativeIdentity(indexed.sourceIdentityContext!)).toBe(false);
    } finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
  });
});
