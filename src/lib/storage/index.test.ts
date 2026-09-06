import { generateKeyPairSync } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { resetDatabaseForTests } from "../database";
import { createLearningSpace, getLearningSpace, persistIndex, updateLearningSpace } from "../repositories";
import { getStorageProviderWithType, hasConfiguredActiveSource } from ".";

const originalEnvironment = { ...process.env };
let temporaryDirectory: string | undefined;

afterEach(async () => {
  resetDatabaseForTests();
  process.env = { ...originalEnvironment };
  if (temporaryDirectory) await removeTemporaryDirectory(temporaryDirectory);
  temporaryDirectory = undefined;
});

describe("LearningSpace provider selection", () => {
  it("distinguishes an unconfigured active source from a configured local source", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-source-configuration-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    const space = await createLearningSpace({
      name: "Nieuwe leeromgeving", slug: "nieuw", shortLabel: "Nieuw", sortOrder: 99,
      sourceType: "local", localSourcePath: null,
    });

    await expect(hasConfiguredActiveSource(space.id)).resolves.toBe(false);
    await updateLearningSpace(space.id, {
      name: space.name, slug: space.slug, shortLabel: space.shortLabel, sortOrder: space.sortOrder,
      sourceType: "local", localSourcePath: temporaryDirectory,
    });
    await expect(hasConfiguredActiveSource(space.id)).resolves.toBe(true);
  });

  it("selects Local filesystem, OneDrive and Google Drive without combining their configuration", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-provider-selection-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64 = validCredentials();
    resetDatabaseForTests();

    await updateLearningSpace("space-5", { name: "5de jaar", slug: "5", shortLabel: "5", sortOrder: 50, sourceType: "local", localSourcePath: temporaryDirectory });
    await expect(getStorageProviderWithType("space-5")).resolves.toMatchObject({ type: "local", provider: { id: "local-filesystem" } });

    await updateLearningSpace("space-5", {
      name: "5de jaar", slug: "5", shortLabel: "5", sortOrder: 50, sourceType: "onedrive",
      storageConnectionId: "connection-onedrive-user-legacy-superadmin",
      oneDriveDriveId: "drive-id", oneDriveFolderId: "folder-id",
    });
    await expect(getStorageProviderWithType("space-5")).resolves.toMatchObject({ type: "onedrive", provider: { id: "onedrive" } });

    await updateLearningSpace("space-5", { name: "5de jaar", slug: "5", shortLabel: "5", sortOrder: 50, sourceType: "google_drive", googleDriveFolderId: "google-root-id" });
    await expect(getStorageProviderWithType("space-5")).resolves.toMatchObject({ type: "google_drive", provider: { id: "google-drive" } });
  });

  it("resolves the active source for ordinary synchronization after a role switch", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-active-source-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    const primaryRoot = path.join(temporaryDirectory, "primary");
    const mirrorRoot = path.join(temporaryDirectory, "mirror");
    await Promise.all([mkdir(primaryRoot), mkdir(mirrorRoot)]);
    await Promise.all([writeFile(path.join(primaryRoot, "primary.txt"), "primary"), writeFile(path.join(mirrorRoot, "mirror.txt"), "mirror")]);
    await updateLearningSpace("space-5", {
      name: "5de jaar", slug: "5", shortLabel: "5", sortOrder: 50, sourceType: "local",
      primarySource: { providerType: "local", localSourcePath: primaryRoot },
      mirrorSource: { providerType: "local", localSourcePath: mirrorRoot },
    });
    const space = (await getLearningSpace("space-5"))!;
    await persistIndex([], "local", space.id, { sourceId: space.mirrorSource!.id, activateSourceId: space.mirrorSource!.id });

    const configured = await getStorageProviderWithType(space.id);
    expect(configured.source).toMatchObject({ id: space.mirrorSource!.id, role: "mirror", isActive: true });
    await expect(configured.provider.list("")).resolves.toEqual([expect.objectContaining({ name: "mirror.txt" })]);
  });
});

function validCredentials(): string {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return Buffer.from(JSON.stringify({
    type: "service_account",
    project_id: "portfolio-test",
    client_email: "portfolio-reader@portfolio-test.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  })).toString("base64");
}

async function removeTemporaryDirectory(directory: string): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await rm(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EBUSY") throw error;
      if (attempt === 9) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}
