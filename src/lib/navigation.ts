import type { UserRole } from "@/lib/identity";

export interface NavigationSpace {
  slug: string;
}

export function homeHrefForUser(role: UserRole | null, spaces: NavigationSpace[]): string {
  if (role !== "student") return "/";
  if (spaces.length === 0) return "/geen-leeromgeving";
  if (spaces.length === 1) return `/${encodeURIComponent(spaces[0].slug)}`;
  return "/";
}
