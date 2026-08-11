# Portfolio Wiskunde - V0.1

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
5. Open `http://localhost:3000/admin`, log in en kies **Opnieuw synchroniseren**.
6. Zet eerst een portfolio en vervolgens de gewenste oefeningen op zichtbaar. De leerlingweergave staat op `http://localhost:3000`.

De SQLite-database wordt automatisch gemaakt in `.data/portfolio.db`. Verwijder uitsluitend die database als je de metadata en alle zichtbaarheidinstellingen lokaal wilt resetten; de bronmap wordt door de applicatie nooit gewijzigd. Je kunt de lokale bronmap later ook veilig wijzigen in **Beheer > Instellingen**; het pad wordt gevalideerd, maar nooit beschreven.

## Wat V0.1 herkent

- `Portfolio 3 - Toepassingen van afgeleiden` en lettercodes zoals `Portfolio 3A - ...`
- de opgaven-PDF, eindoplossingen-PDF en de map `Uitwerkingen`
- onderdeelmappen volgens `<nummer> - <titel>`
- uitwerkingen als `PF3-Oef2b.png`, `PF3-Oef2b-alt(1).png`, `PF12-Oef13(2).pdf` en JPG/JPEG-varianten

`-alt` wordt als alternatieve oplossing gegroepeerd; `(1)`, `(2)`, ... zijn stappen binnen dezelfde oplossing. Ongeldige namen en inconsistenties verschijnen als waarschuwingen in het beheer.

## Architectuur

- `src/lib/storage`: providerinterface en read-only `LocalFilesystemProvider`; een toekomstige `OneDriveProvider` kan dezelfde interface implementeren.
- `src/lib/parser.ts`: pure, geteste naamparser.
- `src/lib/storage/portfolio-indexer.ts`: provider-onafhankelijke herkenning en warnings.
- `src/lib/database.ts` en `src/lib/repositories.ts`: portable lokale SQLite-metadata. Educatieve broninhoud wordt niet gekopieerd.
- `src/lib/auth.ts`: server-side wachtwoordcontrole, ondertekende httpOnly-sessie en bescherming van elke beheeractie.
- `src/app/api/solution-assets/[id]`: levert uitsluitend bestanden van zichtbare portfolio's en oefeningen, binnen de geconfigureerde bronmap.

## Kwaliteitscontroles

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

V0.1 bevat bewust nog geen Microsoft Graph/OAuth, deployment, Docker, foutmeldingen of adminauth. Die blijven voorzien voor latere V1.0-stappen.
