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

export const sourceProfileConfigV1Schema = z.object({
  configVersion: z.literal(1),
  scanner: z.object({
    convention: z.literal("legacy_portfolio_v1"),
  }).strict(),
}).strict();

export type SourceProfileConfigV1 = z.infer<typeof sourceProfileConfigV1Schema>;
export type SourceProfileConfig = SourceProfileConfigV1;

export const BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG: SourceProfileConfigV1 = {
  configVersion: 1,
  scanner: { convention: "legacy_portfolio_v1" },
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
