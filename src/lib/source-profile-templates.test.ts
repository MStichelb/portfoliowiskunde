import { createClient } from "@libsql/client";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { canManageSourceProfileTemplates, requireSourceProfileTemplateManagement } from "./authorization";
import { getDatabase, resetDatabaseForTests } from "./database";
import { migrations } from "./database-migrations";
import { createUser, type AppUser } from "./identity";
import { createLearningSpace, getAdminLearningSpaceBySlug } from "./repositories";
import { upsertManagedMembership } from "./user-management";
import {
  BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG,
  BUILT_IN_DEFAULT_SOURCE_PROFILE_ID,
  INITIAL_SOURCE_PROFILE_TEMPLATE_ID,
} from "./source-profile-config";
import { getActiveSourceProfileForLearningSpace } from "./source-profiles";
import {
  archiveSourceProfileTemplate,
  cloneSourceProfileTemplateToLearningSpace,
  copySourceProfileTemplateToLearningSpace,
  createSourceProfileTemplate,
  duplicateSourceProfileTemplate,
  ensureInitialSourceProfileTemplate,
  getDefaultSourceProfileTemplate,
  getSourceProfileTemplateConfig,
  listSourceProfileTemplates,
  permanentlyDeleteSourceProfileTemplate,
  restoreSourceProfileTemplate,
  setDefaultSourceProfileTemplate,
  updateSourceProfileTemplateGlobalResources,
  updateSourceProfileTemplateMetadata,
} from "./source-profile-templates";

let temporaryDirectory: string | undefined;
let superadmin: AppUser;
let owner: AppUser;
let editor: AppUser;

beforeEach(async () => {
  await useFreshDatabase("source-profile-templates-");
  superadmin = await createUser({ displayName: "Admin", role: "superadmin" });
  owner = await createUser({ displayName: "Owner", role: "teacher" });
  editor = await createUser({ displayName: "Editor", role: "teacher" });
  await upsertManagedMembership("space-5", owner.id, "owner");
  await upsertManagedMembership("space-5", editor.id, "editor");
});

afterEach(async () => {
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  if (temporaryDirectory) await removeTemporaryDirectory(temporaryDirectory);
  temporaryDirectory = undefined;
});

