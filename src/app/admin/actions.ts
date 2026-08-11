"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { endAdminSession, requireAdmin } from "@/lib/auth";
import { parseBrusselsDateTime, type ChildVisibilityMode, type PortfolioVisibilityMode } from "@/lib/publication";
import {
  getAdminPortfolio,
  setExercisePublication,
  setPortfolioPublication,
  setPortfolioTitle,
  setSectionPublication,
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

export async function bulkExercisePublicationAction(formData: FormData) {
  await requireAdmin();
  const portfolioId = stringValue(formData, "portfolioId");
  const mode = childModeSchema.safeParse(stringValue(formData, "mode"));
  const requestedIds = formData.getAll("exerciseIds").map(String).filter(Boolean);
  if (!portfolioId || !mode.success || requestedIds.length === 0) throw new Error("Kies minstens een oefening en een geldige status.");
  const portfolio = await getAdminPortfolio(portfolioId);
  if (!portfolio) throw new Error("Portfolio niet gevonden.");
  const validIds = new Set(portfolio.sections.flatMap((section) => section.exercises.map((exercise) => exercise.id)));
  const exerciseIds = [...new Set(requestedIds)].filter((id) => validIds.has(id));
  if (exerciseIds.length !== requestedIds.length) throw new Error("Ongeldige oefeningselectie.");
  const window = parsePublicationWindow(formData);
  await setExercisePublication(exerciseIds, mode.data, window.publishFrom, window.publishUntil);
  refreshPublicationPaths(portfolioId);
}

export async function logoutAction() {
  await endAdminSession();
  redirect("/admin/login");
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
