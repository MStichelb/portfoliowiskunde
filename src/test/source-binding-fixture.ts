import type { IndexedPortfolio } from "@/lib/domain";
import type { StorageIdentityContext } from "@/lib/source-identity";
import type { SourceAssetBinding } from "@/lib/source-identity";
import type { InStatement } from "@/lib/database";

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

export function sourceAssetBindingFixture(code = "91", identityContext = nativeBindingContext): IndexedPortfolio {
  const indexed = sourceBindingFixture(code, identityContext);
  indexed.resourceAssets = [{ resourceId: "assignments", semanticRole: "assignment", sourceIdentityContext: identityContext,
    sourceId: "raw-document-id", relativePath: `${indexed.relativePath}/Portfolio ${code}.pdf`, fileName: `Portfolio ${code}.pdf`,
    extension: "pdf", lastModifiedAt: null, sourceVersion: "v1" }];
  indexed.sections[0].exercises[0].assets = [{ resourceId: "worked-solution", semanticRole: "worked_solution", legacyVariant: "standard",
    sourceIdentityContext: identityContext, sourceId: "raw-solution-id", relativePath: `${indexed.sections[0].relativePath}/PF${code}-Oef1.png`,
    fileName: `PF${code}-Oef1.png`, lastModifiedAt: null, sourceVersion: "v1",
    parsed: { portfolioCode: code, exerciseNumber: 1, exerciseSuffix: "", exerciseCode: "1", variant: "standard", step: 1, extension: "png" } }];
  return indexed;
}

export function sourceAssetBindingInsert(id: string, binding: SourceAssetBinding): InStatement {
  return {
    sql: `INSERT INTO source_asset_bindings (id, learning_space_id, learning_space_source_id, provider_type, provider_namespace,
      identity_kind, native_item_id, resource_scope, resource_id, portfolio_id, exercise_id, resource_asset_id,
      solution_asset_id, variant_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'test', 'test')`,
    args: [id, binding.learningSpaceId, binding.configuredSourceId, binding.providerType, binding.providerNamespace,
      binding.identityKind, binding.nativeItemId, binding.resourceScope, binding.resourceId, binding.portfolioId,
      binding.exerciseId, binding.resourceAssetId, binding.solutionAssetId, binding.variantId],
  };
}
