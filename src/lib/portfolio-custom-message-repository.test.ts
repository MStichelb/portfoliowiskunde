import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getDatabase, resetDatabaseForTests } from "./database";
import { getAdminPortfolio, getStudentPortfolio, setPortfolioCustomMessage } from "./repositories";

let temporaryDirectory: string | undefined;

afterEach(async () => {
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  if (temporaryDirectory) await removeTemporaryDirectory(temporaryDirectory);
  temporaryDirectory = undefined;
});

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

describe("portfolio custom message repository", () => {
  it("leest veilige defaults en bewaart tekst en positie zonder extra querylaag", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-custom-message-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    const database = await getDatabase();
    await database.execute({
      sql: `INSERT INTO portfolios (id, code, portfolio_code, learning_space_id, title, relative_path, visible, is_indexed, indexed_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?)`,
      args: ["portfolio-message", "space-5:M", "M", "space-5", "Berichten", "Portfolio M - Berichten", new Date().toISOString()],
    });

    await expect(getAdminPortfolio("portfolio-message", "space-5")).resolves.toMatchObject({ customText: null, customTextPosition: "above_documents" });
    await expect(getStudentPortfolio("portfolio-message", "space-5")).resolves.toMatchObject({ customText: null, customTextPosition: "above_documents" });

    await setPortfolioCustomMessage("portfolio-message", "Eerste regel\nTweede regel", "below_documents");
    await expect(getAdminPortfolio("portfolio-message", "space-5")).resolves.toMatchObject({ customText: "Eerste regel\nTweede regel", customTextPosition: "below_documents" });
    await expect(getStudentPortfolio("portfolio-message", "space-5")).resolves.toMatchObject({ customText: "Eerste regel\nTweede regel", customTextPosition: "below_documents" });

    await setPortfolioCustomMessage("portfolio-message", null, "above_documents");
    await expect(getAdminPortfolio("portfolio-message", "space-5")).resolves.toMatchObject({ customText: null, customTextPosition: "above_documents" });
  });
});
