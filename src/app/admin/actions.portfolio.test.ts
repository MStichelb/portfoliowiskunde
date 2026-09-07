import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminPortfolioAny: vi.fn(),
  requireAdminUser: vi.fn(),
  requireLearningSpaceManagement: vi.fn(),
  revalidatePath: vi.fn(),
  setPortfolioCardColor: vi.fn(),
  setPortfolioCustomMessage: vi.fn(),
  setPortfolioPublication: vi.fn(),
  setPortfolioTitle: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/auth")>(),
  requireAdminUser: mocks.requireAdminUser,
}));
vi.mock("@/lib/authorization", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/authorization")>(),
  requireLearningSpaceManagement: mocks.requireLearningSpaceManagement,
}));
vi.mock("@/lib/repositories", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/repositories")>(),
  getAdminPortfolioAny: mocks.getAdminPortfolioAny,
  setPortfolioCardColor: mocks.setPortfolioCardColor,
  setPortfolioCustomMessage: mocks.setPortfolioCustomMessage,
  setPortfolioPublication: mocks.setPortfolioPublication,
  setPortfolioTitle: mocks.setPortfolioTitle,
}));

import { savePortfolioAction } from "./actions";

describe("savePortfolioAction custom message", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminUser.mockResolvedValue({ id: "teacher", role: "teacher", status: "active" });
    mocks.getAdminPortfolioAny.mockResolvedValue({ learningSpaceId: "space-5", publishFrom: null, publishUntil: null });
  });

  it("slaat plain multiline tekst en positie mee op via de bestaande settingsflow", async () => {
    await savePortfolioAction(portfolioForm("  Eerste regel\nTweede regel  ", "below_documents"));

    expect(mocks.requireLearningSpaceManagement).toHaveBeenCalledWith(expect.objectContaining({ id: "teacher" }), "space-5");
    expect(mocks.setPortfolioTitle).toHaveBeenCalledWith("portfolio-1", "Goniometrie");
    expect(mocks.setPortfolioCardColor).toHaveBeenCalledWith("portfolio-1", "#AABBCC");
    expect(mocks.setPortfolioPublication).toHaveBeenCalledWith("portfolio-1", "visible", false, null, null);
    expect(mocks.setPortfolioCustomMessage).toHaveBeenCalledWith("portfolio-1", "Eerste regel\nTweede regel", "below_documents");
  });

  it("normaliseert whitespace naar null en weigert een ongeldige positie", async () => {
    await savePortfolioAction(portfolioForm("   ", "above_documents"));
    expect(mocks.setPortfolioCustomMessage).toHaveBeenCalledWith("portfolio-1", null, "above_documents");

    vi.clearAllMocks();
    await expect(savePortfolioAction(portfolioForm("Bericht", "between_documents"))).rejects.toThrow("Ongeldige portfolio-invoer");
    expect(mocks.setPortfolioCustomMessage).not.toHaveBeenCalled();
  });
});

function portfolioForm(customText: string, customTextPosition: string): FormData {
  const formData = new FormData();
  formData.set("id", "portfolio-1");
  formData.set("title", "Goniometrie");
  formData.set("mode", "visible");
  formData.set("publicationMode", "visible");
  formData.set("cardColor", "#aabbcc");
  formData.set("customText", customText);
  formData.set("customTextPosition", customTextPosition);
  return formData;
}
