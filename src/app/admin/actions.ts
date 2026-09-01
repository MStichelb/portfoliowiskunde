"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import path from "node:path";
import { z } from "zod";

import { endAdminSession, requireAdmin, requireAdminUser } from "@/lib/auth";
import { bulkSelectionError } from "@/lib/admin-validation";
import { requireLearningSpaceConfiguration, requireLearningSpaceCreation, requireLearningSpaceManagement } from "@/lib/authorization";
import { canPermanentlyDeleteLearningSpace } from "@/lib/learning-space-lifecycle";
import { parseBrusselsDateTime, type ChildVisibilityMode, type PortfolioVisibilityMode } from "@/lib/publication";
import {
  getAdminPortfolioAny,
  getErrorReportLearningSpaceId,
  getAdminLearningSpaceBySlug,
  archiveLearningSpace,
  createLearningSpace,
  createTheme,
  deleteTheme,
  getLearningSpace,
  updateLearningSpace,
  updateTheme,
  setExercisePublication,
  setExerciseVisibility,
  setExerciseAlternativeVisibility,
  setPortfolioPublication,
  setPortfolioTitle,
  setPortfolioCardColor,
  setPortfolioTheme,
  setErrorReportStatus,
  saveErrorReportNote,
  deleteErrorReport,
  deleteOldDoneErrorReports,
  setSectionPublication,
  setSectionVisibility,
  toggleErrorReportPin,
  archiveMissingIndexItems,
  permanentlyDeleteLearningSpace,
  restoreLearningSpace,
  type LearningSpaceInput,
  type LearningSpaceSourceInput,
} from "@/lib/repositories";
import { DEFAULT_LEARNING_SPACE_COLOR, DEFAULT_LEARNING_SPACE_DESCRIPTION, DEFAULT_PORTFOLIO_COLOR, isHexColor, normalizeHexColor } from "@/lib/ui-colors";
import { compareLearningSpaceSources, switchLearningSpaceSource, type SourceSwitchPreview } from "@/lib/source-switch";
import { synchronizeSource } from "@/lib/sync";
import { userFacingSourceError } from "@/lib/source-errors";
import { ensureStorageConnection } from "@/lib/storage-connections";

const childModeSchema = z.enum(["hidden", "visible"]);
const portfolioModeSchema = z.enum(["hidden", "visible"]);
export interface AdminActionState { error: string | null; }
export interface SourceSwitchActionState extends AdminActionState { preview?: SourceSwitchPreview; switched?: boolean; }

export async function syncAction() {
  await requireAdmin();
  await synchronizeSource();
  revalidatePath("/");
  revalidatePath("/admin");
}

export async function syncSpaceAction(_previousState: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const learningSpaceId = stringValue(formData, "learningSpaceId");
  await requireSpaceManagement(learningSpaceId);
  const space = await getLearningSpace(learningSpaceId);
  if (!space) return { error: "Leeromgeving niet gevonden." };
  if (!space.isActive) return { error: "Deze leeromgeving is gearchiveerd en kan niet worden gesynchroniseerd." };
  try {
    const result = await synchronizeSource(learningSpaceId);
    if (result.skipped) return { error: "skipReason" in result && result.skipReason === "archived"
      ? "Deze leeromgeving is gearchiveerd en kan niet worden gesynchroniseerd."
      : "Er loopt al een synchronisatie voor deze leeromgeving." };
  } catch (error) {
    const message = userFacingSourceError(error);
    if (message) return { error: message };
    throw error;
  }
  revalidatePath("/admin");
  return { error: null };
}

export async function compareSourcesAction(_previousState: SourceSwitchActionState, formData: FormData): Promise<SourceSwitchActionState> {
  const learningSpaceId = stringValue(formData, "learningSpaceId");
  await requireSpaceConfiguration(learningSpaceId);
  const targetSourceId = stringValue(formData, "targetSourceId");
  if (!learningSpaceId || !targetSourceId) return { error: "Switchdoel ontbreekt." };
  try {
    const preview = await compareLearningSpaceSources(learningSpaceId, targetSourceId);
    return { error: null, preview };
  } catch (error) {
    return { error: userFacingSourceError(error) ?? (error instanceof Error ? error.message : "De bron kon niet worden gecontroleerd.") };
  }
}

