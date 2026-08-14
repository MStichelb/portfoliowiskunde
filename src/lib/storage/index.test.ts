import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { resetDatabaseForTests } from "../database";
import { updateLearningSpace } from "../repositories";
import { getStorageProviderWithType } from ".";

const originalEnvironment = { ...process.env };
let temporaryDirectory: string | undefined;

afterEach(async () => {
  resetDatabaseForTests();
  process.env = { ...originalEnvironment };
  if (temporaryDirectory) await removeTemporaryDirectory(temporaryDirectory);
  temporaryDirectory = undefined;
});

describe("LearningSpace provider selection", () => {
  it("selects Local filesystem, OneDrive and Google Drive without combining their configuration", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-provider-selection-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64 = validCredentials();
    resetDatabaseForTests();

    await updateLearningSpace("space-5", { name: "5de jaar", slug: "5", shortLabel: "5", sortOrder: 50, sourceType: "local", localSourcePath: temporaryDirectory });
    await expect(getStorageProviderWithType("space-5")).resolves.toMatchObject({ type: "local", provider: { id: "local-filesystem" } });

    await updateLearningSpace("space-5", { name: "5de jaar", slug: "5", shortLabel: "5", sortOrder: 50, sourceType: "onedrive", oneDriveDriveId: "drive-id", oneDriveFolderId: "folder-id" });
    await expect(getStorageProviderWithType("space-5")).resolves.toMatchObject({ type: "onedrive", provider: { id: "onedrive" } });

    await updateLearningSpace("space-5", { name: "5de jaar", slug: "5", shortLabel: "5", sortOrder: 50, sourceType: "google_drive", googleDriveFolderId: "google-root-id" });
    await expect(getStorageProviderWithType("space-5")).resolves.toMatchObject({ type: "google_drive", provider: { id: "google-drive" } });
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