describe("global source profile templates", () => {
  it("bootstraps one typed default template with a relational singleton reference", async () => {
    const database = await getDatabase();
    const template = await getDefaultSourceProfileTemplate();

    expect(template).toMatchObject({ id: INITIAL_SOURCE_PROFILE_TEMPLATE_ID, name: "Standaard portfolio" });
    expect(getSourceProfileTemplateConfig(template)).toEqual(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG);
    expect((await database.execute("SELECT * FROM source_profile_template_defaults")).rows).toEqual([
      expect.objectContaining({ singleton_id: 1, default_template_id: INITIAL_SOURCE_PROFILE_TEMPLATE_ID }),
    ]);
    await expect(database.execute({
      sql: "INSERT INTO source_profile_template_defaults (singleton_id, default_template_id, updated_at) VALUES (2, ?, ?)",
      args: [INITIAL_SOURCE_PROFILE_TEMPLATE_ID, "2026-09-10T00:00:00.000Z"],
    })).rejects.toThrow();
  });

  it("returns a compact bulk overview with exactly one default", async () => {
    const database = await getDatabase();
    const execute = vi.spyOn(database, "execute");
    const templates = await listSourceProfileTemplates(superadmin);

    expect(execute).toHaveBeenCalledOnce();
    expect(templates).toEqual([expect.objectContaining({
      id: INITIAL_SOURCE_PROFILE_TEMPLATE_ID, name: "Standaard portfolio", configVersion: 1, isDefault: true,
    })]);
    expect(templates[0]).not.toHaveProperty("config");
    expect(templates.filter((template) => template.isDefault)).toHaveLength(1);
  });

  it("sorts the current default first and remaining templates alphabetically", async () => {
    await insertTemplate("zulu-template", "Zulu sjabloon");
    await insertTemplate("alfa-template", "alfa sjabloon");
    await setDefaultSourceProfileTemplate(superadmin, "zulu-template");
    expect((await listSourceProfileTemplates(superadmin)).map((template) => template.name)).toEqual([
      "Zulu sjabloon", "alfa sjabloon", "Standaard portfolio",
    ]);
  });

  it("keeps bootstrap idempotent without overwriting template data or a changed default", async () => {
    const database = await getDatabase();
    await insertTemplate("second-template", "Tweede sjabloon");
    await setDefaultSourceProfileTemplate(superadmin, "second-template");
    await database.execute({ sql: "UPDATE source_profile_templates SET name = 'Aangepast standaard' WHERE id = ?", args: [INITIAL_SOURCE_PROFILE_TEMPLATE_ID] });

    await ensureInitialSourceProfileTemplate();
    await ensureInitialSourceProfileTemplate();

    expect(Number((await database.execute("SELECT COUNT(*) AS count FROM source_profile_templates")).rows[0].count)).toBe(2);
    expect((await getDefaultSourceProfileTemplate()).id).toBe("second-template");
    expect((await database.execute({ sql: "SELECT name FROM source_profile_templates WHERE id = ?", args: [INITIAL_SOURCE_PROFILE_TEMPLATE_ID] })).rows[0].name).toBe("Aangepast standaard");
  });

  it("gives two new LearningSpaces distinct concrete snapshots of the current default", async () => {
    const first = await createLearningSpace(spaceInput("template-first"));
    const second = await createLearningSpace(spaceInput("template-second"));
    const firstProfile = (await getActiveSourceProfileForLearningSpace(first.id))!;
    const secondProfile = (await getActiveSourceProfileForLearningSpace(second.id))!;

    expect(firstProfile).toMatchObject({ type: "custom", managementLearningSpaceId: first.id, config: BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG });
    expect(secondProfile).toMatchObject({ type: "custom", managementLearningSpaceId: second.id, config: BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG });
    expect(firstProfile.id).not.toBe(secondProfile.id);
    expect(firstProfile.id).not.toBe(INITIAL_SOURCE_PROFILE_TEMPLATE_ID);
    expect(secondProfile.id).not.toBe(INITIAL_SOURCE_PROFILE_TEMPLATE_ID);
  });

  it("keeps template and concrete profile snapshots independent in both directions", async () => {
    const database = await getDatabase();
    const space = await createLearningSpace(spaceInput("template-independence"));
    const profile = (await getActiveSourceProfileForLearningSpace(space.id))!;
    const profileConfigBefore = (await database.execute({ sql: "SELECT config_json FROM source_profiles WHERE id = ?", args: [profile.id] })).rows[0].config_json;

    await database.execute({
      sql: "UPDATE source_profile_templates SET name = 'Nieuw template', config_json = ?, updated_at = ? WHERE id = ?",
      args: [JSON.stringify(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG, null, 2), "2026-09-11T00:00:00.000Z", INITIAL_SOURCE_PROFILE_TEMPLATE_ID],
    });
    expect(await getActiveSourceProfileForLearningSpace(space.id)).toMatchObject({ name: "Standaard portfolio", config: BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG });
    expect((await database.execute({ sql: "SELECT config_json FROM source_profiles WHERE id = ?", args: [profile.id] })).rows[0].config_json).toBe(profileConfigBefore);

    await database.execute({ sql: "UPDATE source_profiles SET name = 'Eigen concrete naam' WHERE id = ?", args: [profile.id] });
    expect((await getDefaultSourceProfileTemplate()).name).toBe("Nieuw template");

    const futureSpace = await createLearningSpace(spaceInput("template-after-change"));
    expect((await getActiveSourceProfileForLearningSpace(futureSpace.id))?.name).toBe("Nieuw template");
    expect((await getActiveSourceProfileForLearningSpace(space.id))?.name).toBe("Eigen concrete naam");
  });

  it("clones a server-resolved template as a fresh active concrete profile", async () => {
    const before = (await getActiveSourceProfileForLearningSpace("space-5"))!;
    const template = await getDefaultSourceProfileTemplate();
    const clone = await cloneSourceProfileTemplateToLearningSpace({ ...template, name: "Tweede profiel" }, "space-5", owner.id);

    expect(clone).toMatchObject({ type: "custom", managementLearningSpaceId: "space-5", config: BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG });
    expect(clone.id).not.toBe(before.id);
    expect((await getActiveSourceProfileForLearningSpace("space-5"))?.id).toBe(clone.id);
  });

  it("provides a superadmin-only foundation for changing the default reference", async () => {
    await insertTemplate("second-template", "Tweede sjabloon");

    expect(canManageSourceProfileTemplates(superadmin)).toBe(true);
    expect(canManageSourceProfileTemplates(owner)).toBe(false);
    expect(canManageSourceProfileTemplates(editor)).toBe(false);
    expect(() => requireSourceProfileTemplateManagement(owner)).toThrow("Alleen een hoofdbeheerder");
    await expect(setDefaultSourceProfileTemplate(owner, "second-template")).rejects.toThrow("Alleen een hoofdbeheerder");
    await expect(setDefaultSourceProfileTemplate(editor, "second-template")).rejects.toThrow("Alleen een hoofdbeheerder");

    await setDefaultSourceProfileTemplate(superadmin, "second-template");
    expect((await getDefaultSourceProfileTemplate()).id).toBe("second-template");
  });

  it("creates, renames and duplicates independent validated template snapshots", async () => {
    const database = await getDatabase();
    const created = await createSourceProfileTemplate(superadmin, {
      name: "  Eigen sjabloon  ", description: "  Korte beschrijving  ", sourceTemplateId: INITIAL_SOURCE_PROFILE_TEMPLATE_ID,
    });
    expect(created).toMatchObject({ name: "Eigen sjabloon", description: "Korte beschrijving", config: BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG });
    expect(created.id).not.toBe(INITIAL_SOURCE_PROFILE_TEMPLATE_ID);
    expect((await listSourceProfileTemplates(superadmin)).find((template) => template.id === created.id)?.isDefault).toBe(false);

    await database.execute({
      sql: "UPDATE source_profile_templates SET config_json = ? WHERE id = ?",
      args: [JSON.stringify(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG, null, 2), INITIAL_SOURCE_PROFILE_TEMPLATE_ID],
    });
    const createdJson = (await database.execute({ sql: "SELECT config_json FROM source_profile_templates WHERE id = ?", args: [created.id] })).rows[0].config_json;
    expect(createdJson).toBe(JSON.stringify(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG));

    await updateSourceProfileTemplateMetadata(superadmin, created.id, { name: "  Hernoemd sjabloon ", description: " " });
    expect((await listSourceProfileTemplates(superadmin)).find((template) => template.id === created.id)).toMatchObject({ name: "Hernoemd sjabloon", description: null });

    const duplicate = await duplicateSourceProfileTemplate(superadmin, created.id);
    expect(duplicate).toMatchObject({ name: "Kopie van Hernoemd sjabloon", config: BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG });
    expect(duplicate.id).not.toBe(created.id);
    await database.execute({ sql: "UPDATE source_profile_templates SET config_json = '{}' WHERE id = ?", args: [created.id] });
    expect((await database.execute({ sql: "SELECT config_json FROM source_profile_templates WHERE id = ?", args: [duplicate.id] })).rows[0].config_json).toBe(JSON.stringify(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG));
  });

  it("enforces trimmed case-insensitive global names and the 80 character limit", async () => {
    const created = await createSourceProfileTemplate(superadmin, { name: "Eigen sjabloon", sourceTemplateId: INITIAL_SOURCE_PROFILE_TEMPLATE_ID });
    await expect(createSourceProfileTemplate(superadmin, { name: " eigen SJABLOON ", sourceTemplateId: INITIAL_SOURCE_PROFILE_TEMPLATE_ID })).rejects.toThrow("bestaat al");
    await expect(updateSourceProfileTemplateMetadata(superadmin, created.id, { name: " standaard PORTFOLIO " })).rejects.toThrow("bestaat al");
    await expect(updateSourceProfileTemplateMetadata(superadmin, created.id, { name: " " })).rejects.toThrow("Geef het bronprofielsjabloon");
    await expect(updateSourceProfileTemplateMetadata(superadmin, created.id, { name: "a".repeat(81) })).rejects.toThrow("maximaal 80");
  });

  it("archives non-default templates and excludes them from normal lists and copy flows", async () => {
    const template = await createSourceProfileTemplate(superadmin, { name: "Oud sjabloon", sourceTemplateId: INITIAL_SOURCE_PROFILE_TEMPLATE_ID });
    await archiveSourceProfileTemplate(superadmin, template.id);

    expect((await listSourceProfileTemplates(superadmin)).map((item) => item.id)).not.toContain(template.id);
    expect((await listSourceProfileTemplates(owner, { archivedOnly: true })).map((item) => item.id)).not.toContain(template.id);
    const archivedTemplates = await listSourceProfileTemplates(superadmin, { archivedOnly: true });
    expect(archivedTemplates.map((item) => item.id)).toEqual([template.id]);
    expect(archivedTemplates.find((item) => item.id === template.id)).toMatchObject({
      isArchived: true, archivedAt: expect.any(String), canArchive: false, isDefault: false,
    });
    await expect(copySourceProfileTemplateToLearningSpace(owner, template.id, "space-5")).rejects.toThrow("niet gevonden");
    await expect(duplicateSourceProfileTemplate(superadmin, template.id)).rejects.toThrow("niet gevonden");
    await expect(setDefaultSourceProfileTemplate(superadmin, template.id)).rejects.toThrow("niet gevonden");
  });

  it("restores without becoming default, checks active name conflicts and deletes only from archive", async () => {
    const database = await getDatabase();
    const template = await createSourceProfileTemplate(superadmin, { name: "Herstelbaar sjabloon", sourceTemplateId: INITIAL_SOURCE_PROFILE_TEMPLATE_ID });
    await expect(permanentlyDeleteSourceProfileTemplate(superadmin, template.id)).rejects.toThrow("Alleen een gearchiveerd");
    await archiveSourceProfileTemplate(superadmin, template.id);
    await restoreSourceProfileTemplate(superadmin, template.id);
    expect((await getDefaultSourceProfileTemplate()).id).toBe(INITIAL_SOURCE_PROFILE_TEMPLATE_ID);
    expect((await listSourceProfileTemplates(superadmin)).find((item) => item.id === template.id)).toMatchObject({ isArchived: false, isDefault: false });

    await archiveSourceProfileTemplate(superadmin, template.id);
    await database.execute(`INSERT INTO source_profile_templates
      (id, name, description, config_version, config_json, created_at, updated_at)
      SELECT 'legacy-conflict', 'Herstelbaar sjabloon', description, config_version, config_json, created_at, updated_at
      FROM source_profile_templates WHERE id = '${INITIAL_SOURCE_PROFILE_TEMPLATE_ID}'`);
    await expect(restoreSourceProfileTemplate(superadmin, template.id)).rejects.toThrow("bestaat al");
    await permanentlyDeleteSourceProfileTemplate(superadmin, template.id);
    expect((await database.execute({ sql: "SELECT 1 FROM source_profile_templates WHERE id = ?", args: [template.id] })).rows).toHaveLength(0);
  });

  it("reserves archived template names until permanent deletion", async () => {
    const template = await createSourceProfileTemplate(superadmin, { name: " Gereserveerd sjabloon ", sourceTemplateId: INITIAL_SOURCE_PROFILE_TEMPLATE_ID });
    await archiveSourceProfileTemplate(superadmin, template.id);
    await expect(createSourceProfileTemplate(superadmin, { name: "GERESERVEERD SJABLOON", sourceTemplateId: INITIAL_SOURCE_PROFILE_TEMPLATE_ID })).rejects.toThrow("bestaat al");
    await expect(updateSourceProfileTemplateMetadata(superadmin, INITIAL_SOURCE_PROFILE_TEMPLATE_ID, { name: " gereserveerd sjabloon " })).rejects.toThrow("bestaat al");
    await permanentlyDeleteSourceProfileTemplate(superadmin, template.id);
    await expect(createSourceProfileTemplate(superadmin, { name: "gereserveerd sjabloon", sourceTemplateId: INITIAL_SOURCE_PROFILE_TEMPLATE_ID })).resolves.toMatchObject({ name: "gereserveerd sjabloon" });
  });

  it("protects the default and template lifecycle authorization while preserving concrete snapshots", async () => {
    const database = await getDatabase();
    await expect(archiveSourceProfileTemplate(superadmin, INITIAL_SOURCE_PROFILE_TEMPLATE_ID)).rejects.toThrow("standaardsjabloon");
    await expect(permanentlyDeleteSourceProfileTemplate(superadmin, INITIAL_SOURCE_PROFILE_TEMPLATE_ID)).rejects.toThrow();
    await expect(archiveSourceProfileTemplate(owner, INITIAL_SOURCE_PROFILE_TEMPLATE_ID)).rejects.toThrow("Alleen een hoofdbeheerder");
    await expect(restoreSourceProfileTemplate(editor, INITIAL_SOURCE_PROFILE_TEMPLATE_ID)).rejects.toThrow("Alleen een hoofdbeheerder");
    await expect(permanentlyDeleteSourceProfileTemplate(owner, INITIAL_SOURCE_PROFILE_TEMPLATE_ID)).rejects.toThrow("Alleen een hoofdbeheerder");

    const template = await createSourceProfileTemplate(superadmin, { name: "Snapshotbasis", sourceTemplateId: INITIAL_SOURCE_PROFILE_TEMPLATE_ID });
    const profile = await copySourceProfileTemplateToLearningSpace(owner, template.id, "space-5");
    const snapshotBefore = (await database.execute({ sql: "SELECT config_json FROM source_profiles WHERE id = ?", args: [profile.id] })).rows[0].config_json;
    await archiveSourceProfileTemplate(superadmin, template.id);
    await permanentlyDeleteSourceProfileTemplate(superadmin, template.id);
    expect((await database.execute({ sql: "SELECT config_json FROM source_profiles WHERE id = ?", args: [profile.id] })).rows[0].config_json).toBe(snapshotBefore);
    expect((await getActiveSourceProfileForLearningSpace("space-5"))?.id).toBe(profile.id);
  });

  it("guards every template mutation against teacher role escalation and foreign ids", async () => {
    const mutations = [
      () => createSourceProfileTemplate(owner, { name: "Verboden" }),
      () => updateSourceProfileTemplateMetadata(editor, INITIAL_SOURCE_PROFILE_TEMPLATE_ID, { name: "Verboden" }),
      () => duplicateSourceProfileTemplate(owner, INITIAL_SOURCE_PROFILE_TEMPLATE_ID),
      () => setDefaultSourceProfileTemplate(editor, INITIAL_SOURCE_PROFILE_TEMPLATE_ID),
      () => archiveSourceProfileTemplate(owner, INITIAL_SOURCE_PROFILE_TEMPLATE_ID),
      () => restoreSourceProfileTemplate(editor, INITIAL_SOURCE_PROFILE_TEMPLATE_ID),
      () => permanentlyDeleteSourceProfileTemplate(owner, INITIAL_SOURCE_PROFILE_TEMPLATE_ID),
    ];
    for (const mutation of mutations) await expect(mutation()).rejects.toThrow("Alleen een hoofdbeheerder");
    await expect(listSourceProfileTemplates(owner)).resolves.toHaveLength(1);
    await expect(listSourceProfileTemplates(editor)).resolves.toHaveLength(1);
    await expect(createSourceProfileTemplate({ ...superadmin, status: "disabled" }, { name: "Uitgeschakeld" })).rejects.toThrow("Alleen een hoofdbeheerder");
    await expect(updateSourceProfileTemplateMetadata(superadmin, "foreign-template", { name: "Verboden" })).rejects.toThrow("niet gevonden");
    await expect(duplicateSourceProfileTemplate(superadmin, "foreign-template")).rejects.toThrow("niet gevonden");
    expect((await listSourceProfileTemplates(superadmin))).toHaveLength(1);
  });

  it("uses templates as server-resolved independent snapshots with role-safe activation", async () => {
    const database = await getDatabase();
    const original = (await getActiveSourceProfileForLearningSpace("space-5"))!;
    const template = await getDefaultSourceProfileTemplate();

    await expect(copySourceProfileTemplateToLearningSpace(editor, template.id, "space-5")).rejects.toThrow("Alleen een eigenaar");
    expect((await getActiveSourceProfileForLearningSpace("space-5"))?.id).toBe(original.id);
    await expect(copySourceProfileTemplateToLearningSpace(owner, "foreign-template", "space-5")).rejects.toThrow("niet gevonden");

    const ownerCopy = await copySourceProfileTemplateToLearningSpace(owner, template.id, "space-5");
    expect(ownerCopy).toMatchObject({ name: "Standaard portfolio", ownerUserId: owner.id });
    expect((await getActiveSourceProfileForLearningSpace("space-5"))?.id).toBe(ownerCopy.id);
    await database.execute({ sql: "UPDATE source_profile_templates SET config_json = '{}' WHERE id = ?", args: [template.id] });
    expect((await database.execute({ sql: "SELECT config_json FROM source_profiles WHERE id = ?", args: [ownerCopy.id] })).rows[0].config_json).toBe(JSON.stringify(template.config));
  });

  it("changes only future LearningSpace snapshots when the default switches", async () => {
    const database = await getDatabase();
    const existingSpace = await createLearningSpace(spaceInput("before-default-switch"));
    const existingProfile = (await getActiveSourceProfileForLearningSpace(existingSpace.id))!;
    const existingRowBefore = (await database.execute({ sql: "SELECT * FROM source_profiles WHERE id = ?", args: [existingProfile.id] })).rows[0];
    const second = await createSourceProfileTemplate(superadmin, { name: "Nieuw standaard", sourceTemplateId: INITIAL_SOURCE_PROFILE_TEMPLATE_ID });

    await setDefaultSourceProfileTemplate(superadmin, second.id);

    const existingRowAfter = (await database.execute({ sql: "SELECT * FROM source_profiles WHERE id = ?", args: [existingProfile.id] })).rows[0];
    expect(existingRowAfter).toEqual(existingRowBefore);
    expect((await getActiveSourceProfileForLearningSpace(existingSpace.id))?.name).toBe("Standaard portfolio");
    expect((await listSourceProfileTemplates(superadmin)).filter((template) => template.isDefault)).toEqual([
      expect.objectContaining({ id: second.id }),
    ]);

    const futureSpace = await createLearningSpace(spaceInput("after-default-switch"));
    const futureProfile = (await getActiveSourceProfileForLearningSpace(futureSpace.id))!;
    expect(futureProfile).toMatchObject({ name: "Nieuw standaard", type: "custom", managementLearningSpaceId: futureSpace.id, config: second.config });
    expect(futureProfile.id).not.toBe(second.id);
    expect(Number((await database.execute("SELECT COUNT(*) AS count FROM sync_runs WHERE learning_space_id IN ('space-before-default-switch', 'space-after-default-switch')")).rows[0].count)).toBe(0);
  });

  it("rejects malformed and unknown template configs for clone, duplicate and default selection", async () => {
    const database = await getDatabase();
    await insertTemplate("malformed-template", "Malformed");
    await database.execute("UPDATE source_profile_templates SET config_json = '{}' WHERE id = 'malformed-template'");
    await expect(createSourceProfileTemplate(superadmin, { name: "Van malformed", sourceTemplateId: "malformed-template" })).rejects.toThrow();
    await expect(duplicateSourceProfileTemplate(superadmin, "malformed-template")).rejects.toThrow();
    await expect(setDefaultSourceProfileTemplate(superadmin, "malformed-template")).rejects.toThrow();

    await insertTemplate("unknown-template", "Unknown");
    await database.execute("UPDATE source_profile_templates SET config_version = 2, config_json = '{\"configVersion\":2}' WHERE id = 'unknown-template'");
    await expect(createSourceProfileTemplate(superadmin, { name: "Van unknown", sourceTemplateId: "unknown-template" })).rejects.toThrow();
    await expect(duplicateSourceProfileTemplate(superadmin, "unknown-template")).rejects.toThrow();
    await expect(setDefaultSourceProfileTemplate(superadmin, "unknown-template")).rejects.toThrow();
    expect((await getDefaultSourceProfileTemplate()).id).toBe(INITIAL_SOURCE_PROFILE_TEMPLATE_ID);
  });

  it("fails creation safely when the default is missing, malformed or has an unknown version", async () => {
    const database = await getDatabase();
    await database.execute("DELETE FROM source_profile_template_defaults WHERE singleton_id = 1");
    await expect(createLearningSpace(spaceInput("missing-default"))).rejects.toThrow("geen geldig standaard-bronprofielsjabloon");
    await expect(getAdminLearningSpaceBySlug("missing-default")).resolves.toBeNull();

    await ensureInitialSourceProfileTemplate();
    await database.execute({
      sql: "UPDATE source_profile_templates SET config_json = ? WHERE id = ?",
      args: [JSON.stringify({ configVersion: 1, scanner: {} }), INITIAL_SOURCE_PROFILE_TEMPLATE_ID],
    });
    await expect(createLearningSpace(spaceInput("malformed-default"))).rejects.toThrow();
    await expect(getAdminLearningSpaceBySlug("malformed-default")).resolves.toBeNull();

    await database.execute({
      sql: "UPDATE source_profile_templates SET config_version = 2, config_json = ? WHERE id = ?",
      args: [JSON.stringify({ configVersion: 2, scanner: { convention: "legacy_portfolio_v1" } }), INITIAL_SOURCE_PROFILE_TEMPLATE_ID],
    });
    await expect(createLearningSpace(spaceInput("unknown-default"))).rejects.toThrow();
    await expect(getAdminLearningSpaceBySlug("unknown-default")).resolves.toBeNull();
  });
  it("updates template global resources only for superadmin and keeps future snapshots independent", async () => {
    await expect(updateSourceProfileTemplateGlobalResources(owner, INITIAL_SOURCE_PROFILE_TEMPLATE_ID, [])).rejects.toThrow();
    await updateSourceProfileTemplateGlobalResources(superadmin, INITIAL_SOURCE_PROFILE_TEMPLATE_ID, [{
      id: "formula", kind: "external_link", label: "Formularium", icon: "link", order: 10, semanticRole: "generic",
    }]);
    const updated = await getDefaultSourceProfileTemplate();
    expect(updated.config.globalResources).toEqual([expect.objectContaining({ id: "formula", kind: "external_link" })]);

    const clone = await cloneSourceProfileTemplateToLearningSpace(updated, "space-5", owner.id);
    await updateSourceProfileTemplateGlobalResources(superadmin, INITIAL_SOURCE_PROFILE_TEMPLATE_ID, []);
    expect(clone.config.globalResources).toHaveLength(1);
    expect((await getDefaultSourceProfileTemplate()).config.globalResources).toEqual([]);
  });


});