export async function switchSourceAction(_previousState: SourceSwitchActionState, formData: FormData): Promise<SourceSwitchActionState> {
  const learningSpaceId = stringValue(formData, "learningSpaceId");
  await requireSpaceConfiguration(learningSpaceId);
  const targetSourceId = stringValue(formData, "targetSourceId");
  if (!learningSpaceId || !targetSourceId) return { error: "Switchdoel ontbreekt." };
  try {
    const result = await switchLearningSpaceSource(learningSpaceId, targetSourceId, true);
    revalidatePath("/");
    revalidatePath("/admin");
    revalidatePath("/admin/instellingen");
    const space = await getLearningSpace(learningSpaceId);
    if (space) revalidatePath(`/admin/${encodeURIComponent(space.slug)}`);
    return { error: null, preview: result, switched: result.switched };
  } catch (error) {
    return { error: userFacingSourceError(error) ?? (error instanceof Error ? error.message : "Overschakelen is niet gelukt.") };
  }
}

export async function archiveMissingIndexAction(formData: FormData) {
  const learningSpaceId = stringValue(formData, "learningSpaceId");
  await requireSpaceManagement(learningSpaceId);
  if (!await getLearningSpace(learningSpaceId)) return;
  await archiveMissingIndexItems(learningSpaceId);
  revalidatePath("/admin");
}

export async function archiveLearningSpaceAction(formData: FormData) {
  await requireAdmin();
  const id = stringValue(formData, "id");
  if (!id || !await getLearningSpace(id)) return;
  await archiveLearningSpace(id);
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/instellingen");
  redirect("/admin/instellingen");
}

export async function restoreLearningSpaceAction(formData: FormData) {
  await requireAdmin();
  const id = stringValue(formData, "id");
  if (!id || !await getLearningSpace(id)) return;
  await restoreLearningSpace(id);
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/instellingen");
  redirect("/admin/instellingen");
}

export async function permanentlyDeleteLearningSpaceAction(formData: FormData) {
  await requireAdmin();
  const id = stringValue(formData, "id");
  const confirmationSlug = stringValue(formData, "confirmationSlug");
  const space = id ? await getLearningSpace(id) : null;
  if (!space || confirmationSlug !== space.slug) return;
  if (!canPermanentlyDeleteLearningSpace(space)) redirect("/admin/instellingen?error=archive-before-delete");
  if (!await permanentlyDeleteLearningSpace(id)) redirect("/admin/instellingen?error=delete-failed");
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/instellingen");
  redirect("/admin/instellingen");
}

export async function saveLearningSpaceAction(_previousState: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const id = stringValue(formData, "id");
  const admin = await requireSpaceConfiguration(id);
  const existing = await getLearningSpace(id);
  if (!existing) return { error: "Leeromgeving niet gevonden." };
  let input: ReturnType<typeof learningSpaceInput>;
  try {
    input = learningSpaceInput(formData);
    input = await assignOwnedStorageConnections(input, admin.id, existing);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "De instellingen zijn ongeldig." };
  }
  const matchingSlug = await getAdminLearningSpaceBySlug(input.slug);
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
  const admin = await requireAdminUser();
  requireLearningSpaceCreation(admin);
  let input: ReturnType<typeof learningSpaceInput>;
  try {
    input = learningSpaceInput(formData);
    input = await assignOwnedStorageConnections(input, admin.id);
  } catch {
    redirect("/admin/instellingen?error=invalid");
  }
  if (await getAdminLearningSpaceBySlug(input.slug)) redirect("/admin/instellingen?error=duplicate");
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
  const learningSpaceId = stringValue(formData, "learningSpaceId");
  await requireSpaceManagement(learningSpaceId);
  const name = stringValue(formData, "name");
  if (!name || !await getLearningSpace(learningSpaceId)) throw new Error("Ongeldig thema.");
  await createTheme(learningSpaceId, name, Number(stringValue(formData, "sortOrder")) || 0);
  revalidatePath("/admin");
}

