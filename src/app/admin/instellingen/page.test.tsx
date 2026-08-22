import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OneDriveConnectLink } from "@/app/components/onedrive-connect-link";

describe("OneDriveConnectLink", () => {
  it("keeps OAuth initiation as native browser navigation", () => {
    const markup = renderToStaticMarkup(<OneDriveConnectLink authorized />);

    expect(markup).toMatch(/^<a /);
    expect(markup).toContain('href="/api/onedrive/connect"');
    expect(markup).toContain("OneDrive opnieuw verbinden");
    expect(markup).toContain("lucide-key");
    expect(markup).not.toContain("<form");
  });
});
