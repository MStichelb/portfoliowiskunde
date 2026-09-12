import { z } from "zod";

export const BUILT_IN_DEFAULT_SOURCE_PROFILE_ID = "source-profile-standard-portfolio";
export const BUILT_IN_DEFAULT_SOURCE_PROFILE_NAME = "Standaard portfolio";
export const BUILT_IN_DEFAULT_SOURCE_PROFILE_DESCRIPTION = "Ingebouwd profiel voor de huidige portfolio- en bestandsconventies.";
export const BUILT_IN_DEFAULT_SOURCE_PROFILE_TIMESTAMP = "2026-09-10T00:00:00.000Z";
export const INITIAL_SOURCE_PROFILE_TEMPLATE_ID = "source-profile-template-standard-portfolio";
export const INITIAL_SOURCE_PROFILE_TEMPLATE_NAME = "Standaard portfolio";
export const INITIAL_SOURCE_PROFILE_TEMPLATE_DESCRIPTION = "Appbreed standaardsjabloon voor de huidige portfolio- en bestandsconventies.";
export const INITIAL_SOURCE_PROFILE_TEMPLATE_TIMESTAMP = "2026-09-10T00:00:00.000Z";
export const MIGRATED_SOURCE_PROFILE_SNAPSHOT_PREFIX = "source-profile-template-snapshot:";

export const GLOBAL_RESOURCE_LIMIT = 10;
export const GLOBAL_RESOURCE_LABEL_MAX_LENGTH = 40;
export const GLOBAL_RESOURCE_ID_MAX_LENGTH = 48;
export const GLOBAL_RESOURCE_MATCH_VALUE_MAX_LENGTH = 120;

export const globalResourceSemanticRoles = ["assignment", "hint", "final_answer", "worked_solution", "generic"] as const;
export const globalResourceKinds = ["source_file", "external_link"] as const;
export const globalResourceFileExtensions = ["pdf", "png", "jpg", "jpeg", "docx"] as const;
export const globalResourceFileMatchOperators = ["starts_with", "contains", "ends_with"] as const;
export const globalResourceIcons = [
  "file-text",
  "lightbulb",
  "circle-check-big",
  "book-open",
  "link",
  "external-link",
  "youtube",
  "calculator",
  "astroid",
  "land-plot",
  "drafting-compass",
  "brain",
  "flask-conical",
  "key-round",
  "star",
  "shapes",
  "notebook-pen",
  "pencil",
  "paperclip",
  "scroll-text",
  "map",
  "book-search",
  "sparkles",
  "clapperboard",
  "monitor-play",
  "puzzle",
  "file-clock",
  "map-pinned",
] as const;

const globalResourceIdSchema = z.string().trim()
  .min(1, "Resource-id is verplicht.")
  .max(GLOBAL_RESOURCE_ID_MAX_LENGTH, `Resource-id mag maximaal ${GLOBAL_RESOURCE_ID_MAX_LENGTH} tekens bevatten.`)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Resource-id moet een slug met kleine letters, cijfers en koppeltekens zijn.");

const globalResourceLabelSchema = z.string().trim()
  .min(1, "Resourcelabel is verplicht.")
  .max(GLOBAL_RESOURCE_LABEL_MAX_LENGTH, `Resourcelabel mag maximaal ${GLOBAL_RESOURCE_LABEL_MAX_LENGTH} tekens bevatten.`);

export const globalResourceFileRecognitionSchema = z.object({
  target: z.literal("file_name"),
  operator: z.enum(globalResourceFileMatchOperators),
  value: z.string().trim()
    .min(1, "Herkenningswaarde is verplicht.")
    .max(GLOBAL_RESOURCE_MATCH_VALUE_MAX_LENGTH, `Herkenningswaarde mag maximaal ${GLOBAL_RESOURCE_MATCH_VALUE_MAX_LENGTH} tekens bevatten.`),
  caseSensitive: z.boolean().default(false),
  fileExtensions: z.array(z.enum(globalResourceFileExtensions)).min(1, "Kies minstens één bestandstype."),
}).strict().superRefine((value, ctx) => {
  const uniqueExtensions = new Set(value.fileExtensions);
  if (uniqueExtensions.size !== value.fileExtensions.length) {
    ctx.addIssue({ code: "custom", path: ["fileExtensions"], message: "Bestandstypes mogen niet dubbel voorkomen." });
  }
});

const globalResourceBaseShape = {
  id: globalResourceIdSchema,
  label: globalResourceLabelSchema,
  icon: z.enum(globalResourceIcons),
  order: z.number().int().min(0).max(999),
  semanticRole: z.enum(globalResourceSemanticRoles).default("generic"),
};

// Keep schema key order aligned with the canonical stored JSON shape.
// Existing template tests intentionally compare the serialized snapshot, so
// parsing must not move `kind` behind the shared fields.
export const sourceFileGlobalResourceSchema = z.object({
  id: globalResourceBaseShape.id,
  kind: z.literal("source_file"),
  label: globalResourceBaseShape.label,
  icon: globalResourceBaseShape.icon,
  order: globalResourceBaseShape.order,
  semanticRole: globalResourceBaseShape.semanticRole,
  recognition: globalResourceFileRecognitionSchema,
}).strict();

export const externalLinkGlobalResourceSchema = z.object({
  id: globalResourceBaseShape.id,
  kind: z.literal("external_link"),
  label: globalResourceBaseShape.label,
  icon: globalResourceBaseShape.icon,
  order: globalResourceBaseShape.order,
  semanticRole: globalResourceBaseShape.semanticRole,
}).strict();

