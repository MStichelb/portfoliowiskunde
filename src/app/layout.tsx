import type { Metadata } from "next";
import { Source_Sans_3 } from "next/font/google";

import { SiteNavigation } from "@/app/components/site-navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { getAccessibleLearningSpaceIds } from "@/lib/authorization";
import { getLearningSpaces } from "@/lib/repositories";

import "./globals.css";

const sourceSans3 = Source_Sans_3({
  subsets: ["latin"],
  weight: ["400", "700", "800"],
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
  variable: "--font-source-sans-3",
});

export const metadata: Metadata = {
  title: "Portfolio Wiskunde",
  description: "Gepubliceerde wiskunde-uitwerkingen",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getAuthenticatedUser();
  const [spaces, accessibleIds] = await Promise.all([getLearningSpaces(true), getAccessibleLearningSpaceIds(user)]);
  const accessible = spaces.filter((space) => accessibleIds.includes(space.id));
  return (
    <html lang="nl" className={sourceSans3.variable}>
      <body>
        <SiteNavigation spaces={accessible.map(({ slug, name, shortLabel }) => ({ slug, name, shortLabel }))} />
        {children}
      </body>
    </html>
  );
}