export async function saveThemeAction(formData: FormData) {
  const id = stringValue(formData, "id");
  const learningSpaceId = stringValue(formData, "learningSpaceId");
  await requireSpaceManagement(learningSpaceId);
  const name = stringValue(formData, "name");
  if (!id || !name || !await getLearningSpace(learningSpaceId)) throw new Error("Ongeldig thema.");
  await updateTheme(id, learningSpaceId, name, Number(stringValue(formData, "sortOrder")) || 0);
  revalidatePath("/admin");
}

export async function deleteThemeAction(formData: FormData) {
  const id = stringValue(formData, "id");
  const learningSpaceId = stringValue(formData, "learningSpaceId");
  await requireSpaceManagement(learningSpaceId);
  if (!id || !await getLearningSpace(learningSpaceId)) throw new Error("Thema niet gevonden.");
  await deleteTheme(id, learningSpaceId);
  revalidatePath("/admin");
}

export async function setPortfolioThemeAction(formData: FormData) {
  const id = stringValue(formData, "id");
  const learningSpaceId = stringValue(formData, "learningSpaceId");
  await requireSpaceManagement(learningSpaceId);
  const themeId = stringValue(formData, "themeId") || null;
  if (!id || !await getLearningSpace(learningSpaceId)) throw new Error("Portfolio niet gevonden.");
  await setPortfolioTheme(id, learningSpaceId, themeId);
  revalidatePath("/admin");
}

export async function savePortfolioAction(formData: FormData) {
  const id = stringValue(formData, "id");
  const title = stringValue(formData, "title");
  const mode = portfolioModeSchema.safeParse(stringValue(formData, "mode"));
  const limited = stringValue(formData, "publicationMode") === "limited";
  const cardColorInput = stringValue(formData, "cardColor");
  if (!id || !mode.success || title.length > 180 || !isHexColor(cardColorInput)) throw new Error("Ongeldige portfolio-invoer.");
  const existing = await getAdminPortfolioAny(id);
  if (!existing) throw new Error("Portfolio niet gevonden.");
  await requireSpaceManagement(existing.learningSpaceId);
  const window = limited ? parsePublicationWindow(formData) : { publishFrom: existing.publishFrom, publishUntil: existing.publishUntil };
  await Promise.all([setPortfolioTitle(id, title), setPortfolioCardColor(id, normalizeHexColor(cardColorInput, DEFAULT_PORTFOLIO_COLOR)), setPortfolioPublication(id, mode.data, limited, window.publishFrom, window.publishUntil)]);
  refreshPublicationPaths(id);
}

export async function saveSectionPublicationAction(formData: FormData) {
  const id = stringValue(formData, "id");
  const portfolioId = stringValue(formData, "portfolioId");
  const mode = childModeSchema.safeParse(stringValue(formData, "mode"));
  const limited = stringValue(formData, "publicationMode") === "scheduled";
  if (!id || !portfolioId || !mode.success) throw new Error("Ongeldige onderdeel-invoer.");
  const portfolio = await getAdminPortfolioAny(portfolioId);
  if (portfolio) await requireSpaceManagement(portfolio.learningSpaceId);
  const existing = portfolio?.sections.find((section) => section.id === id);
  if (!existing) throw new Error("Onderdeel niet gevonden.");
  const window = limited ? parsePublicationWindow(formData) : { publishFrom: existing.publishFrom, publishUntil: existing.publishUntil };
  await setSectionPublication(id, mode.data, limited, window.publishFrom, window.publishUntil);
  refreshPublicationPaths(portfolioId);
}

