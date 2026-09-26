import { randomUUID } from "node:crypto";
import { z } from "zod";

import { requireSubjectManagement } from "@/lib/authorization";
import { getDatabase, type DatabaseRow } from "@/lib/database";
import type { AppUser } from "@/lib/identity";

export interface Subject {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
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

export async function createSubject(user: AppUser | null, input: { name: string; sortOrder: number }): Promise<Subject> {
  requireSubjectManagement(user);
  const name = await validatedUniqueSubjectName(input.name);
  const sortOrder = validSubjectSortOrder(input.sortOrder);
  const now = new Date().toISOString();
  const subject: Subject = {
    id: `subject-${randomUUID()}`,
    name,
    sortOrder,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await (await getDatabase()).execute({
      sql: `INSERT INTO subjects (id, name, sort_order, is_active, created_at, updated_at)
        VALUES (?, ?, ?, 1, ?, ?)`,
      args: [subject.id, subject.name, subject.sortOrder, now, now],
    });
  } catch (error) {
    rethrowSubjectNameConflict(error);
  }
  return subject;
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
  requireSubjectManagement(user);
  await requireSubject(subjectId);
  await (await getDatabase()).execute({
    sql: "UPDATE subjects SET is_active = ?, updated_at = ? WHERE id = ?",
    args: [active ? 1 : 0, new Date().toISOString(), subjectId],
  });
}

async function listSubjects(activeOnly: boolean): Promise<Subject[]> {
  const result = await (await getDatabase()).execute(`SELECT * FROM subjects
    ${activeOnly ? "WHERE is_active = 1" : ""}
    ORDER BY sort_order, LOWER(name), id`);
  return result.rows.map(subjectFromRow);
}

async function requireSubject(subjectId: string): Promise<void> {
  const result = await (await getDatabase()).execute({ sql: "SELECT 1 FROM subjects WHERE id = ?", args: [subjectId] });
  if (!result.rows[0]) throw new Error("Vak niet gevonden.");
}

async function validatedUniqueSubjectName(value: string, excludeSubjectId?: string): Promise<string> {
  const parsed = subjectNameSchema.safeParse(value);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Ongeldige vaknaam.");
  const duplicate = await (await getDatabase()).execute({
    sql: `SELECT 1 FROM subjects
      WHERE LOWER(TRIM(name)) = LOWER(?) AND (? IS NULL OR id <> ?) LIMIT 1`,
    args: [parsed.data, excludeSubjectId ?? null, excludeSubjectId ?? null],
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
