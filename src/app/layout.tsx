import type { Metadata } from "next";
import Link from "next/link";

import "./globals.css";

export const metadata: Metadata = {
  title: "Portfolio Wiskunde",
  description: "Gepubliceerde wiskunde-uitwerkingen",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl">
      <body>
        <nav className="site-nav">
          <Link href="/">Portfolio Wiskunde</Link>
          <Link href="/admin">Beheer</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