export async function bulkExercisePublicationAction(_previousState: { error: string | null }, formData: FormData): Promise<{ error: string | null }> {
  const portfolioId = stringValue(formData, "portfolioId");
  const mode = childModeSchema.safeParse(stringValue(formData, "mode"));
  const requestedIds = formData.getAll("exerciseIds").map(String).filter(Boolean);
  const emptySelection = bulkSelectionError(requestedIds.length);
  if (emptySelection) return { error: emptySelection };
  if (!portfolioId || !mode.success) return { error: "Kies een geldige publicatiestatus." };
  const portfolio = await getAdminPortfolioAny(portfolioId);
  if (!portfolio) return { error: "Portfolio niet gevonden." };
  await requireSpaceManagement(portfolio.learningSpaceId);
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
  const id = stringValue(formData, "id");
  const portfolioId = stringValue(formData, "portfolioId");
  const mode = childModeSchema.safeParse(stringValue(formData, "mode"));
  if (!id || !portfolioId || !mode.success) throw new Error("Ongeldige oefening-invoer.");
  const portfolio = await getAdminPortfolioAny(portfolioId);
  if (portfolio) await requireSpaceManagement(portfolio.learningSpaceId);
  if (!portfolio?.sections.some((section) => section.exercises.some((exercise) => exercise.id === id))) throw new Error("Oefening niet gevonden.");
  const window = parsePublicationWindow(formData);
  await setExercisePublication([id], mode.data, window.publishFrom, window.publishUntil);
  refreshPublicationPaths(portfolioId);
}

export async function toggleSectionVisibilityAction(formData: FormData) {
  const id = stringValue(formData, "id");
  const portfolioId = stringValue(formData, "portfolioId");
  const visible = stringValue(formData, "visible") === "true";
  const portfolio = await getAdminPortfolioAny(portfolioId);
  if (portfolio) await requireSpaceManagement(portfolio.learningSpaceId);
  if (!id || !portfolio?.sections.some((section) => section.id === id)) throw new Error("Onderdeel niet gevonden.");
  await setSectionVisibility(id, visible);
  refreshPublicationPaths(portfolioId);
}

export async function toggleExerciseVisibilityAction(formData: FormData) {
  const id = stringValue(formData, "id");
  const portfolioId = stringValue(formData, "portfolioId");
  const visible = stringValue(formData, "visible") === "true";
  const portfolio = await getAdminPortfolioAny(portfolioId);
  if (portfolio) await requireSpaceManagement(portfolio.learningSpaceId);
  if (!id || !portfolio?.sections.some((section) => section.exercises.some((exercise) => exercise.id === id))) throw new Error("Oefening niet gevonden.");
  await setExerciseVisibility(id, visible);
  refreshPublicationPaths(portfolioId);
  revalidatePath("/admin/meldingen");
}

export async function toggleExerciseAlternativeVisibilityAction(formData: FormData) {
  const id = stringValue(formData, "id");
  const portfolioId = stringValue(formData, "portfolioId");
  const visible = stringValue(formData, "visible") === "true";
  const portfolio = await getAdminPortfolioAny(portfolioId);
  if (portfolio) await requireSpaceManagement(portfolio.learningSpaceId);
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
  const id = stringValue(formData, "id");
  await requireErrorReportManagement(id);
  const status = stringValue(formData, "status");
  if (!id || (status !== "TODO" && status !== "DONE")) throw new Error("Ongeldige meldingsstatus.");
  await setErrorReportStatus(id, status);
  revalidatePath("/admin/meldingen");
  revalidatePath("/admin");
}

export async function errorReportPinAction(formData: FormData) {
  const id = stringValue(formData, "id");
  await requireErrorReportManagement(id);
  if (!id) return;
  await toggleErrorReportPin(id);
  revalidatePath("/admin/meldingen");
}

export async function errorReportNoteAction(_previousState: AdminActionState, formData: FormData): Promise<AdminActionState & { saved?: boolean }> {
  const id = stringValue(formData, "id");
  const learningSpaceId = stringValue(formData, "learningSpaceId");
  if (!id) return { error: "Foutmelding niet gevonden." };
  const reportLearningSpaceId = await requireErrorReportManagement(id);
  if (reportLearningSpaceId !== learningSpaceId) return { error: "Foutmelding niet gevonden." };
  await saveErrorReportNote(id, stringValue(formData, "note"));
  revalidatePath("/admin/meldingen");
  const learningSpace = learningSpaceId ? await getLearningSpace(learningSpaceId) : null;
  if (learningSpace) revalidatePath(`/admin/${encodeURIComponent(learningSpace.slug)}/foutmeldingen`);
  return { error: null, saved: true };
}

export async function deleteErrorReportAction(formData: FormData) {
  const id = stringValue(formData, "id");
  await requireErrorReportManagement(id);
  if (!id) return;
  await deleteErrorReport(id);
  revalidatePath("/admin/meldingen");
  revalidatePath("/admin");
}

