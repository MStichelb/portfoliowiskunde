"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import path from "node:path";
import { z } from "zod";

import { endAdminSession, requireAdmin } from "@/lib/auth";
import { bulkSelectionError } from "@/lib/admin-validation";
import { parseBrusselsDateTime, type ChildVisibilityMode, type PortfolioVisibilityMode } from "@/lib/publication";
import {
  getAdminPortfolioAny,
  createLearningSpace,
  createTheme,
  deleteTheme,
  getLearningSpace,
  getLearningSpaceBySlug,
  updateLearningSpace,
  updateTheme,
  setExercisePublication,
  setExerciseVisibility,
  setExerciseAlternativeVisibility,
  setPortfolioPublication,
  setPortfolioTitle,
  setPortfolioTheme,
  setErrorReportStatus,
  saveErrorReportNote,
  deleteErrorReport,
  deleteOldDoneErrorReports,
  setSectionPublication,
  setSectionVisibility,
  toggleErrorReportPin,
  archiveMissingIndexItems,
  deactivateLearningSpace,
  type LearningSpaceInput,
} from "@/lib/repositories";
import { synchronizeSource } from "@/lib/sync";
import { userFacingSourceError } from "@/lib/source-errors";

const childModeSchema = z.enum(["hidden", "visible"]);
const portfolioModeSchema = z.enum(["hidden", "visible"]);
export interface AdminActionState { error: string | null; }

export async function syncAction() {
  await requireAdmin();
  await synchronizeSource();
  revalidatePath("/");
  revalidatePath("/admin");
}

export async function syncSpaceAction(_previousState: AdminActionState, formData: FormData): Promise<AdminActionState> {
  await requireAdmin();
  const learningSpaceId = stringValue(formData, "learningSpaceId");
  if (!await getLearningSpace(learningSpaceId)) return { error: "Leeromgeving niet gevonden." };
  try {
    const result = await synchronizeSource(learningSpaceId);
    if (result.skipped) return { error: "Er loopt al een synchronisatie voor deze leeromgeving." };
  } catch (error) {
    const message = userFacingSourceError(error);
    if (message) return { error: message };
    throw error;
  }
  revalidatePath("/admin");
  return { error: null };
}

export async function archiveMissingIndexAction(formData: FormData) {
  await requireAdmin();
  const learningSpaceId = stringValue(formData, "learningSpaceId");
  if (!await getLearningSpace(learningSpaceId)) return;
  await archiveMissingIndexItems(learningSpaceId);
  revalidatePath("/admin");
}

export async function deactivateLearningSpaceAction(formData: FormData) {
  await requireAdmin();
  const id = stringValue(formData, "id");
  if (!id || !await getLearningSpace(id)) return;
  if (!await deactivateLearningSpace(id)) redirect("/admin?error=last-space");
  revalidatePath("/");
  revalidatePath("/admin");
  redirect("/admin");
}

export async function saveLearningSpaceAction(_previousState: AdminActionState, formData: FormData): Promise<AdminActionState> {
  await requireAdmin();
  const id = stringValue(formData, "id");
  const existing = await getLearningSpace(id);
  if (!existing) return { error: "Leeromgeving niet gevonden." };
  let input: ReturnType<typeof learningSpaceInput>;
  try {
    input = learningSpaceInput(formData);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "De instellingen zijn ongeldig." };
  }
  const matchingSlug = await getLearningSpaceBySlug(input.slug);
  if (matchingSlug && matchingSlug.id !== id) return { error: "Deze publieke slug bestaat al. Kies een andere slug." };
  try {
    await updateLearningSpace(id, input);
  } catch (error) {
    if (isUniqueConstraintError(error)) return { error: "Deze publieke slug bestaat al. Kies een andere slug." };
    throw error;
  }
  revalidatePath("/admin");
  redirect(`/admin/${encodeURIComponent(input.slug)}/instellingen?saved=1`);
}

export async function createLearningSpaceAction(formData: FormData) {
  await requireAdmin();
  let input: ReturnType<typeof learningSpaceInput>;
  try {
    input = learningSpaceInput(formData);
  } catch {
    redirect("/admin/instellingen?error=invalid");
  }
  if (await getLearningSpaceBySlug(input.slug)) redirect("/admin/instellingen?error=duplicate");
  let space;
  try {
    space = await createLearningSpace(input);
  } catch (error) {
    if (isUniqueConstraintError(error)) redirect("/admin/instellingen?error=duplicate");
    throw error;
  }
  revalidatePath("/admin");
  redirect(`/admin/${encodeURIComponent(space.slug)}/instellingen`);
}

export async function createThemeAction(formData: FormData) {
  await requireAdmin();
  const learningSpaceId = stringValue(formData, "learningSpaceId");
  const name = stringValue(formData, "name");
  if (!name || !await getLearningSpace(learningSpaceId)) throw new Error("Ongeldig thema.");
  await createTheme(learningSpaceId, name, Number(stringValue(formData, "sortOrder")) || 0);
  revalidatePath("/admin");
}

