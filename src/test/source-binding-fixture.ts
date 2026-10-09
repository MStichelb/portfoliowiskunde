import type { IndexedPortfolio } from "@/lib/domain";
import type { StorageIdentityContext } from "@/lib/source-identity";

export const nativeBindingContext: StorageIdentityContext = {
  providerType: "onedrive", providerNamespace: JSON.stringify(["drive", "test-drive", "root", "test-root"]), identityKind: "native",
};

export function sourceBindingFixture(code = "91", identityContext = nativeBindingContext): IndexedPortfolio {
  const relativePath = `Portfolio ${code} Bron`;
  return {
    code, title: "Bron", relativePath, sourceId: `portfolio-folder-${code}`, sourceIdentityContext: identityContext,
    assignmentPdfPath: null, assignmentPdfSourceId: null, hintsDocumentPath: null, hintsDocumentSourceId: null,
    finalSolutionsPdfPath: null, finalSolutionsPdfSourceId: null, resourceAssets: [], warnings: [],
    sections: [{ code: "1.1", title: "Onderdeel", sortOrder: 1, relativePath: `${relativePath}/1.1 Onderdeel`,
      sourceId: `section-folder-${code}`, exercises: [{ code: "1", number: 1, suffix: "", assets: [] }] }],
  };
}
