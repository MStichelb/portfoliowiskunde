/**
 * CHANGELOG-RICHTLIJNEN
 * - Schrijf voor gebruikers, niet voor ontwikkelaars; beschrijf het merkbare effect.
 * - Neem alleen betekenisvolle functies, verbeteringen, gedragswijzigingen en
 *   relevante bugfixes op. Geen refactors, migraties, dependency-updates, tests,
 *   database-indexen of andere voor de doelgroep onzichtbare technische wijzigingen.
 * - Bepaal de doelgroep op basis van gebruikerswaarde, niet van technische
 *   zichtbaarheid. Student alleen bij merkbare, relevante veranderingen voor leerlingen;
 *   bron-, structuur-, sync- en configuratiewijzigingen zijn standaard voor beheer.
 * - notify=true alleen voor wijzigingen die actieve aandacht verdienen.
 *   Niet elke entry hoeft notify=true te hebben.
 * - Eén feature met vele commits hoort doorgaans bij één entry.
 * - Gebruik stabiele, unieke, leesbare ids en ISO-datums (YYYY-MM-DD).
 * - Zet nieuwe entries bovenaan; bij dezelfde datum bepaalt de arrayvolgorde de volgorde.
 * - Niet "Refactored access resolver", maar bijvoorbeeld:
 *   "Toegang tot leeromgevingen is betrouwbaarder geworden."
 */
export type ChangelogAudience = "student" | "teacher" | "superadmin";
export type ChangelogCategory = "new" | "improved" | "fixed" | "changed";
export interface ChangelogEntry {
  id: string;
  date: string;
  category: ChangelogCategory;
  title: string;
  description: string;
  audiences: ChangelogAudience[];
  notify: boolean;
}

export const changelog: ChangelogEntry[] = [{
  id: "2026-10-05-themas-uit-bronmappen",
  date: "2026-10-05",
  category: "new",
  title: "Thema's herkennen uit mappen",
  description: "Een bronprofiel kan nu één mapniveau gebruiken om portfolio's automatisch aan thema's te koppelen. Kies dit in je bronprofiel; het structuurvoorbeeld toont portfolio's binnen thema's én rechtstreeks in de bronmap. Bij deze instelling bepaalt de bronmap het thema; je kunt de indeling niet handmatig overschrijven in de portfolio-instellingen.",
  audiences: ["teacher", "superadmin"],
  notify: true,
}, {
  id: "2026-10-05-oefeningen-op-portfolioniveau",
  date: "2026-10-05",
  category: "improved",
  title: "Portfolio's kunnen eenvoudiger opgebouwd worden",
  description: "Je kunt oefeningen nu ook rechtstreeks in een portfolio plaatsen, zonder verplicht onderdeel. Een portfolio kan directe oefeningen, onderdelen of beide bevatten. Je beheert de oefeningen zoals je gewend bent.",
  audiences: ["teacher", "superadmin"],
  notify: true,
}, {
  id: "2026-10-05-flexibele-onderdeelnummering",
  date: "2026-10-05",
  category: "improved",
  title: "Flexibelere onderdeelnummering",
  description: "Je kunt portfolio's flexibeler structureren met onderdeelcodes zoals 1.1, 1.2 en 2.1. De codes uit de bronmap verschijnen in een logische volgorde: 1.2 komt vóór 1.10.",
  audiences: ["teacher", "superadmin"],
  notify: true,
}, {
  id: "2026-10-05-changelog",
  date: "2026-10-05",
  category: "new",
  title: "Bekijk wat er nieuw is",
  description: "Via het geschiedenisicoon naast je naam zie je recente wijzigingen die voor jou relevant zijn. Een stip laat je weten wanneer er belangrijk nieuws is. Je kunt ook de volledige changelog bekijken.",
  audiences: ["student", "teacher", "superadmin"],
  notify: true,
}];