export const globalResourceConfigSchema = z.discriminatedUnion("kind", [
  sourceFileGlobalResourceSchema,
  externalLinkGlobalResourceSchema,
]);

export const globalResourceListSchema = z.array(globalResourceConfigSchema)
  .max(GLOBAL_RESOURCE_LIMIT, `Een bronprofiel kan maximaal ${GLOBAL_RESOURCE_LIMIT} globale resources bevatten.`)
  .superRefine((resources, ctx) => {
    const ids = new Set<string>();
    const orders = new Set<number>();
    for (const [index, resource] of resources.entries()) {
      if (ids.has(resource.id)) {
        ctx.addIssue({ code: "custom", path: [index, "id"], message: "Resource-id moet uniek zijn binnen het bronprofiel." });
      }
      ids.add(resource.id);
      if (orders.has(resource.order)) {
        ctx.addIssue({ code: "custom", path: [index, "order"], message: "Resourcevolgorde moet uniek zijn binnen het bronprofiel." });
      }
      orders.add(resource.order);
    }
  });

export type GlobalResourceSemanticRole = typeof globalResourceSemanticRoles[number];
export type GlobalResourceKind = typeof globalResourceKinds[number];
export type GlobalResourceFileExtension = typeof globalResourceFileExtensions[number];
export type GlobalResourceFileMatchOperator = typeof globalResourceFileMatchOperators[number];
export type GlobalResourceIcon = typeof globalResourceIcons[number];

export const globalResourceSelectableIcons = [
  "file-text",
  "lightbulb",
  "circle-check-big",
  "book-open",
  "link",
  "external-link",
  "calculator",
  "astroid",
  "land-plot",
  "drafting-compass",
  "brain",
  "flask-conical",
  "key-round",
  "star",
  "shapes",
  "notebook-pen",
  "pencil",
  "paperclip",
  "scroll-text",
  "map",
  "book-search",
  "sparkles",
  "clapperboard",
  "monitor-play",
  "puzzle",
  "file-clock",
  "map-pinned",
] as const satisfies readonly GlobalResourceIcon[];

export type GlobalResourceFileRecognition = z.infer<typeof globalResourceFileRecognitionSchema>;
export type GlobalResourceConfig = z.infer<typeof globalResourceConfigSchema>;
export type SourceFileGlobalResource = z.infer<typeof sourceFileGlobalResourceSchema>;
export type ExternalLinkGlobalResource = z.infer<typeof externalLinkGlobalResourceSchema>;

export const LEGACY_GLOBAL_RESOURCE_CONFIGS: GlobalResourceConfig[] = [
  {
    id: "assignments",
    kind: "source_file",
    label: "Opgaven",
    icon: "file-text",
    order: 10,
    semanticRole: "assignment",
    recognition: {
      target: "file_name",
      operator: "starts_with",
      value: "Portfolio",
      caseSensitive: false,
      fileExtensions: ["pdf"],
    },
  },
  {
    id: "hints",
    kind: "source_file",
    label: "Hints",
    icon: "lightbulb",
    order: 20,
    semanticRole: "hint",
    recognition: {
      target: "file_name",
      operator: "contains",
      value: "Hints",
      caseSensitive: false,
      fileExtensions: ["pdf", "png", "jpg", "jpeg"],
    },
  },
  {
    id: "final-solutions",
    kind: "source_file",
    label: "Eindoplossingen",
    icon: "circle-check-big",
    order: 30,
    semanticRole: "final_answer",
    recognition: {
      target: "file_name",
      operator: "starts_with",
      value: "Eindoplossingen",
      caseSensitive: false,
      fileExtensions: ["pdf"],
    },
  },
];

export const sourceProfileConfigV1Schema = z.object({
  configVersion: z.literal(1),
  scanner: z.object({
    convention: z.literal("legacy_portfolio_v1"),
  }).strict(),
  globalResources: globalResourceListSchema.default(() => LEGACY_GLOBAL_RESOURCE_CONFIGS.map(cloneGlobalResourceConfig)),
}).strict();

export type SourceProfileConfigV1 = z.infer<typeof sourceProfileConfigV1Schema>;
export type SourceProfileConfig = SourceProfileConfigV1;

export const BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG: SourceProfileConfigV1 = {
  configVersion: 1,
  scanner: { convention: "legacy_portfolio_v1" },
  globalResources: LEGACY_GLOBAL_RESOURCE_CONFIGS.map(cloneGlobalResourceConfig),
};

export const BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG_JSON = JSON.stringify(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG);

export function parseSourceProfileConfig(value: unknown): SourceProfileConfig {
  return sourceProfileConfigV1Schema.parse(value);
}

export function parseStoredSourceProfileConfig(configVersion: number, configJson: string): SourceProfileConfig {
  const parsed: unknown = JSON.parse(configJson);
  const config = parseSourceProfileConfig(parsed);
  if (config.configVersion !== configVersion) throw new Error("Bronprofielconfiguratie heeft een ongeldige versie.");
  return config;
}

export function sortGlobalResources(resources: readonly GlobalResourceConfig[]): GlobalResourceConfig[] {
  return [...resources].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
}

function cloneGlobalResourceConfig(resource: GlobalResourceConfig): GlobalResourceConfig {
  if (resource.kind === "external_link") return { ...resource };
  return {
    ...resource,
    recognition: {
      ...resource.recognition,
      fileExtensions: [...resource.recognition.fileExtensions],
    },
  };
}
