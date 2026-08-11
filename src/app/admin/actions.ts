"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { endAdminSession, requireAdmin } from "@/lib/auth";
import { bulkSelectionError } from "@/lib/admin-validation";
import { parseBrusselsDateTime, type ChildVisibilityMode, type PortfolioVisibilityMode } from "@/lib/publication";
import {
  getAdminPortfolio,
  setExercisePublication,
  setPortfolioPublication,
  setPortfolioTitle,
  setErrorReportStatus,
  saveErrorReportNote,
  setSectionPublication,
  toggleErrorReportPin,
} from "@/lib/repositories";
import { synchronizeSource } from "@/lib/sync";

const childModeSchema = z.enum(["inherit", "hidden", "visible"]);
const portfolioModeSchema = z.enum(["hidden", "visible"]);

export async function syncAction() {
  await requireAdmin();
  await synchronizeSource();
  revalidatePath("/");
  revalidatePath("/admin");
}

export async function savePortfolioAction(formData: FormData) {
  await requireAdmin();
  const id = stringValue(formData, "id");
  const title = stringValue(formData, "title");
  const mode = portfolioModeSchema.safeParse(stringValue(formData, "mode"));
  if (!id || !mode.success || title.length > 180) throw new Error("Ongeldige portfolio-invoer.");
  const window = parsePublicationWindow(formData);
  await Promise.all([setPortfolioTitle(id, title), setPortfolioPublication(id, mode.data, window.publishFrom, window.publishUntil)]);
  refreshPublicationPaths(id);
}

export async function saveSectionPublicationAction(formData: FormData) {
  await requireAdmin();
  const id = stringValue(formData, "id");
  const portfolioId = stringValue(formData, "portfolioId");
  const mode = childModeSchema.safeParse(stringValue(formData, "mode"));
  if (!id || !portfolioId || !mode.success) throw new Error("Ongeldige onderdeel-invoer.");
  const portfolio = await getAdminPortfolio(portfolioId);
  if (!portfolio?.sections.some((section) => section.id === id)) throw new Error("Onderdeel niet gevonden.");
  const window = parsePublicationWindow(formData);
  await setSectionPublication(id, mode.data, window.publishFrom, window.publishUntil);
  refreshPublicationPaths(portfolioId);
}

export async function bulkExercisePublicationAction(_previousState: { error: string | null }, formData: FormData): Promise<{ error: string | null }> {
  await requireAdmin();
  const portfolioId = stringValue(formData, "portfolioId");
  const mode = childModeSchema.safeParse(stringValue(formData, "mode"));
  const requestedIds = formData.getAll("exerciseIds").map(String).filter(Boolean);
  const emptySelection = bulkSelectionError(requestedIds.length);
  if (emptySelection) return { error: emptySelection };
  if (!portfolioId || !mode.success) return { error: "Kies een geldige publicatiestatus." };
  const portfolio = await getAdminPortfolio(portfolioId);
  if (!portfolio) return { error: "Portfolio niet gevonden." };
  const validIds = new Set(portfolio.sections.flatMap((section) => section.exercises.map((exercise) => exercise.id)));
  const exerciseIds = [...new Set(requestedIds)].filter((id) => validIds.has(id));
  if (exerciseIds.length !== requestedIds.length) return { error: "Ongeldige oefeningselectie." };
  let window: { publishFrom: string | null; publishUntil: string | null };
  try {
    window = parsePublicationWindow(formData);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Ongeldige planning." };
  }
  await setExercisePublication(exerciseIds, mode.data, window.publishFrom, window.publishUntil);
  refreshPublicationPaths(portfolioId);
  return { error: null };
}

export async function saveExercisePublicationAction(formData: FormData) {
  await requireAdmin();
  const id = stringValue(formData, "id");
  const portfolioId = stringValue(formData, "portfolioId");
  const mode = childModeSchema.safeParse(stringValue(formData, "mode"));
  if (!id || !portfolioId || !mode.success) throw new Error("Ongeldige oefening-invoer.");
  const portfolio = await getAdminPortfolio(portfolioId);
  if (!portfolio?.sections.some((section) => section.exercises.some((exercise) => exercise.id === id))) throw new Error("Oefening niet gevonden.");
  const window = parsePublicationWindow(formData);
  await setExercisePublication([id], mode.data, window.publishFrom, window.publishUntil);
  refreshPublicationPaths(portfolioId);
}

export async function logoutAction() {
  await endAdminSession();
  redirect("/admin/login");
}

export async function errorReportStatusAction(formData: FormData) {
  await requireAdmin();
  const id = stringValue(formData, "id");
  const status = stringValue(formData, "status");
  if (!id || (status !== "TODO" && status !== "DONE")) throw new Error("Ongeldige meldingsstatus.");
  await setErrorReportStatus(id, status);
  revalidatePath("/admin/meldingen");
  revalidatePath("/admin");
}

export async function errorReportPinAction(formData: FormData) {
  await requireAdmin();
  const id = stringValue(formData, "id");
  if (!id) return;
  await toggleErrorReportPin(id);
  revalidatePath("/admin/meldingen");
}

export async function errorReportNoteAction(formData: FormData) {
  await requireAdmin();
  const id = stringValue(formData, "id");
  if (!id) return;
  await saveErrorReportNote(id, stringValue(formData, "note"));
  revalidatePath("/admin/meldingen");
}

export async function hideReportedExerciseAction(formData: FormData) {
  await requireAdmin();
  const id = stringValue(formData, "exerciseId");
  const portfolioId = stringValue(formData, "portfolioId");
  if (!id || !portfolioId) return;
  await setExercisePublication([id], "hidden", null, null);
  refreshPublicationPaths(portfolioId);
  revalidatePath("/admin/meldingen");
}

function parsePublicationWindow(formData: FormData) {
  const fromInput = stringValue(formData, "publishFrom");
  const untilInput = stringValue(formData, "publishUntil");
  const publishFrom = fromInput ? parseBrusselsDateTime(fromInput) : null;
  const publishUntil = untilInput ? parseBrusselsDateTime(untilInput) : null;
  if ((fromInput && !publishFrom) || (untilInput && !publishUntil)) throw new Error("Gebruik een geldige datum en tijd in Europe/Brussels.");
  if (publishFrom && publishUntil && Date.parse(publishFrom) > Date.parse(publishUntil)) throw new Error("De einddatum moet na de begindatum liggen.");
  return { publishFrom, publishUntil };
}

function stringValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function refreshPublicationPaths(portfolioId: string) {
  revalidatePath("/");
  revalidatePath(`/portfolio/${portfolioId}`);
  revalidatePath("/admin");
  revalidatePath(`/admin/portfolio/${portfolioId}`);
}

export type { ChildVisibilityMode, PortfolioVisibilityMode };