describe("migration 036", () => {
  it("migrates only built-in assignments and preserves existing custom profiles and LearningSpace data", async () => {
    resetDatabaseForTests();
    if (temporaryDirectory) await removeTemporaryDirectory(temporaryDirectory);
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "source-profile-template-upgrade-"));
    const databasePath = path.join(temporaryDirectory, "metadata.db");
    const legacy = createClient({ url: `file:${databasePath.replaceAll("\\", "/")}` });
    await legacy.execute("CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
    for (const migration of migrations.filter((item) => Number(item.version.slice(0, 3)) <= 35)) {
      await legacy.batch([
        ...migration.statements.map((sql) => ({ sql, args: [] })),
        { sql: "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", args: [migration.version, "2026-09-10T08:00:00.000Z"] },
      ], "write");
    }
    await legacy.execute({
      sql: `INSERT INTO source_profiles
        (id, type, name, description, config_version, config_json, created_at, updated_at, management_learning_space_id)
        VALUES ('existing-custom', 'custom', 'Bestaand eigen profiel', 'Behouden', 1, ?, '2026-09-10T08:00:00.000Z', '2026-09-10T08:00:00.000Z', 'space-6')`,
      args: [JSON.stringify(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG)],
    });
    await legacy.execute("UPDATE learning_space_source_profiles SET source_profile_id = 'existing-custom' WHERE learning_space_id = 'space-6'");
    await legacy.execute("UPDATE learning_space_sources SET local_source_path = 'D:/behouden' WHERE id = 'space-5:primary'");
    legacy.close();

    process.env.PORTFOLIO_DATABASE_PATH = databasePath;
    resetDatabaseForTests();
    const upgraded = await getDatabase();
    const spaceFive = await getActiveSourceProfileForLearningSpace("space-5");
    const spaceSix = await getActiveSourceProfileForLearningSpace("space-6");

    expect(spaceFive).toMatchObject({ type: "custom", managementLearningSpaceId: "space-5", name: "Standaard portfolio" });
    expect(spaceFive?.id).not.toBe(BUILT_IN_DEFAULT_SOURCE_PROFILE_ID);
    expect(spaceSix).toMatchObject({ id: "existing-custom", name: "Bestaand eigen profiel", description: "Behouden" });
    expect((await upgraded.execute("SELECT local_source_path FROM learning_space_sources WHERE id = 'space-5:primary'")).rows[0].local_source_path).toBe("D:/behouden");
    expect((await getDefaultSourceProfileTemplate()).id).toBe(INITIAL_SOURCE_PROFILE_TEMPLATE_ID);
  });
});

async function insertTemplate(id: string, name: string): Promise<void> {
  await (await getDatabase()).execute({
    sql: `INSERT INTO source_profile_templates (id, name, description, config_version, config_json, created_at, updated_at)
      VALUES (?, ?, NULL, 1, ?, ?, ?)`,
    args: [id, name, JSON.stringify(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG), "2026-09-10T00:00:00.000Z", "2026-09-10T00:00:00.000Z"],
  });
}

function spaceInput(slug: string) {
  return { name: slug, slug, shortLabel: slug, sortOrder: 90, sourceType: "local" as const, localSourcePath: null };
}

async function useFreshDatabase(prefix: string): Promise<void> {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), prefix));
  process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
  resetDatabaseForTests();
  await getDatabase();
}

async function removeTemporaryDirectory(directory: string): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await rm(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EBUSY") throw error;
      if (attempt === 9) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}
