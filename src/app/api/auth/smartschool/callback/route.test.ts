import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("Smartschool callback placeholder", () => {
  it("faalt gesloten zonder externe communicatie", async () => {
    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Smartschool-aanmelding is nog niet actief." });
  });
});
