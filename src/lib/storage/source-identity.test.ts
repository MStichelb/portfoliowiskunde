import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { supportsStableNativeIdentity } from "../source-identity";
import { OneDriveProvider } from "./onedrive-provider";
import { GoogleDriveProvider } from "./google-drive-provider";
import { LocalFilesystemProvider } from "./local-filesystem-provider";
import { indexSource } from "./portfolio-indexer";
import type { StorageProvider } from "./provider";

describe("provider folder identity through the indexer", () => {
  it("passes OneDrive portfolio/section item IDs with the drive and source-root namespace", async () => {
    const provider = OneDriveProvider.fromSpaceConnection({ driveId: "drive-a", folderId: "root-a" }, {
      graphJson: async <T>(url: string) => ({ value: url.includes("/items/root-a/")
        ? [{ id: "p-id", name: "Portfolio 1 Bron", folder: {} }]
        : url.includes("/items/p-id/") ? [{ id: "s-id", name: "1.1 Onderdeel", folder: {} }, { id: "document-id", name: "Portfolio 1 Bron.pdf", file: {} }]
          : [{ id: "asset-id", name: "PF1-Oef1.png", file: {} }] }) as T,
    });
    const [indexed] = await indexSource(provider);
    expect(indexed).toMatchObject({ sourceId: "p-id", sourceIdentityContext: {
      providerType: "onedrive", providerNamespace: JSON.stringify(["drive", "drive-a", "root", "root-a"]), identityKind: "native",
    }, sections: [{ sourceId: "s-id" }] });
    expect(supportsStableNativeIdentity(indexed.sourceIdentityContext!)).toBe(true);
    expect(indexed.resourceAssets[0]).toMatchObject({ sourceId: "document-id", sourceIdentityContext: indexed.sourceIdentityContext });
    expect(indexed.sections[0].exercises[0].assets[0]).toMatchObject({ sourceId: "asset-id", sourceIdentityContext: indexed.sourceIdentityContext });
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
          : parent?.startsWith("'p-id'") ? [{ id: "s-id", name: "1.1 Onderdeel", mimeType: folder }, { id: "document-id", name: "Portfolio 1 Bron.pdf", mimeType: "application/pdf" }]
            : [{ id: "asset-id", name: "PF1-Oef1.png", mimeType: "image/png" }] });
      },
    });
    const [indexed] = await indexSource(provider);
    expect(indexed).toMatchObject({ sourceId: "p-id", sourceIdentityContext: {
      providerType: "google_drive", providerNamespace: JSON.stringify(["account", "reader-a", "root", "root-a"]), identityKind: "native",
    }, sections: [{ sourceId: "s-id" }] });
    expect(indexed.resourceAssets[0]).toMatchObject({ sourceId: "document-id", sourceIdentityContext: indexed.sourceIdentityContext });
    expect(indexed.sections[0].exercises[0].assets[0]).toMatchObject({ sourceId: "asset-id", sourceIdentityContext: indexed.sourceIdentityContext });
    const otherAccount = GoogleDriveProvider.fromSpaceConnection({ folderId: "root-a", accountId: "reader-b" });
    expect(otherAccount.identityContext!.providerNamespace).not.toBe(provider.identityContext!.providerNamespace);
    expect(GoogleDriveProvider.fromSpaceConnection({ folderId: "root-a" }).identityContext).toBeUndefined();
  });

  it("rejects duplicate-code native candidates before publishing a partial scan", async () => {
    const provider = OneDriveProvider.fromSpaceConnection({ driveId: "drive-a", folderId: "root-a" }, {
      graphJson: async <T>() => ({ value: [
        { id: "first-folder", name: "Portfolio 1 Eerste", folder: {} },
        { id: "second-folder", name: "Portfolio 1 Tweede", folder: {} },
      ] }) as T,
    });
    await expect(indexSource(provider)).rejects.toThrow("Dubbele portfoliocode 1");
  });

  it("does not turn path fallbacks into native asset identities when item IDs are missing", async () => {
    const base = OneDriveProvider.fromSpaceConnection({ driveId: "drive-a", folderId: "root-a" });
    const provider: StorageProvider = {
      id: base.id, identityContext: base.identityContext,
      async list(relativePath = "") {
        return relativePath === "" ? [{ kind: "directory", name: "Portfolio 1 Bron", relativePath: "Portfolio 1 Bron", sourceId: "folder-id" }]
          : [{ kind: "file", name: "Portfolio 1 Bron.pdf", relativePath: "Portfolio 1 Bron/Portfolio 1 Bron.pdf" },
            { kind: "file", name: "PF1-Oef1.png", relativePath: "Portfolio 1 Bron/PF1-Oef1.png" }];
      },
      async readFile() { return Buffer.alloc(0); },
    };
    const [indexed] = await indexSource(provider);
    expect(indexed.sourceIdentityContext).toEqual(base.identityContext);
    expect(indexed.resourceAssets[0].sourceId).toBe("Portfolio 1 Bron/Portfolio 1 Bron.pdf");
    expect(indexed.resourceAssets[0].sourceIdentityContext).toBeUndefined();
    expect(indexed.exercises![0].assets[0].sourceId).toBe("Portfolio 1 Bron/PF1-Oef1.png");
    expect(indexed.exercises![0].assets[0].sourceIdentityContext).toBeUndefined();
  });

  it("passes LocalFS current paths but explicitly denies stable native identity", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "local-folder-identity-"));
    try {
      await mkdir(path.join(root, "Portfolio 1 Bron", "1.1 Onderdeel"), { recursive: true });
      await writeFile(path.join(root, "Portfolio 1 Bron", "Portfolio 1 Bron.pdf"), "");
      await writeFile(path.join(root, "Portfolio 1 Bron", "1.1 Onderdeel", "PF1-Oef1.png"), "");
      const [indexed] = await indexSource(new LocalFilesystemProvider(root));
      expect(indexed).toMatchObject({ sourceId: "Portfolio 1 Bron", sourceIdentityContext: {
        providerType: "local", identityKind: "path",
      }, sections: [{ sourceId: "Portfolio 1 Bron/1.1 Onderdeel" }] });
      expect(supportsStableNativeIdentity(indexed.sourceIdentityContext!)).toBe(false);
      expect(indexed.resourceAssets[0].sourceIdentityContext).toEqual(indexed.sourceIdentityContext);
      expect(indexed.sections[0].exercises[0].assets[0].sourceIdentityContext).toEqual(indexed.sourceIdentityContext);
    } finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
  });
});
