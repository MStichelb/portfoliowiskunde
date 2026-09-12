import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/bronprofielen",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("tab=editor&owner=olivia"),
}));

import { SourceProfileOwnerFilter, updateSourceProfileOwnerFilterParams } from "./source-profile-owner-filter";

describe("SourceProfileOwnerFilter", () => {
  it("shows all owners in the supplied alphabetical readmodel order", () => {
    const markup = renderToStaticMarkup(<SourceProfileOwnerFilter
      owners={[{ id: "olivia", label: "Olivia" }, { id: "zeno", label: "Zeno" }]}
      selectedOwnerId="olivia"
    />);
    expect(markup).toContain("Gebruiker");
    expect(markup).toContain("Alle gebruikers");
    expect(markup.indexOf("Olivia")).toBeLessThan(markup.indexOf("Zeno"));
    expect(markup).toContain('value="olivia" selected=""');
  });

  it("keeps the related-profile tab and clears modal state when the owner changes", () => {
    const params = updateSourceProfileOwnerFilterParams(new URLSearchParams("tab=owned&profile=p1&error=fout"), "zeno");
    expect(params.get("tab")).toBe("editor");
    expect(params.get("owner")).toBe("zeno");
    expect(params.has("profile")).toBe(false);
    expect(params.has("error")).toBe(false);

    expect(updateSourceProfileOwnerFilterParams(params, "").has("owner")).toBe(false);
  });
});
