import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getDatabase, resetDatabaseForTests } from "./database";
import { createUser, setLearningSpaceMember } from "./identity";
import { createLearningSpaceForOwner, getActiveLearningSpaceSource, getAdminLearningSpaceBySlug, updateLearningSpace, type LearningSpaceInput } from "./repositories";
import { ensureStorageConnection } from "./storage-connections";
import { createSubject, setSubjectActive } from "./subjects";

import { getActiveSourceProfileForLearningSpace } from "./source-profiles";
import { getDefaultSourceProfileTemplate, copySourceProfileTemplateToLearningSpace } from "./source-profile-templates";
import { synchronizeSource } from "./sync";
import { getLearningSpaceCreationOptions } from "./learning-space-creation-options";
import { hasConfiguredActiveSource } from "./storage";

let temporaryDirectory: string | undefined;

afterEach(async () => {
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  if (temporaryDirectory) {
    try {
      await rm(temporaryDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "EBUSY") throw error;
    }
  }
  temporaryDirectory = undefined;
});

describe("transactional LearningSpace owner creation", () => {
  it("creates a deliberately unconfigured space, skips sync without a failed run and recovers with existing template flow", async () => {
    await useTemporaryDatabase();
    const teacher = await createUser({ displayName: "Leraar", role: "teacher" });
    const space = await createLearningSpaceForOwner({ ...localInput("later"), creationProfileChoice: { mode: "later" }, skipSourceOnCreation: true }, teacher.id);
    expect(await memberRole(space.id, teacher.id)).toBe("owner");
    expect(await getActiveSourceProfileForLearningSpace(space.id)).toBeNull();
    expect(await getActiveLearningSpaceSource(space.id)).toBeNull();
    expect(await synchronizeSource(space.id)).toMatchObject({ skipped: true, skipReason: "configuration" });
    const runs = await (await getDatabase()).execute({ sql: "SELECT id FROM sync_runs WHERE learning_space_id = ?", args: [space.id] });
    expect(runs.rows).toHaveLength(0);
    const template = await getDefaultSourceProfileTemplate();
    await copySourceProfileTemplateToLearningSpace(teacher, template.id, space.id);
    expect(await getActiveSourceProfileForLearningSpace(space.id)).toMatchObject({ ownerUserId: teacher.id });
    await updateLearningSpace(space.id, { ...localInput("later"), localSourcePath: "C:\\test" });
    expect(await hasConfiguredActiveSource(space.id)).toBe(true);
  });

  it("links an owned existing profile and snapshots a copy independently", async () => {
    await useTemporaryDatabase();
    const teacher = await createUser({ displayName: "Leraar", role: "teacher" });
    const original = await createLearningSpaceForOwner(localInput("original"), teacher.id);
    const profile = (await getActiveSourceProfileForLearningSpace(original.id))!;
    const linked = await createLearningSpaceForOwner({ ...localInput("linked"), creationProfileChoice: { mode: "link", id: profile.id } }, teacher.id);
    const copied = await createLearningSpaceForOwner({ ...localInput("copied"), creationProfileChoice: { mode: "copy", id: original.id } }, teacher.id);
    expect((await getActiveSourceProfileForLearningSpace(linked.id))?.id).toBe(profile.id);
    const snapshot = (await getActiveSourceProfileForLearningSpace(copied.id))!;
    expect(snapshot.id).not.toBe(profile.id);
    expect(snapshot.config).toEqual(profile.config);
    const changed = structuredClone(profile.config); changed.scanner.portfolio.marker = "Boek";
    await (await getDatabase()).execute({ sql: "UPDATE source_profiles SET config_json = ? WHERE id = ?", args: [JSON.stringify(changed), profile.id] });
    expect((await getActiveSourceProfileForLearningSpace(copied.id))?.config).toEqual(snapshot.config);
    expect((await getActiveSourceProfileForLearningSpace(linked.id))?.config.scanner.portfolio.marker).toBe("Boek");
    expect(await memberRole(copied.id, teacher.id)).toBe("owner");
  });

  it("rejects forged inaccessible copy/link choices without leaving any created rows", async () => {
    await useTemporaryDatabase();
    const owner = await createUser({ displayName: "Eigenaar", role: "teacher" });
    const other = await createUser({ displayName: "Andere leraar", role: "teacher" });
    const original = await createLearningSpaceForOwner(localInput("private-original"), owner.id);
    const profile = (await getActiveSourceProfileForLearningSpace(original.id))!;
    const database = await getDatabase();
    const before = await database.execute("SELECT id FROM source_profiles ORDER BY id");
    for (const choice of [{ mode: "link", id: profile.id }, { mode: "copy", id: original.id }] as const) {
      await expect(createLearningSpaceForOwner({ ...localInput(`denied-${choice.mode}`), creationProfileChoice: choice }, other.id)).rejects.toThrow();
      expect(await getAdminLearningSpaceBySlug(`denied-${choice.mode}`)).toBeNull();
    }
    expect((await database.execute("SELECT id FROM source_profiles ORDER BY id")).rows).toEqual(before.rows);
    const options = await getLearningSpaceCreationOptions(other);
    expect(options.links.map((p) => p.id)).not.toContain(profile.id);
    expect(options.copies.map((p) => p.id)).not.toContain(original.id);
    const student = await createUser({ displayName: "Leerling", role: "student" });
    await expect(createLearningSpaceForOwner({ ...localInput("student-denied"), creationProfileChoice: { mode: "later" } }, student.id)).rejects.toThrow();
    expect(await getAdminLearningSpaceBySlug("student-denied")).toBeNull();
  });

  it("allows an existing editor to copy an accessible active profile without gaining its ownership or linking it", async () => {
    await useTemporaryDatabase();
    const owner = await createUser({ displayName: "Eigenaar", role: "teacher" });
    const editor = await createUser({ displayName: "Bewerker", role: "teacher" });
    const original = await createLearningSpaceForOwner(localInput("editor-source"), owner.id);
    await setLearningSpaceMember(original.id, editor.id, "editor");
    const profile = (await getActiveSourceProfileForLearningSpace(original.id))!;
    const options = await getLearningSpaceCreationOptions(editor);
    expect(options.copies.map((p) => p.id)).toContain(original.id);
    expect(options.links.map((p) => p.id)).not.toContain(profile.id);
    const copy = await createLearningSpaceForOwner({ ...localInput("editor-copy"), creationProfileChoice: { mode: "copy", id: original.id } }, editor.id);
    expect(await getActiveSourceProfileForLearningSpace(copy.id)).toMatchObject({ ownerUserId: editor.id, config: profile.config });
    expect(await getActiveSourceProfileForLearningSpace(original.id)).toMatchObject({ id: profile.id, ownerUserId: owner.id });
    expect(await memberRole(original.id, editor.id)).toBe("editor");
    await expect(createLearningSpaceForOwner({ ...localInput("editor-link-denied"), creationProfileChoice: { mode: "link", id: profile.id } }, editor.id)).rejects.toThrow();
  });

  it("uses the selected template and persists terminology without linking the template", async () => {
    await useTemporaryDatabase();
    const teacher = await createUser({ displayName: "Leraar", role: "teacher" });
    const template = await getDefaultSourceProfileTemplate();
    const input = { ...localInput("template-choice"), creationProfileChoice: { mode: "template" as const, id: template.id }, themeLabelSingular: "Deel", themeLabelPlural: "Delen", sectionLabelSingular: "Sectie", sectionLabelPlural: "Secties", collectionLabelSingular: "Bundel", collectionLabelPlural: "Bundels", exerciseLabelSingular: "Opdracht", exerciseLabelPlural: "Opdrachten", exerciseLabelShort: "Opdr.", description: "Mijn beschrijving" };
    const space = await createLearningSpaceForOwner(input, teacher.id);
    expect(space).toMatchObject({ themeLabelSingular: "Deel", themeLabelPlural: "Delen", sectionLabelSingular: "Sectie", sectionLabelPlural: "Secties", collectionLabelSingular: "Bundel", collectionLabelPlural: "Bundels", exerciseLabelSingular: "Opdracht", exerciseLabelPlural: "Opdrachten", exerciseLabelShort: "Opdr.", description: "Mijn beschrijving" });
    const profile = (await getActiveSourceProfileForLearningSpace(space.id))!;
    expect(profile.id).not.toBe(template.id); expect(profile.config).toEqual(template.config);
    const rows = await (await getDatabase()).execute({ sql: "SELECT id FROM learning_spaces WHERE slug = ?", args: [input.slug] });
    expect(rows.rows).toHaveLength(1);
  });

  it("stores edited template/copy/new drafts as independent snapshots without changing the original", async () => {
    await useTemporaryDatabase();
    const teacher = await createUser({ displayName: "Leraar", role: "teacher" });
    const original = await createLearningSpaceForOwner(localInput("draft-original"), teacher.id);
    const source = (await getActiveSourceProfileForLearningSpace(original.id))!;
    const template = await getDefaultSourceProfileTemplate();
    const draft = structuredClone(source.config); draft.scanner.portfolio.marker = "Eigen bundel"; draft.scanner.portfolio.themeMode = "folder";
    for (const choice of [{ mode: "template", id: template.id, config: draft }, { mode: "copy", id: original.id, config: draft }, { mode: "new", config: draft }] as const) {
      const space = await createLearningSpaceForOwner({ ...localInput(`edited-${choice.mode}`), creationProfileChoice: choice, skipSourceOnCreation: true }, teacher.id);
      const profile = (await getActiveSourceProfileForLearningSpace(space.id))!;
      expect(profile.id).not.toBe(source.id); expect(profile.config.scanner.portfolio).toEqual(draft.scanner.portfolio);
      expect(profile.ownerUserId).toBe(teacher.id); expect(await memberRole(space.id, teacher.id)).toBe("owner");
    }
    expect((await getActiveSourceProfileForLearningSpace(original.id))?.config).toEqual(source.config);
    expect((await getDefaultSourceProfileTemplate()).config).toEqual(template.config);
  });

  it("persists custom hierarchy terms on creation and update without changing descriptions or omitted labels", async () => {
    await useTemporaryDatabase();
    const teacher = await createUser({ displayName: "Leraar", role: "teacher" });
    const input = {
      ...localInput("hierarchy-terminology"),
      themeLabelSingular: " Deel ", themeLabelPlural: " Delen ",
      sectionLabelSingular: " Sectie ", sectionLabelPlural: " Secties ",
      collectionLabelSingular: "Bundel", collectionLabelPlural: "Bundels",
      exerciseLabelSingular: "Opdracht", exerciseLabelPlural: "Opdrachten", exerciseLabelShort: "Opdr.",
    };
    const space = await createLearningSpaceForOwner(input, teacher.id);
    expect(space).toMatchObject({
      themeLabelSingular: "Deel", themeLabelPlural: "Delen", sectionLabelSingular: "Sectie", sectionLabelPlural: "Secties",
      collectionLabelSingular: "Bundel", collectionLabelPlural: "Bundels", exerciseLabelShort: "Opdr.",
      description: "Overzicht van de bundels met opdrachten.",
    });
    await updateLearningSpace(space.id, {
      ...localInput(input.slug), themeLabelSingular: "Domein", themeLabelPlural: "Domeinen",
      sectionLabelSingular: "Tussentitel", sectionLabelPlural: "Tussentitels", exerciseLabelShort: "",
    });
    await expect(getAdminLearningSpaceBySlug(input.slug)).resolves.toMatchObject({
      themeLabelSingular: "Domein", themeLabelPlural: "Domeinen", sectionLabelSingular: "Tussentitel", sectionLabelPlural: "Tussentitels",
      collectionLabelSingular: "Bundel", collectionLabelPlural: "Bundels", exerciseLabelSingular: "Opdracht", exerciseLabelPlural: "Opdrachten", exerciseLabelShort: "",
      description: space.description,
    });
    await updateLearningSpace(space.id, localInput(input.slug));
    await expect(getAdminLearningSpaceBySlug(input.slug)).resolves.toMatchObject({
      themeLabelSingular: "Domein", themeLabelPlural: "Domeinen", sectionLabelSingular: "Tussentitel", sectionLabelPlural: "Tussentitels", exerciseLabelShort: "", description: space.description,
    });
    await expect(updateLearningSpace(space.id, { ...localInput(input.slug), themeLabelSingular: " " })).rejects.toThrow("enkelvoud");
    await expect(updateLearningSpace(space.id, { ...localInput(input.slug), sectionLabelPlural: "x".repeat(41) })).rejects.toThrow("40");
    await expect(getAdminLearningSpaceBySlug(input.slug)).resolves.toMatchObject({ themeLabelSingular: "Domein", sectionLabelPlural: "Tussentitels" });
  });
  it.each([
    ["Portfolio", "Portfolio's", "Oefening", "Oefeningen", "Overzicht van de portfolio's met oefeningen."],
    ["Bundel", "Bundels", "Oefening", "Oefeningen", "Overzicht van de bundels met oefeningen."],
    ["Portfolio", "Portfolio's", "Opdracht", "Opdrachten", "Overzicht van de portfolio's met opdrachten."],
  ])("stores an initial description for %s and preserves it after terminology changes", async (singular: string, plural: string, exerciseSingular: string, exercisePlural: string, expected: string) => {
    await useTemporaryDatabase();
    const teacher = await createUser({ displayName: "Leraar", role: "teacher" });
    const before = (await (await getDatabase()).execute("SELECT id, description FROM learning_spaces ORDER BY id")).rows;
    const input = { ...localInput("description-space"), collectionLabelSingular: singular, collectionLabelPlural: plural, exerciseLabelSingular: exerciseSingular, exerciseLabelPlural: exercisePlural };
    const space = await createLearningSpaceForOwner(input, teacher.id);
    expect(space.description).toBe(expected);
    const after = (await (await getDatabase()).execute({ sql: "SELECT id, description FROM learning_spaces WHERE id <> ? ORDER BY id", args: [space.id] })).rows;
    expect(after).toEqual(before);
    await updateLearningSpace(space.id, { ...input, collectionLabelSingular: "Boek", collectionLabelPlural: "Boeken", exerciseLabelSingular: "Vraag", exerciseLabelPlural: "Vragen" });
    await expect(getAdminLearningSpaceBySlug(space.slug)).resolves.toMatchObject({ description: expected, collectionLabelPlural: "Boeken", exerciseLabelPlural: "Vragen" });
  });

  it("preserves a custom creation description", async () => {
    await useTemporaryDatabase();
    const teacher = await createUser({ displayName: "Leraar", role: "teacher" });
    const space = await createLearningSpaceForOwner({ ...localInput("custom-description"), description: "Onze eigen beschrijving." }, teacher.id);
    expect(space.description).toBe("Onze eigen beschrijving.");
  });
  it("creates a teacher-owned LearningSpace and preserves their OneDrive connection", async () => {
    await useTemporaryDatabase();
    const teacher = await createUser({ displayName: "Leraar", role: "teacher" });
    const connection = await ensureStorageConnection(teacher.id, "onedrive");

    const space = await createLearningSpaceForOwner(oneDriveInput("teacher-created", connection.id), teacher.id);

    expect(space).toMatchObject({
      themeLabelSingular: "Thema", themeLabelPlural: "Thema's",
      sectionLabelSingular: "Onderdeel", sectionLabelPlural: "Onderdelen",
      collectionLabelSingular: "Portfolio", collectionLabelPlural: "Portfolio's",
      exerciseLabelSingular: "Oefening", exerciseLabelPlural: "Oefeningen", exerciseLabelShort: "Oef.",
    });
    await expect(memberRole(space.id, teacher.id)).resolves.toBe("owner");
    await expect(getActiveLearningSpaceSource(space.id)).resolves.toMatchObject({ storageConnectionId: connection.id, providerType: "onedrive" });
  });

  it("also records a creating superadmin as owner", async () => {
    await useTemporaryDatabase();
    const superadmin = await createUser({ displayName: "Hoofdbeheerder", role: "superadmin" });

    const space = await createLearningSpaceForOwner(localInput("admin-created"), superadmin.id);

    await expect(memberRole(space.id, superadmin.id)).resolves.toBe("owner");
  });

  it("places a new LearningSpace without a supplied global order at the fallback bottom", async () => {
    await useTemporaryDatabase();
    const teacher = await createUser({ displayName: "Leraar", role: "teacher" });
    const globalMaximum = Number((await (await getDatabase()).execute("SELECT MAX(sort_order) AS maximum FROM learning_spaces")).rows[0]?.maximum);

    const space = await createLearningSpaceForOwner({ ...localInput("bottom-space"), sortOrder: undefined }, teacher.id);

    expect(space.sortOrder).toBe(globalMaximum + 10);
  });

  it("rolls back LearningSpace and sources when the owner membership cannot be inserted", async () => {
    await useTemporaryDatabase();

    await expect(createLearningSpaceForOwner(localInput("atomic-failure"), "missing-user")).rejects.toThrow();

    await expect(getAdminLearningSpaceBySlug("atomic-failure")).resolves.toBeNull();
  });

  it("keeps an existing owner intact when a duplicate slug fails", async () => {
    await useTemporaryDatabase();
    const first = await createUser({ displayName: "Eerste", role: "teacher" });
    const second = await createUser({ displayName: "Tweede", role: "teacher" });
    const space = await createLearningSpaceForOwner(localInput("duplicate-owner"), first.id);

    await expect(createLearningSpaceForOwner(localInput("duplicate-owner"), second.id)).rejects.toThrow();

    await expect(memberRole(space.id, first.id)).resolves.toBe("owner");
    await expect(memberRole(space.id, second.id)).resolves.toBeNull();
  });

  it("requires an existing active subject before creating any LearningSpace data", async () => {
    await useTemporaryDatabase();
    const teacher = await createUser({ displayName: "Leraar", role: "teacher" });
    const superadmin = await createUser({ displayName: "Hoofdbeheerder", role: "superadmin" });
    const inactive = await createSubject(superadmin, { name: "Fysica", sortOrder: 20 });
    await setSubjectActive(superadmin, inactive.id, false);

    await expect(createLearningSpaceForOwner({ ...localInput("missing-subject"), subjectId: "" }, teacher.id)).rejects.toThrow("Kies een vak.");
    await expect(createLearningSpaceForOwner({ ...localInput("unknown-subject"), subjectId: "subject-onbekend" }, teacher.id)).rejects.toThrow("bestaat niet");
    await expect(createLearningSpaceForOwner({ ...localInput("inactive-subject"), subjectId: inactive.id }, teacher.id)).rejects.toThrow("niet actief");

    await expect(getAdminLearningSpaceBySlug("missing-subject")).resolves.toBeNull();
    await expect(getAdminLearningSpaceBySlug("unknown-subject")).resolves.toBeNull();
    await expect(getAdminLearningSpaceBySlug("inactive-subject")).resolves.toBeNull();
  });
});

async function useTemporaryDatabase(): Promise<void> {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-space-owner-"));
  process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
  resetDatabaseForTests();
  await getDatabase();
}

async function memberRole(learningSpaceId: string, userId: string): Promise<string | null> {
  const row = (await (await getDatabase()).execute({
    sql: "SELECT role FROM learning_space_members WHERE learning_space_id = ? AND user_id = ?",
    args: [learningSpaceId, userId],
  })).rows[0];
  return typeof row?.role === "string" ? row.role : null;
}

function localInput(slug: string): LearningSpaceInput {
  return { subjectId: "subject-wiskunde", name: slug, slug, shortLabel: slug, sortOrder: 10, sourceType: "local", localSourcePath: null };
}

function oneDriveInput(slug: string, storageConnectionId: string): LearningSpaceInput {
  return {
    subjectId: "subject-wiskunde",
    name: slug,
    slug,
    shortLabel: slug,
    sortOrder: 10,
    sourceType: "onedrive",
    storageConnectionId,
    oneDriveDriveId: "drive-id",
    oneDriveFolderId: "folder-id",
  };
}
