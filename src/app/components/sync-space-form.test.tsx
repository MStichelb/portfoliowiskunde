import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/admin/actions", () => ({
  syncSpaceAction: vi.fn(),
}));

import { SyncSpaceForm } from "./sync-space-form";

describe("SyncSpaceForm", () => {
  it("keeps the existing sync action wiring and shows RefreshCw", () => {
    const markup = renderToStaticMarkup(<SyncSpaceForm learningSpaceId="space-5" />);

    expect(markup).toContain('action="javascript:throw new Error');
    expect(markup).toContain('name="learningSpaceId" value="space-5"');
    expect(markup).toContain("Nu synchroniseren");
    expect(markup).toContain("lucide-refresh-cw");
  });
});
