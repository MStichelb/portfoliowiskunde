import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMyErrorReports: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/student-error-reports", () => ({ getMyErrorReports: mocks.getMyErrorReports }));
vi.mock("@/app/components/page-banner", () => ({ PageBanner: () => <div data-testid="page-banner" /> }));

import MyErrorReportsPage from "./page";

describe("MyErrorReportsPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads the current-user read model without accepting route identity input", async () => {
    mocks.getMyErrorReports.mockResolvedValue([]);

    const markup = renderToStaticMarkup(await MyErrorReportsPage());

    expect(mocks.getMyErrorReports).toHaveBeenCalledWith();
    expect(markup).toContain("Mijn meldingen");
    expect(markup).toContain("Je hebt momenteel geen openstaande of recent afgewerkte meldingen.");
  });

  it("does not expose the student route to a non-student context", async () => {
    mocks.getMyErrorReports.mockResolvedValue(null);

    await expect(MyErrorReportsPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalledWith();
  });
});