export async function saveThemeAction(formData: FormData) {
  await requireAdmin();
  const id = stringValue(formData, "id");
  const learningSpaceId = stringValue(formData, "learningSpaceId");
  const name = stringValue(formData, "name");
  if (!id || !name || !await getLearningSpace(learningSpaceId)) throw new Error("Ongeldig thema.");
  await updateTheme(id, learningSpaceId, name, Number(stringValue(formData, "sortOrder")) || 0);
  revalidatePath("/admin");
}

export async function deleteThemeAction(formData: FormData) {
  await requireAdmin();
  const id = stringValue(formData, "id");
  const learningSpaceId = stringValue(formData, "learningSpaceId");
  if (!id || !await getLearningSpace(learningSpaceId)) throw new Error("Thema niet gevonden.");
  await deleteTheme(id, learningSpaceId);
  revalidatePath("/admin");
}

export async function setPortfolioThemeAction(formData: FormData) {
  await requireAdmin();
  const id = stringValue(formData, "id");
  const learningSpaceId = stringValue(formData, "learningSpaceId");
  const themeId = stringValue(formData, "themeId") || null;
  if (!id || !await getLearningSpace(learningSpaceId)) throw new Error("Portfolio niet gevonden.");
  await setPortfolioTheme(id, learningSpaceId, themeId);
  revalidatePath("/admin");
}

export async function savePortfolioAction(formData: FormData) {
  await requireAdmin();
  const id = stringValue(formData, "id");
  const title = stringValue(formData, "title");
  const mode = portfolioModeSchema.safeParse(stringValue(formData, "mode"));
  const limited = stringValue(formData, "publicationMode") === "limited";
  if (!id || !mode.success || title.length > 180) throw new Error("Ongeldige portfolio-invoer.");
  const existing = await getAdminPortfolioAny(id);
  if (!existing) throw new Error("Portfolio niet gevonden.");
  const window = limited ? parsePublicationWindow(formData) : { publishFrom: existing.publishFrom, publishUntil: existing.publishUntil };
  await Promise.all([setPortfolioTitle(id, title), setPortfolioPublication(id, mode.data, limited, window.publishFrom, window.publishUntil)]);
  refreshPublicationPaths(id);
}

export async function saveSectionPublicationAction(formData: FormData) {
  await requireAdmin();
  const id = stringValue(formData, "id");
  const portfolioId = stringValue(formData, "portfolioId");
  const mode = childModeSchema.safeParse(stringValue(formData, "mode"));
  const limited = stringValue(formData, "publicationMode") === "scheduled";
  if (!id || !portfolioId || !mode.success) throw new Error("Ongeldige onderdeel-invoer.");
  const portfolio = await getAdminPortfolioAny(portfolioId);
  const existing = portfolio?.sections.find((section) => section.id === id);
  if (!existing) throw new Error("Onderdeel niet gevonden.");
  const window = limited ? parsePublicationWindow(formData) : { publishFrom: existing.publishFrom, publishUntil: existing.publishUntil };
  await setSectionPublication(id, mode.data, limited, window.publishFrom, window.publishUntil);
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
  const portfolio = await getAdminPortfolioAny(portfolioId);
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
  const portfolio = await getAdminPortfolioAny(portfolioId);
  if (!portfolio?.sections.some((section) => section.exercises.some((exercise) => exercise.id === id))) throw new Error("Oefening niet gevonden.");
  const window = parsePublicationWindow(formData);
  await setExercisePublication([id], mode.data, window.publishFrom, window.publishUntil);
  refreshPublicationPaths(portfolioId);
}

export async function toggleSectionVisibilityAction(formData: FormData) {
  await requireAdmin();
  const id = stringValue(formData, "id");
  const portfolioId = stringValue(formData, "portfolioId");
  const visible = stringValue(formData, "visible") === "true";
  const portfolio = await getAdminPortfolioAny(portfolioId);
  if (!id || !portfolio?.sections.some((section) => section.id === id)) throw new Error("Onderdeel niet gevonden.");
  await setSectionVisibility(id, visible);
  refreshPublicationPaths(portfolioId);
}

export async function toggleExerciseVisibilityAction(formData: FormData) {
  await requireAdmin();
  const id = stringValue(formData, "id");
  const portfolioId = stringValue(formData, "portfolioId");
  const visible = stringValue(formData, "visible") === "true";
  const portfolio = await getAdminPortfolioAny(portfolioId);
  if (!id || !portfolio?.sections.some((section) => section.exercises.some((exercise) => exercise.id === id))) throw new Error("Oefening niet gevonden.");
  await setExerciseVisibility(id, visible);
  refreshPublicationPaths(portfolioId);
  revalidatePath("/admin/meldingen");
}

