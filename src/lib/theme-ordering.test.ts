import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getDatabase, resetDatabaseForTests } from "./database";
import { createTheme, deleteTheme, getThemes, moveTheme, updateTheme } from "./repositories";

let temporaryDirectory: string;

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-theme-ordering-"));
  process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
  resetDatabaseForTests();
  await getDatabase();
});

afterEach(async () => {
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  try {
    await rm(temporaryDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "EBUSY") throw error;
  }
});

describe("LearningSpace theme ordering", () => {
  it("places a newly created theme after the current last theme", async () => {
    await createTheme("space-5", "Tweede", 30);
    await createTheme("space-5", "Eerste", 10);

    await createTheme("space-5", "Nieuw");

    expect(await getThemes("space-5")).toEqual([
      expect.objectContaining({ name: "Eerste", sortOrder: 10 }),
      expect.objectContaining({ name: "Tweede", sortOrder: 30 }),
      expect.objectContaining({ name: "Nieuw", sortOrder: 40 }),
    ]);
  });

  it("moves themes up and down and rejects both list boundaries", async () => {
    await createTheme("space-5", "Eerste", 10);
    await createTheme("space-5", "Tweede", 20);
    await createTheme("space-5", "Derde", 30);
    const byName = new Map((await getThemes("space-5")).map((theme) => [theme.name, theme.id]));

    await expect(moveTheme(byName.get("Tweede")!, "space-5", "up")).resolves.toBe(true);
    expect((await getThemes("space-5")).map((theme) => theme.name)).toEqual(["Tweede", "Eerste", "Derde"]);

    await expect(moveTheme(byName.get("Tweede")!, "space-5", "down")).resolves.toBe(true);
    expect((await getThemes("space-5")).map((theme) => theme.name)).toEqual(["Eerste", "Tweede", "Derde"]);

    await expect(moveTheme(byName.get("Eerste")!, "space-5", "up")).resolves.toBe(false);
    await expect(moveTheme(byName.get("Derde")!, "space-5", "down")).resolves.toBe(false);
    expect((await getThemes("space-5")).map((theme) => theme.name)).toEqual(["Eerste", "Tweede", "Derde"]);
  });

  it("never reorders a theme through another LearningSpace scope", async () => {
    await createTheme("space-5", "Vijf A", 10);
    await createTheme("space-5", "Vijf B", 20);
    await createTheme("space-6", "Zes A", 10);
    await createTheme("space-6", "Zes B", 20);
    const fifthTheme = (await getThemes("space-5"))[1];

    await expect(moveTheme(fifthTheme.id, "space-6", "up")).resolves.toBe(false);

    expect((await getThemes("space-5")).map((theme) => theme.name)).toEqual(["Vijf A", "Vijf B"]);
    expect((await getThemes("space-6")).map((theme) => theme.name)).toEqual(["Zes A", "Zes B"]);
  });

  it("keeps rename and delete behavior without exposing order values", async () => {
    await createTheme("space-5", "Oude naam", 10);
    await createTheme("space-5", "Blijft", 20);
    const theme = (await getThemes("space-5"))[0];

    await updateTheme(theme.id, "space-5", "Nieuwe naam");
    expect(await getThemes("space-5")).toEqual([
      expect.objectContaining({ name: "Nieuwe naam", sortOrder: 10 }),
      expect.objectContaining({ name: "Blijft", sortOrder: 20 }),
    ]);

    await deleteTheme(theme.id, "space-5");
    expect((await getThemes("space-5")).map((item) => item.name)).toEqual(["Blijft"]);
  });
});
