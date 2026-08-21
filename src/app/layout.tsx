import type { Metadata } from "next";

import { SiteNavigation } from "@/app/components/site-navigation";
import { getLearningSpaces } from "@/lib/repositories";

import "./globals.css";

export const metadata: Metadata = {
  title: "Portfolio Wiskunde",
  description: "Gepubliceerde wiskunde-uitwerkingen",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const spaces = await getLearningSpaces(true);
  return (
    <html lang="nl">
      <body>
        <SiteNavigation spaces={spaces.map(({ slug, name }) => ({ slug, name }))} />
        {children}
      </body>
    </html>
  );
}
