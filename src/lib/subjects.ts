import { randomUUID } from "node:crypto";
import { z } from "zod";

import { requireSubjectManagement } from "@/lib/authorization";
import { executeBatch, getDatabase, type DatabaseRow } from "@/lib/database";
import type { AppUser } from "@/lib/identity";

export interface Subject {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export class SubjectSelectionError extends Error {}

const SUBJECT_NAME_UNIQUE_INDEX = "subjects_normalized_name_unique";
const SUBJECT_NAME_CONFLICT_MESSAGE = "Er bestaat al een vak met deze naam.";
const subjectNameSchema = z.string().trim().min(1, "Geef het vak een naam.").max(80, "Een vaknaam mag maximaal 80 tekens bevatten.");
const subjectSortOrderSchema = z.number().int("De sortering moet een geheel getal zijn.").min(0, "De sortering moet nul of groter zijn.");

export async function listSubjectsForManagement(user: AppUser | null): Promise<Subject[]> {
  requireSubjectManagement(user);
  return listSubjects(false);
}

export async function listActiveSubjects(): Promise<Subject[]> {
  return listSubjects(true);
}

export async function requireActiveSubject(subjectId: string): Promise<Subject> {
  if (!subjectId) throw new SubjectSelectionError("Kies een vak.");
  const result = await (await getDatabase()).execute({ sql: "SELECT * FROM subjects WHERE id = ?", args: [subjectId] });
  if (!result.rows[0]) throw new SubjectSelectionError("Het gekozen vak bestaat niet.");
  const subject = subjectFromRow(result.rows[0]);
  if (!subject.isActive) throw new SubjectSelectionError("Het gekozen vak is niet actief.");
  return subject;
}

export async function createSubject(user: AppUser | null, input: { name: string; sortOrder?: number }): Promise<Subject> {
  requireSubjectManagement(user);
  const name = await validatedUniqueSubjectName(input.name);
  const sortOrder = input.sortOrder === undefined ? 0 : validSubjectSortOrder(input.sortOrder);
  const now = new Date().toISOString();
  const subject: Subject = {
    id: `subject-${randomUUID()}`,
    name,
    sortOrder,
    isActive: true,
    usageCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  try {
    const database = await getDatabase();
    await database.execute(input.sortOrder === undefined ? {
      sql: `INSERT INTO subjects (id, name, sort_order, is_active, created_at, updated_at)
        SELECT ?, ?, COALESCE(MAX(sort_order), 0) + 10, 1, ?, ? FROM subjects WHERE is_active = 1`,
      args: [subject.id, subject.name, now, now],
    } : {
      sql: `INSERT INTO subjects (id, name, sort_order, is_active, created_at, updated_at)
        VALUES (?, ?, ?, 1, ?, ?)`,
      args: [subject.id, subject.name, subject.sortOrder, now, now],
    });
  } catch (error) {
    rethrowSubjectNameConflict(error);
  }
  return input.sortOrder === undefined ? requireSubjectRecord(subject.id) : subject;
}

export async function renameSubject(user: AppUser | null, subjectId: string, value: string): Promise<void> {
  requireSubjectManagement(user);
  await requireSubject(subjectId);
  const name = await validatedUniqueSubjectName(value, subjectId);
  try {
    await (await getDatabase()).execute({
      sql: "UPDATE subjects SET name = ?, updated_at = ? WHERE id = ?",
      args: [name, new Date().toISOString(), subjectId],
    });
  } catch (error) {
    rethrowSubjectNameConflict(error);
  }
}

export async function updateSubjectSortOrder(user: AppUser | null, subjectId: string, value: number): Promise<void> {
  requireSubjectManagement(user);
  await requireSubject(subjectId);
  const sortOrder = validSubjectSortOrder(value);
  await (await getDatabase()).execute({
    sql: "UPDATE subjects SET sort_order = ?, updated_at = ? WHERE id = ?",
    args: [sortOrder, new Date().toISOString(), subjectId],
  });
}

export async function setSubjectActive(user: AppUser | null, subjectId: string, active: boolean): Promise<void> {
  if (active) return restoreSubject(user, subjectId);
  return archiveSubject(user, subjectId);
}

export async function moveSubject(user: AppUser | null, subjectId: string, direction: "up" | "down"): Promise<boolean> {
  requireSubjectManagement(user);
  const subjects = await listSubjects(true);
  const currentIndex = subjects.findIndex((subject) => subject.id === subjectId);
  if (currentIndex < 0) return false;
  const targetIndex = currentIndex + (direction === "up" ? -1 : 1);
  if (targetIndex < 0 || targetIndex >= subjects.length) return false;
  [subjects[currentIndex], subjects[targetIndex]] = [subjects[targetIndex], subjects[currentIndex]];
  const now = new Date().toISOString();
  await executeBatch(subjects.map((subject, index) => ({
    sql: "UPDATE subjects SET sort_order = ?, updated_at = ? WHERE id = ? AND is_active = 1",
    args: [(index + 1) * 10, now, subject.id],
  })));
  return true;
}

export async function archiveSubject(user: AppUser | null, subjectId: string): Promise<void> {
  requireSubjectManagement(user);
  await requireSubject(subjectId);
  await (await getDatabase()).execute({ sql: "UPDATE subjects SET is_active = 0, updated_at = ? WHERE id = ?", args: [new Date().toISOString(), subjectId] });
}

export async function restoreSubject(user: AppUser | null, subjectId: string): Promise<void> {
  requireSubjectManagement(user);
  await requireSubject(subjectId);
  const now = new Date().toISOString();
  await (await getDatabase()).execute({
    sql: `UPDATE subjects SET is_active = 1,
      sort_order = (SELECT COALESCE(MAX(active_subject.sort_order), 0) + 10 FROM subjects AS active_subject WHERE active_subject.is_active = 1),
      updated_at = ? WHERE id = ?`,
    args: [now, subjectId],
  });
}

export async function permanentlyDeleteSubject(user: AppUser | null, subjectId: string): Promise<void> {
  requireSubjectManagement(user);
  const subject = await requireSubjectRecord(subjectId);
  if (subject.isActive) throw new Error("Archiveer dit vak voordat je het definitief verwijdert.");
  const database = await getDatabase();
  const usageCount = await subjectUsageCount(subjectId);
  if (usageCount > 0) throw new Error(subjectUsageMessage(usageCount));
  try {
    const deleted = await database.execute({
      sql: `DELETE FROM subjects WHERE id = ? AND is_active = 0
        AND NOT EXISTS (SELECT 1 FROM learning_spaces WHERE learning_spaces.subject_id = subjects.id)
        RETURNING id`,
      args: [subjectId],
    });
    if (deleted.rows[0]) return;
  } catch (error) {
    const currentUsageCount = await subjectUsageCount(subjectId);
    if (currentUsageCount > 0) throw new Error(subjectUsageMessage(currentUsageCount));
    throw error;
  }
  const currentUsageCount = await subjectUsageCount(subjectId);
  if (currentUsageCount > 0) throw new Error(subjectUsageMessage(currentUsageCount));
  throw new Error("Vak niet gevonden.");
}

async function listSubjects(activeOnly: boolean): Promise<Subject[]> {
  const result = await (await getDatabase()).execute(`SELECT subjects.*,
    (SELECT COUNT(*) FROM learning_spaces WHERE learning_spaces.subject_id = subjects.id) AS usage_count
    FROM subjects ${activeOnly ? "WHERE subjects.is_active = 1" : ""}
    ORDER BY subjects.sort_order, LOWER(subjects.name), subjects.id`);
  return result.rows.map(subjectFromRow);
}

async function requireSubject(subjectId: string): Promise<void> {
  const result = await (await getDatabase()).execute({ sql: "SELECT 1 FROM subjects WHERE id = ?", args: [subjectId] });
  if (!result.rows[0]) throw new Error("Vak niet gevonden.");
}

async function requireSubjectRecord(subjectId: string): Promise<Subject> {
  const result = await (await getDatabase()).execute({
    sql: `SELECT subjects.*,
      (SELECT COUNT(*) FROM learning_spaces WHERE learning_spaces.subject_id = subjects.id) AS usage_count
      FROM subjects WHERE subjects.id = ?`,
    args: [subjectId],
  });
  if (!result.rows[0]) throw new Error("Vak niet gevonden.");
  return subjectFromRow(result.rows[0]);
}

async function subjectUsageCount(subjectId: string): Promise<number> {
  const result = await (await getDatabase()).execute({ sql: "SELECT COUNT(*) AS usage_count FROM learning_spaces WHERE subject_id = ?", args: [subjectId] });
  return Number(result.rows[0]?.usage_count ?? 0);
}

function subjectUsageMessage(count: number): string {
  return `Dit vak wordt nog gebruikt door ${count} ${count === 1 ? "leeromgeving" : "leeromgevingen"}.`;
}

async function validatedUniqueSubjectName(value: string, excludeSubjectId?: string): Promise<string> {
  const parsed = subjectNameSchema.safeParse(value);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Ongeldige vaknaam.");
  const database = await getDatabase();
  const duplicate = excludeSubjectId
    ? await database.execute({
      sql: "SELECT 1 FROM subjects WHERE LOWER(TRIM(name)) = LOWER(?) AND id <> ? LIMIT 1",
      args: [parsed.data, excludeSubjectId],
    })
    : await database.execute({
      sql: "SELECT 1 FROM subjects WHERE LOWER(TRIM(name)) = LOWER(?) LIMIT 1",
      args: [parsed.data],
    });
  if (duplicate.rows[0]) throw new Error(SUBJECT_NAME_CONFLICT_MESSAGE);
  return parsed.data;
}

function validSubjectSortOrder(value: number): number {
  const parsed = subjectSortOrderSchema.safeParse(value);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Ongeldige sortering.");
  return parsed.data;
}

function subjectFromRow(row: DatabaseRow): Subject {
  return {
    id: String(row.id),
    name: String(row.name),
    sortOrder: Number(row.sort_order),
    isActive: Number(row.is_active) === 1,
    usageCount: Number(row.usage_count ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function rethrowSubjectNameConflict(error: unknown): never {
  let current = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
    const candidate = current as { code?: unknown; constraint?: unknown; constraintName?: unknown; message?: unknown; cause?: unknown };
    const code = typeof candidate.code === "string" ? candidate.code : "";
    const constraint = typeof candidate.constraint === "string"
      ? candidate.constraint
      : typeof candidate.constraintName === "string" ? candidate.constraintName : "";
    const message = typeof candidate.message === "string" ? candidate.message : "";
    const uniqueViolation = code === "23505" || code === "SQLITE_CONSTRAINT_UNIQUE" || code === "SQLITE_CONSTRAINT";
    if (uniqueViolation && (constraint === SUBJECT_NAME_UNIQUE_INDEX || message.includes(SUBJECT_NAME_UNIQUE_INDEX))) {
      throw new Error(SUBJECT_NAME_CONFLICT_MESSAGE);
    }
    current = candidate.cause;
  }
  throw error;
}