export async function toggleExerciseAlternativeVisibilityAction(formData: FormData) {
  await requireAdmin();
  const id = stringValue(formData, "id");
  const portfolioId = stringValue(formData, "portfolioId");
  const visible = stringValue(formData, "visible") === "true";
  const portfolio = await getAdminPortfolioAny(portfolioId);
  const exercise = portfolio?.sections.flatMap((section) => section.exercises).find((item) => item.id === id);
  if (!exercise || !exercise.assets.some((asset) => asset.variant === "alternative" && asset.isIndexed)) throw new Error("Alternatieve uitwerking niet gevonden.");
  await setExerciseAlternativeVisibility(id, visible);
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

export async function errorReportNoteAction(_previousState: AdminActionState, formData: FormData): Promise<AdminActionState & { saved?: boolean }> {
  await requireAdmin();
  const id = stringValue(formData, "id");
  const learningSpaceId = stringValue(formData, "learningSpaceId");
  if (!id) return { error: "Foutmelding niet gevonden." };
  await saveErrorReportNote(id, stringValue(formData, "note"));
  revalidatePath("/admin/meldingen");
  const learningSpace = learningSpaceId ? await getLearningSpace(learningSpaceId) : null;
  if (learningSpace) revalidatePath(`/admin/${encodeURIComponent(learningSpace.slug)}/foutmeldingen`);
  return { error: null, saved: true };
}

export async function deleteErrorReportAction(formData: FormData) {
  await requireAdmin();
  const id = stringValue(formData, "id");
  if (!id) return;
  await deleteErrorReport(id);
  revalidatePath("/admin/meldingen");
  revalidatePath("/admin");
}

export async function deleteOldDoneErrorReportsAction(formData?: FormData) {
  await requireAdmin();
  const learningSpaceId = formData ? stringValue(formData, "learningSpaceId") : undefined;
  await deleteOldDoneErrorReports(undefined, learningSpaceId || undefined);
  revalidatePath("/admin/meldingen");
  revalidatePath("/admin");
}

export async function hideReportedExerciseAction(formData: FormData) {
  await requireAdmin();
  const id = stringValue(formData, "exerciseId");
  const portfolioId = stringValue(formData, "portfolioId");
  if (!id || !portfolioId) return;
  await setExerciseVisibility(id, false);
  refreshPublicationPaths(portfolioId);
  revalidatePath("/admin/meldingen");
}

export async function toggleReportedExerciseVisibilityAction(formData: FormData) {
  await requireAdmin();
  const id = stringValue(formData, "exerciseId");
  const portfolioId = stringValue(formData, "portfolioId");
  const visible = stringValue(formData, "visible") === "true";
  if (!id || !portfolioId) return;
  const portfolio = await getAdminPortfolioAny(portfolioId);
  if (!portfolio?.sections.some((section) => section.exercises.some((exercise) => exercise.id === id))) throw new Error("Oefening niet gevonden.");
  await setExerciseVisibility(id, visible);
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

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && /unique|constraint/i.test(error.message);
}

function learningSpaceInput(formData: FormData): LearningSpaceInput {
  const name = stringValue(formData, "name");
  const slug = stringValue(formData, "slug").toLowerCase();
  const shortLabel = stringValue(formData, "shortLabel");
  const requestedSourceType = stringValue(formData, "sourceType");
  const sourceType: LearningSpaceInput["sourceType"] = requestedSourceType === "onedrive" || requestedSourceType === "google_drive" ? requestedSourceType : "local";
  const localSourcePath = stringValue(formData, "localSourcePath");
  const oneDriveDriveId = stringValue(formData, "oneDriveDriveId");
  const oneDriveFolderId = stringValue(formData, "oneDriveFolderId");
  const oneDriveFolderPath = stringValue(formData, "oneDriveFolderPath");
  const googleDriveFolderId = stringValue(formData, "googleDriveFolderId");
  const googleDriveFolderLabel = stringValue(formData, "googleDriveFolderLabel");
  if (!name || !shortLabel || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Gebruik een unieke URL-veilige slug.");
  const common = { name, slug, shortLabel, sortOrder: Number(stringValue(formData, "sortOrder")) || 0, sourceType };
  if (sourceType === "local") return { ...common, localSourcePath: localSourcePath ? path.resolve(localSourcePath) : null };
  if (sourceType === "onedrive") {
    if (!oneDriveDriveId || !oneDriveFolderId) throw new Error("Vul OneDrive drive- en map-ID in.");
    return { ...common, oneDriveDriveId, oneDriveFolderId, oneDriveFolderPath: oneDriveFolderPath || null };
  }
  if (!googleDriveFolderId || !/^[A-Za-z0-9_-]+$/.test(googleDriveFolderId)) throw new Error("Vul een geldige Google Drive folder-ID in.");
  if (googleDriveFolderLabel.length > 240) throw new Error("Het Google Drive-label is te lang.");
  return { ...common, googleDriveFolderId, googleDriveFolderLabel: googleDriveFolderLabel || null };
}

function refreshPublicationPaths(portfolioId: string) {
  revalidatePath("/");
  revalidatePath(`/portfolio/${portfolioId}`);
  revalidatePath("/admin");
  revalidatePath(`/admin/portfolio/${portfolioId}`);
}

export type { ChildVisibilityMode, PortfolioVisibilityMode };
