# Portfolio Wiskunde

Een lokale, read-only index en publicatielaag voor wiskundeportfolio's. De bronmap blijft de waarheid: deze app leest bestanden en bewaart alleen metadata, zichtbaarheid en synchronisatiewaarschuwingen in een lokale SQLite-database.

## Lokale start

1. Installeer Node.js 20 of nieuwer en pnpm 10 of nieuwer.
2. Open een terminal in deze map en voer `pnpm install` uit.
3. Kopieer `.env.example` naar `.env.local` en kies een eigen `ADMIN_PASSWORD`. Zonder dat wachtwoord is de beheeromgeving bewust niet toegankelijk. `ADMIN_SESSION_SECRET` is aanbevolen wanneer je de app buiten je eigen computer draait.

```dotenv
PORTFOLIO_SOURCE_PATH=C:\Users\mathi\OneDrive - EDUGO Scholengroep\6WIS - Wiskunde\testmapapplicatie
ADMIN_PASSWORD=vervang-door-een-lang-uniek-wachtwoord
# Optioneel maar aanbevolen:
# ADMIN_SESSION_SECRET=vervang-door-een-aparte-lange-geheime-sleutel
# Optioneel: standaard is .data/portfolio.db in deze repository
# PORTFOLIO_DATABASE_PATH=C:\pad\naar\portfolio.db
```

4. Start de app met `pnpm dev`.
5. Open `http://localhost:3000/admin`, log in en kies een leeromgeving.
6. Configureer per leeromgeving de bronmap in **Instellingen** en kies **Nu synchroniseren**. De leerlingweergave staat bijvoorbeeld op `http://localhost:3000/6`.

De SQLite-database wordt automatisch gemaakt in `.data/portfolio.db`. Verwijder uitsluitend die database als je de metadata en alle zichtbaarheidinstellingen lokaal wilt resetten; de bronmap wordt door de applicatie nooit gewijzigd.

## Leeromgevingen en migratie

Migratie `010_learning_spaces` voegt het generieke concept **Leeromgeving** toe. Bestaande portfolio-, publicatie-, oefening-, asset-, warning- en foutmeldingsmetadata wordt veilig gekoppeld aan de initiële leeromgeving **6de jaar** (`/6`). **5de jaar** (`/5`) wordt leeg aangemaakt. Nieuwe ruimtes zijn volledig databasegestuurd: naam, URL-slug, sortering, storageprovider en bronconfiguratie worden via **Beheer > Leeromgevingen beheren** ingesteld.

Elke leeromgeving synchroniseert uitsluitend haar eigen bron. Portfolio-codes mogen daardoor in verschillende leeromgevingen opnieuw voorkomen. Gebruik de canonieke routes `/admin/<slug>` en `/<slug>`; bijvoorbeeld `/admin/6` en `/6`. Thema's, warnings en foutmeldingen worden server-side per ruimte gefilterd.

## Publicatie

Portfolio's, onderdelen en oefeningen hebben elk een expliciete status **Zichtbaar** of **Verborgen**. Een zichtbaar kind wordt pas effectief zichtbaar wanneer alle bovenliggende niveaus ook zichtbaar zijn. De beheeromgeving toont daarom drie effectieve toestanden: **Zichtbaar**, **Wordt zichtbaar** (wacht op een parent of gepland tijdstip) en **Verborgen**. De portfolio-optie **Beperkt zichtbaar** schakelt uitsluitend de bewaarde portfolio-planning in; gewoon **Zichtbaar** negeert die planning zonder datums te verwijderen. Migratie `007_remove_inherit_visibility` zet bestaande `inherit`-waarden veilig om naar `visible`, met behoud van planning en expliciete overrides.

## Synchronisatie

De knop **Synchroniseren** voert onmiddellijk een volledige, read-only indexering uit. Leerlingroutes controleren daarnaast of de laatste succesvolle synchronisatie ouder is dan drie minuten (instelbaar met `PORTFOLIO_AUTO_SYNC_TTL_SECONDS`) en starten dan maximaal een synchronisatie per applicatieproces. Gewone requests lezen uitsluitend de lokale metadata. Nieuwe portfolio's starten verborgen; nieuwe onderdelen en oefeningen nemen hun ouderinstelling over. In een serverless productieomgeving geldt de deduplicatie per actieve instantie; voor striktere, centrale planning kan later een scheduler of provider-delta-sync worden toegevoegd.

## Wat V0.1 herkent

- `Portfolio 3 - Toepassingen van afgeleiden` en lettercodes zoals `Portfolio 3A - ...`
- de opgaven-PDF, eindoplossingen-PDF en de map `Uitwerkingen`
- onderdeelmappen volgens `<nummer> - <titel>`
- uitwerkingen als `PF3-Oef2b.png`, `PF3-Oef2b-alt(1).png`, `PF12-Oef13(2).pdf` en JPG/JPEG-varianten

`-alt` wordt als alternatieve oplossing gegroepeerd; `(1)`, `(2)`, ... zijn stappen binnen dezelfde oplossing. Ongeldige namen en inconsistenties verschijnen als waarschuwingen in het beheer.

## Architectuur

- `src/lib/storage`: providerinterface met read-only `LocalFilesystemProvider` en per leeromgeving geconfigureerde OneDrive-root.
- `src/lib/parser.ts`: pure, geteste naamparser.
- `src/lib/storage/portfolio-indexer.ts`: provider-onafhankelijke herkenning en warnings.
- `src/lib/database.ts` en `src/lib/repositories.ts`: portable lokale SQLite-metadata. Educatieve broninhoud wordt niet gekopieerd.
- `src/lib/auth.ts`: server-side wachtwoordcontrole, ondertekende httpOnly-sessie en bescherming van elke beheeractie.
- `src/app/api/solution-assets/[id]`: levert uitsluitend bestanden van zichtbare portfolio's en oefeningen binnen de geselecteerde leeromgeving.

## Kwaliteitscontroles

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Het verwijderen van een leeromgeving is bewust nog niet als UI-actie beschikbaar: het zou metadata van een hele leeromgeving raken en vereist een expliciete bewaartermijn/archiveringsbeleid. Bronbestanden worden ook dan nooit verwijderd.