export async function deleteOldDoneErrorReportsAction(formData?: FormData) {
  const learningSpaceId = formData ? stringValue(formData, "learningSpaceId") : undefined;
  if (learningSpaceId) await requireSpaceManagement(learningSpaceId);
  else await requireAdmin();
  await deleteOldDoneErrorReports(undefined, learningSpaceId || undefined);
  revalidatePath("/admin/meldingen");
  revalidatePath("/admin");
}

export async function hideReportedExerciseAction(formData: FormData) {
  const id = stringValue(formData, "exerciseId");
  const portfolioId = stringValue(formData, "portfolioId");
  await requirePortfolioManagement(portfolioId);
  if (!id || !portfolioId) return;
  await setExerciseVisibility(id, false);
  refreshPublicationPaths(portfolioId);
  revalidatePath("/admin/meldingen");
}

export async function toggleReportedExerciseVisibilityAction(formData: FormData) {
  const id = stringValue(formData, "exerciseId");
  const portfolioId = stringValue(formData, "portfolioId");
  await requirePortfolioManagement(portfolioId);
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

async function requireSpaceManagement(learningSpaceId: string) {
  const user = await requireAdminUser();
  if (!learningSpaceId) throw new Error("Leeromgeving niet gevonden.");
  await requireLearningSpaceManagement(user, learningSpaceId);
  return user;
}

async function requireSpaceConfiguration(learningSpaceId: string) {
  const user = await requireAdminUser();
  if (!learningSpaceId) throw new Error("Leeromgeving niet gevonden.");
  await requireLearningSpaceConfiguration(user, learningSpaceId);
  return user;
}

async function requirePortfolioManagement(portfolioId: string) {
  const portfolio = portfolioId ? await getAdminPortfolioAny(portfolioId) : null;
  if (!portfolio) throw new Error("Portfolio niet gevonden.");
  await requireSpaceManagement(portfolio.learningSpaceId);
  return portfolio;
}

async function requireErrorReportManagement(id: string) {
  const learningSpaceId = id ? await getErrorReportLearningSpaceId(id) : null;
  if (!learningSpaceId) throw new Error("Foutmelding niet gevonden.");
  await requireSpaceManagement(learningSpaceId);
  return learningSpaceId;
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
  const description = stringValue(formData, "description") || DEFAULT_LEARNING_SPACE_DESCRIPTION;
  const cardColorInput = stringValue(formData, "cardColor");
  const hasRoleSources = Boolean(formData.get("primaryProviderType"));
  const requestedSourceType = stringValue(formData, hasRoleSources ? "primaryProviderType" : "sourceType");
  const sourceType: LearningSpaceInput["sourceType"] = parseProviderType(requestedSourceType);
  const localSourcePath = stringValue(formData, "localSourcePath");
  const oneDriveDriveId = stringValue(formData, "oneDriveDriveId");
  const oneDriveFolderId = stringValue(formData, "oneDriveFolderId");
  const oneDriveFolderPath = stringValue(formData, "oneDriveFolderPath");
  const googleDriveFolderId = stringValue(formData, "googleDriveFolderId");
  const googleDriveFolderLabel = stringValue(formData, "googleDriveFolderLabel");
  if (!name || !shortLabel || description.length > 240 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Gebruik geldige algemene instellingen.");
  if (cardColorInput && !isHexColor(cardColorInput)) throw new Error("Kies een geldige kaartkleur.");
  const common = { name, slug, shortLabel, description, cardColor: normalizeHexColor(cardColorInput, DEFAULT_LEARNING_SPACE_COLOR), sortOrder: Number(stringValue(formData, "sortOrder")) || 0, sourceType };
  if (!hasRoleSources) {
    if (sourceType === "local") return { ...common, localSourcePath: localSourcePath ? path.resolve(localSourcePath) : null };
    if (sourceType === "onedrive") {
      if (!oneDriveDriveId || !oneDriveFolderId) throw new Error("Vul OneDrive drive- en map-ID in.");
      return { ...common, oneDriveDriveId, oneDriveFolderId, oneDriveFolderPath: oneDriveFolderPath || null };
    }
    if (!googleDriveFolderId || !/^[A-Za-z0-9_-]+$/.test(googleDriveFolderId)) throw new Error("Vul een geldige Google Drive folder-ID in.");
    if (googleDriveFolderLabel.length > 240) throw new Error("Het Google Drive-label is te lang.");
    return { ...common, googleDriveFolderId, googleDriveFolderLabel: googleDriveFolderLabel || null };
  }
  const primarySource = roleSourceInput(formData, "primary", true)!;
  const mirrorSource = formData.get("mirrorEnabled") === "true" ? roleSourceInput(formData, "mirror", true) : null;
  return { ...common, primarySource, mirrorSource };
}

function roleSourceInput(formData: FormData, prefix: "primary" | "mirror", required: boolean): LearningSpaceSourceInput | null {
  const providerValue = stringValue(formData, `${prefix}ProviderType`);
  if (!providerValue && !required) return null;
  const providerType = parseProviderType(providerValue);
  if (providerType === "local") {
    const sourcePath = stringValue(formData, `${prefix}LocalSourcePath`);
    return { providerType, localSourcePath: sourcePath ? path.resolve(sourcePath) : null };
  }
  if (providerType === "onedrive") {
    const driveId = stringValue(formData, `${prefix}OneDriveDriveId`);
    const folderId = stringValue(formData, `${prefix}OneDriveFolderId`);
    if (!driveId || !folderId) throw new Error(`Vul voor de ${prefix === "primary" ? "primaire bron" : "mirror"} de OneDrive drive- en map-ID in.`);
    return { providerType, oneDriveDriveId: driveId, oneDriveFolderId: folderId, oneDriveFolderPath: stringValue(formData, `${prefix}OneDriveFolderPath`) || null };
  }
  const folderId = stringValue(formData, `${prefix}GoogleDriveFolderId`);
  const label = stringValue(formData, `${prefix}GoogleDriveFolderLabel`);
  if (!folderId || !/^[A-Za-z0-9_-]+$/.test(folderId)) throw new Error(`Vul voor de ${prefix === "primary" ? "primaire bron" : "mirror"} een geldige Google Drive folder-ID in.`);
  if (label.length > 240) throw new Error("Het Google Drive-label is te lang.");
  return { providerType, googleDriveFolderId: folderId, googleDriveFolderLabel: label || null };
}

function parseProviderType(value: string): LearningSpaceInput["sourceType"] {
  if (value === "onedrive" || value === "google_drive") return value;
  return "local";
}

async function assignOwnedStorageConnections(
  input: LearningSpaceInput,
  userId: string,
  existing?: Awaited<ReturnType<typeof getLearningSpace>> | null,
): Promise<LearningSpaceInput> {
  const withConnection = async (
    source: LearningSpaceSourceInput,
    current: NonNullable<typeof existing>["primarySource"] | undefined | null,
  ): Promise<LearningSpaceSourceInput> => {
    if (source.providerType !== "onedrive" || source.storageConnectionId) return source;
    if (current?.providerType === "onedrive" && current.storageConnectionId) {
      return { ...source, storageConnectionId: current.storageConnectionId };
    }
    const connection = await ensureStorageConnection(userId, "onedrive");
    return { ...source, storageConnectionId: connection.id };
  };

  if (!input.primarySource) {
    if (input.sourceType !== "onedrive" || input.storageConnectionId) return input;
    const current = existing?.primarySource;
    const storageConnectionId = current?.providerType === "onedrive" && current.storageConnectionId
      ? current.storageConnectionId
      : (await ensureStorageConnection(userId, "onedrive")).id;
    return { ...input, storageConnectionId };
  }

  return {
    ...input,
    primarySource: await withConnection(input.primarySource, existing?.primarySource),
    mirrorSource: input.mirrorSource
      ? await withConnection(input.mirrorSource, existing?.mirrorSource)
      : input.mirrorSource,
  };
}

function refreshPublicationPaths(portfolioId: string) {
  revalidatePath("/");
  revalidatePath(`/portfolio/${portfolioId}`);
  revalidatePath("/admin");
  revalidatePath(`/admin/portfolio/${portfolioId}`);
}

export type { ChildVisibilityMode, PortfolioVisibilityMode };
