# Portfolio Wiskunde

Een read-only index- en publicatielaag voor wiskundeportfolio's. Bronbestanden blijven in een lokale map, OneDrive of Google Drive; de applicatie bewaart alleen metadata, publicatie-instellingen, waarschuwingen, foutmeldingen en versleutelde OAuth-tokens.

De lokaal geaccepteerde V1 staat op Git-tag `v1.0-local-accepted`.

De definitieve productiearchitectuur, Windows/rclone-mirror, completion markers, retentie en recovery staan in [PRODUCTION_RUNBOOK.md](./PRODUCTION_RUNBOOK.md). Voor volledige herinstallatie op een nieuwe Windows-pc, inclusief de actuele scripts en Taakplanner, gebruik je [docs/SETUP-NIEUWE-PC.md](./docs/SETUP-NIEUWE-PC.md). School-OneDrive blijft de bron van waarheid; de webapp bewaart de directe OneDrive-bron en de gecontroleerde persoonlijke Google Drive-mirror afzonderlijk en gebruikt uitsluitend de handmatig gekozen actieve bron.

## Applicatiestructuur

- `/aanmelden` is de eenvoudige Smartschool-login. `/` toont daarna uitsluitend toegankelijke leeromgevingen. `/<spaceSlug>` toont de zichtbare portfolio's per thema; pagina-, document- en oefeningroutes controleren dezelfde LearningSpace-toegang server-side.
- `/admin` is het overzicht van leeromgevingen, met de globale acties **Verbindingen**, **Gebruikers** (alleen hoofdbeheerder) en **Leeromgeving toevoegen**. Binnen een LearningSpace zijn **Portfolio's**, **Thema's**, **Instellingen**, **Toegang** en de **Publieke pagina** beschikbaar.
- Voor een leerling met één LearningSpace verwijst Home rechtstreeks naar die leeromgeving; met meerdere LearningSpaces naar de keuzepagina op `/`. Op smalle schermen vervangt één compacte selector de losse LearningSpace-labels. De beheerknop is uitsluitend zichtbaar voor leraren en hoofdbeheerders.
- Compacte overzichten noemen de actieve primaire configuratie **Bron**. In configuratie en bronvergelijking heten de rollen **Primaire bron** en **Mirror**.

Nieuwe LearningSpaces kiezen standaard OneDrive als provider. Google Drive blijft beschikbaar als mirror of andere expliciete bronconfiguratie; **Lokale bestanden (test)** is uitsluitend voor lokale ontwikkeling en acceptance-tests.

Smartschool OAuth is actief als identity provider. Nieuwe Smartschoolidentiteiten worden lokaal altijd als student aangemaakt; rollen, teacher-memberships en groep-naar-LearningSpace-mappings blijven lokale applicatierechten. De afzonderlijke `/breakglass`-route blijft uitsluitend voor recovery van de compatibility-superadmin. Interne sessies zijn 30 dagen geldig en worden bij actief gebruik rolling vernieuwd; actuele rol en status worden steeds uit de database gelezen. Zie [docs/SMARTSCHOOL-MULTI-USER.md](./docs/SMARTSCHOOL-MULTI-USER.md).

Portfoliofolders volgen `Portfolio <ID> - <titel>`. Ondersteunde ID's zijn numeriek (`2`, `12`), numeriek met letters (`2A`, `12B`) of uitsluitend letters (`X`); parsing is case-insensitive en normaliseert naar uppercase. Oplossingsbestanden gebruiken dezelfde ID in de `PF<ID>-Oef...`-conventie. Overzichten en bronvergelijkingen sorteren deze codes natuurlijk: `2`, `2A`, `2B`, `10`, `12`, daarna `A`, `B`, `X`.

## A. Local development

Vereisten: Node.js 20 of nieuwer en pnpm via Corepack.

1. Voer `pnpm install` uit.
2. Kopieer `.env.example` naar `.env.local`.
3. Vul minstens `ADMIN_PASSWORD` en `ADMIN_SESSION_SECRET` in. Stel `PORTFOLIO_SOURCE_PATH` alleen in wanneer je de lokale testprovider gebruikt.
4. Start met `pnpm dev`.
5. Open `http://localhost:3000/admin` en synchroniseer de gewenste leeromgeving.

Zonder `DATABASE_URL` gebruikt development SQLite in `.data/portfolio.db`, of het pad uit `PORTFOLIO_DATABASE_PATH`. De bron wordt uitsluitend gelezen. `.env*`, `.data` en lokale databases zijn door `.gitignore` uitgesloten; de niet-geheime productieconfiguratie in `vercel.json` wordt bewust wel gevolgd.
### Lokale dummygebruikers

1. Voer `pnpm seed:dev-users` uit tegen de lokale SQLite-database.
2. Start de app met `pnpm dev` en open `http://localhost:3000/dev-login`.
3. Kies een dummyaccount en klik op **Inloggen**; er is geen wachtwoord nodig.

De seed en loginroute zijn uitsluitend voor lokale development. Ze weigeren productie en remote databaseconfiguraties.

## B. Microsoft Entra / OneDrive setup

De app gebruikt een confidential server-side web-app en delegated OAuth. Iedere teacher en hoofdbeheerder kan een eigen persoonlijke OneDrive-verbinding koppelen; het model ondersteunt meerdere persoonlijke storageconnections per user. Per LearningSpace-bron worden de storageconnection, drive-ID en folder-ID afzonderlijk bewaard. Access- en refresh-tokens worden uitsluitend server-side, met AES-256-GCM, in de database opgeslagen. De flow gebruikt authorization code + PKCE.

1. Open het [Microsoft Entra admin center](https://entra.microsoft.com/), kies de juiste schooltenant en ga naar **Entra ID > App registrations > New registration**.
2. Naam: bijvoorbeeld `Portfolio Wiskunde`.
3. Supported account type: **Accounts in this organizational directory only (Single tenant)**.
4. Kies bij Redirect URI het platform **Web** en voeg lokaal toe: `http://localhost:3000/api/onedrive/callback`.
5. Voeg onder **Authentication > Web > Redirect URIs** ook productie toe: `https://<productiedomein>/api/onedrive/callback`. Gebruik exact hetzelfde adres in `MICROSOFT_REDIRECT_URI`.
6. Kopieer op **Overview** de **Directory (tenant) ID** naar `MICROSOFT_TENANT_ID` en de **Application (client) ID** naar `MICROSOFT_CLIENT_ID`.
7. Ga naar **API permissions > Add a permission > Microsoft Graph > Delegated permissions** en voeg uitsluitend `Files.Read` toe. Verwijder een automatisch toegevoegd `User.Read` als dat aanwezig is en verder niet nodig is. Voeg geen `Files.ReadWrite`, `.All` of application permission toe. De app vraagt daarnaast de standaard OAuth-scope `offline_access` om een refresh-token te ontvangen.
8. `Files.Read` vereist volgens Microsoft normaal geen admin consent. Als de schooltenant user consent blokkeert, moet een tenantbeheerder wel **Grant admin consent** uitvoeren.
9. Ga naar **Certificates & secrets > Client secrets > New client secret**. Kies de kortste praktisch beheerbare geldigheidsduur, kopieer de secret value eenmalig naar `MICROSOFT_CLIENT_SECRET` en plan rotatie voor de vervaldatum. Plaats deze waarde nooit in Git, logs of chat.
10. Genereer lokaal 32 willekeurige bytes, base64-codeer die en zet het resultaat als `GRAPH_TOKEN_ENCRYPTION_KEY`. Bewaar deze sleutel blijvend: wijzigen maakt de opgeslagen OAuth-token onleesbaar en vereist opnieuw verbinden.
11. Log na deployment in, open `/admin/verbindingen` en kies **OneDrive verbinden**. De verbinding behoort aan de aangemelde teacher of hoofdbeheerder; opnieuw verbinden vervangt alleen diens versleutelde tokens.

Voor een map in de standaard-OneDrive kun je de drive- en folder-ID opvragen met Microsoft Graph Explorer:

```http
GET https://graph.microsoft.com/v1.0/me/drive/root:/pad/naar/bronmap?$select=id,name,parentReference
```

Gebruik `id` als **OneDrive map-ID** en `parentReference.driveId` als **OneDrive drive-ID**. Vul die waarden per LearningSpace in. Het optionele padveld is alleen een leesbaar administratief label; de runtime gebruikt de stabiele ID's.

Officiele referenties: [app registration](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app), [authorization code + PKCE](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow), [Files.Read](https://learn.microsoft.com/en-us/graph/permissions-reference#filesread) en [OneDrive-items via pad](https://learn.microsoft.com/en-us/graph/api/resources/onedrive?view=graph-rest-1.0).

## B2. Google Drive service-accountsetup

Google Drive gebruikt een app-breed service account en per LearningSpace een eigen root-folder-ID. De credentials blijven uitsluitend in de server-environment; de database en beheerinterface slaan ze niet op.

1. Maak in [Google Cloud Console](https://console.cloud.google.com/) een project of kies een bestaand project.
2. Schakel onder **APIs & Services > Library** de **Google Drive API** in.
3. Maak onder **IAM & Admin > Service Accounts** een service account zonder brede projectrollen.
4. Maak voor dat account onder **Keys > Add key > Create new key** tijdelijk een JSON-keybestand.
5. Base64-codeer het volledige bestand, bijvoorbeeld in PowerShell met `[Convert]::ToBase64String([IO.File]::ReadAllBytes('C:\pad\service-account.json'))`, en plaats uitsluitend het resultaat in `GOOGLE_SERVICE_ACCOUNT_JSON_B64` van `.env.local` of de server-environment.
6. Lees `client_email` uit het JSON-bestand en deel alleen de gewenste persoonlijke Drive-mirrorfolder met dit adres als **Viewer**.
7. Open die map in Google Drive en kopieer het deel na `/folders/` uit de URL als **Google Drive folder-ID** in de LearningSpace-instellingen. Het label/pad is optioneel en alleen administratief.
8. Bewaar de key in een secret manager en verwijder het gedownloade lokale JSON-bestand zodra de environment veilig is ingesteld.

De provider vraagt uitsluitend `https://www.googleapis.com/auth/drive.readonly` aan. Listing start bij de ingestelde root en gebruikt alleen parent-ID's die tijdens die traversal gevonden zijn. Drive-shortcuts worden bewust genegeerd: ze worden niet gevolgd en kunnen dus nooit ongemerkt buiten de gedeelde root leiden.

## C. Production PostgreSQL

Productie weigert bewust te starten zonder een `postgres://` of `postgresql://` `DATABASE_URL`; er is geen fallback naar een lokale of ephemeral databasefile. Local filesystem-bronnen zijn eveneens alleen in development beschikbaar.

1. Maak in Neon een lege PostgreSQL-database in Frankfurt, dicht bij de Vercel-functions in `fra1`.
2. Maak een applicatierol die schema's/tabellen/indexen mag aanmaken en wijzigen en daarna normale DML mag uitvoeren.
3. Kopieer de TLS-verbinding als `DATABASE_URL`; gebruik `sslmode=require` wanneer de provider dat voorschrijft.
4. Maak vóór elke latere schemamigratie een providerbackup of herstelpunt.

Bij de eerste databaseaanroep maakt de app `schema_migrations` aan en voert alle migraties `001_initial` tot en met de huidige `025_editor_student_access_delegation` uit. PostgreSQL-starts worden met een advisory lock geserialiseerd; elke migratie plus versionregistratie draait transactioneel. Een lege database wordt dus automatisch geinitialiseerd wanneer de eerste pagina of login de database gebruikt.

Toekomstige rollout:

1. Maak een databasebackup.
2. Deploy geteste code met een nieuwe, alleen-voorwaartse migration.
3. Laat de eerste runtime-aanroep de migration onder lock uitvoeren.
4. Controleer `schema_migrations`, runtime logs en de smoke test.

Een Vercel code rollback draait databasewijzigingen niet terug. Voor een incompatibele schemarollback is ook het databaseherstelpunt nodig.

## D. Vercel deployment

1. Push de production-readiness commits en tags naar GitHub; GitHub blijft de source of truth.
2. Kies in Vercel **Add New > Project**, importeer de GitHub-repository en laat Framework Preset op **Next.js** staan.
3. Gebruik de repositoryroot als Root Directory. Install en build worden uit `package.json` en `pnpm-lock.yaml` afgeleid.
4. Voeg de variabelen uit sectie E toe aan **Production**. Geef Preview geen productiedatabase of productiesecrets; gebruik voor een echte preview aparte resources.
5. Voeg het gekozen `*.vercel.app`-domein of custom domain als Web redirect URI toe in Entra en zet exact dat callbackadres in `MICROSOFT_REDIRECT_URI`.
6. Deploy of redeploy nadat environment variables zijn gewijzigd. Vercel past gewijzigde variabelen niet toe op bestaande deployments.

De app gebruikt Vercel Hobby met de standaard Node.js-runtime, Server Components, Server Actions en Route Handlers. `vercel.json` zet de projectbrede Function-regio op Frankfurt (`fra1`), naast Neon PostgreSQL in Frankfurt. Er is geen Vercel-specifieke database- of opslag-API toegevoegd.

## E. Environment variables

| Variabele | Productie | Doel |
| --- | --- | --- |
| `DATABASE_URL` | Verplicht | PostgreSQL TLS connection string. |
| `ADMIN_PASSWORD` | Verplicht | Uniek adminwachtwoord, minimaal 16 tekens in production. |
| `ADMIN_SESSION_SECRET` | Verplicht | Aparte willekeurige sessiesleutel, minimaal 32 tekens. |
| `MICROSOFT_TENANT_ID` | Verplicht voor OneDrive | Directory/tenant ID uit Entra. |
| `MICROSOFT_CLIENT_ID` | Verplicht voor OneDrive | Application/client ID uit Entra. |
| `MICROSOFT_CLIENT_SECRET` | Verplicht voor OneDrive | Server-side client secret value. |
| `MICROSOFT_REDIRECT_URI` | Verplicht voor OneDrive | Volledige callback-URL, lokaal of productie. |
| `GRAPH_TOKEN_ENCRYPTION_KEY` | Verplicht voor OneDrive | Base64 van exact 32 willekeurige bytes. |
| `SMARTSCHOOL_CLIENT_ID` | Verplicht voor Smartschool | OAuth client-ID van de platformgebonden Smartschool-client. |
| `SMARTSCHOOL_CLIENT_SECRET` | Verplicht voor Smartschool | Server-only OAuth client secret; nooit client-side gebruiken. |
| `SMARTSCHOOL_PLATFORM_URL` | Verplicht voor Smartschool | HTTPS-origin van het specifieke schoolplatform. |
| `SMARTSCHOOL_REDIRECT_URI` | Verplicht voor Smartschool | Exact geregistreerde callback; productie gebruikt `https://portfoliowiskunde.vercel.app/api/auth/smartschool/callback`. |
| `GOOGLE_SERVICE_ACCOUNT_JSON_B64` | Verplicht voor Google Drive | Base64 van het volledige server-side service-accountkeybestand. |
| `REPORT_RATE_LIMIT_SECRET` | Aanbevolen | Aparte HMAC-sleutel voor foutmeldings-rate-limits; anders wordt de adminsecret gebruikt. |
| `PORTFOLIO_AUTO_SYNC_TTL_SECONDS` | Optioneel | Stale TTL, standaard 180 en minimaal 30 seconden. |
| `PORTFOLIO_SYNC_LEASE_SECONDS` | Optioneel | Databaselease, standaard 600 en minimaal 60 seconden. |
| `PORTFOLIO_SOURCE_PATH` | Alleen development | Configureerbare lokale bronmap. |
| `PORTFOLIO_DATABASE_PATH` | Alleen development | Optioneel SQLite-bestandspad. |

Er is geen `APP_URL` of `BASE_URL` nodig: interne links zijn relatief en OAuth gebruikt de expliciete Microsoft- en Smartschool-redirect-URI's. `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` en `DATABASE_AUTH_TOKEN` blijven alleen beschikbaar voor optionele libSQL-development; Vercel-productie accepteert uitsluitend PostgreSQL.

## F. First production login

1. Open eerst `https://<productiedomein>/`; hiermee wordt de lege database geinitialiseerd.
2. Gebruik normaal Smartschool. Open alleen voor recovery rechtstreeks `/breakglass` en gebruik `ADMIN_PASSWORD`. Deze route staat nergens in de gewone navigatie en kan uitsluitend een sessie voor de compatibility-superadmin maken.
3. Controleer dat uitloggen de sessie intrekt en opnieuw naar login leidt.
4. Wijzig secrets uitsluitend in Vercel en redeploy. Rotatie van `ADMIN_SESSION_SECRET` maakt bestaande cookies onmiddellijk ongeldig.

## G. LearningSpace source folders instellen

Een LearningSpace bewaart maximaal twee onafhankelijke bronconfiguraties: een **primaire bron** en een **mirror**. Exact een daarvan is actief. De normale productieopstelling gebruikt OneDrive als primaire bron en de persoonlijke Google Drive-kopie als mirror, maar de rollen zijn niet aan een providertype gekoppeld. Local filesystem blijft uitsluitend voor development beschikbaar.

1. Open `/admin/verbindingen` en verbind de persoonlijke OneDrive-account wanneer je OneDrive gebruikt.
2. Open elke LearningSpace afzonderlijk via `/admin` en ga naar **Instellingen**.
3. Configureer de primaire bron en schakel desgewenst de mirrorconfiguratie in. Beide rollen kunnen Local filesystem, OneDrive of Google Drive gebruiken.
4. Vul alleen de providervelden van iedere rol in. Google Drive gebruikt de folder-ID en een optioneel herkenbaar label; credentials verschijnen nooit in de UI.
5. Sla op. Configureren wijzigt de actieve rol niet en de twee configuraties overschrijven elkaar niet.
6. Kies **Bronnen vergelijken** voordat je omschakelt. De app scant de andere bron opnieuw en vergelijkt portfolio's, onderdelen en bestanden op logische relatieve paden.
7. Controleer eventuele verschillen en bevestig expliciet **Overschakelen naar mirror** of **Terugschakelen naar primaire bron**.

Bij een technisch probleem, zoals een onbereikbare bron of ongeldige Google completion marker, blijft de actieve bron en de laatst geldige index ongewijzigd. Inhoudsverschillen blokkeren niet, maar vereisen een bewuste bevestiging. Bestaande single-source LearningSpaces worden automatisch als primaire en actieve bron gemigreerd.

Gebruik Local filesystem niet in productie; de server weigert dit bewust omdat Vercel geen blijvende lokale bronmap biedt.

## H. First sync

Kies per LearningSpace **Nu synchroniseren**. Deze actie gebruikt uitsluitend de actieve bron; ze schakelt nooit automatisch naar de andere rol. OneDrive en Google Drive gebruiken alleen read-only list/read/download-aanroepen. De app schrijft of verwijdert nooit bronbestanden. Controleer daarna portfolio's, waarschuwingen en de laatste synchronisatietijd.

Leerlingen kunnen bij een uitwerking een melding indienen met een optionele, vrij ingevulde naam van maximaal 100 tekens. Admin groepeert open meldingen als **PINNED** en **TO DO**; afgewerkte meldingen staan onder **DONE**. PINNED en TO DO kunnen lokaal op datum of natuurlijke portfolio-ID worden gesorteerd en op een portfolio worden gefilterd. De resetknop wist alleen het portfoliofilter. DONE behoudt zijn eigen volgorde en bulkcleanup gebruikt `completedAt < now - 14 dagen`.

Superadmins beheren lokale rollen, userstatus, profielen en accountacties op `/admin/gebruikers`. Lerarenrechten, Smartschoolgroep-mappings en individuele leerlingtoegang worden per LearningSpace beheerd via `/admin/[spaceSlug]/toegang`. Een groupID-koppeling geeft iedere reeds aangemelde leerling met exact die Smartschoolgroep toegang; het overzicht bevat alleen users die minstens één keer via Smartschool zijn aangemeld. Teachers en hoofdbeheerders kunnen een LearningSpace aanmaken en worden daarbij transactioneel eigenaar. Alleen een eigenaar of hoofdbeheerder wijzigt de bronconfiguratie.

Bij een uitzonderlijke Smartschoolstoring kan een superadmin in `/admin/verbindingen` **Publieke noodtoegang** tijdelijk inschakelen. Alleen publiek zichtbare LearningSpaces en inhoud worden dan zonder sessie bereikbaar; groepsfiltering is zonder identiteit niet mogelijk. Adminroutes, bronbeheer en alle publicatie-/visibilityregels blijven server-side beveiligd. De DB-instelling staat standaard uit en toont in beheer duidelijk wanneer ze actief is.

Automatische sync is request-gestuurd:

- een leerlingroute controleert alleen de laatste synctijd in PostgreSQL;
- ouder dan de TTL start een volledige read-only scan voor die LearningSpace;
- dezelfde instance dedupliceert in geheugen en PostgreSQL voorkomt overlap tussen verschillende instances;
- een crash laat een tijdelijke lease achter die automatisch verloopt;
- een fout registreert een failed sync, logt alleen type/context en laat de laatst geldige index aan leerlingen zien;
- de handmatige knop blijft beschikbaar.

Er zijn bewust nog geen Graph webhooks of Vercel cronjobs. Zonder verkeer start geen achtergrondscan; bij de eerstvolgende leerlingrequest na de TTL wordt de bron bijgewerkt.

### Beveiligde assetstreaming

PNG-, JPG- en PDF-bestanden worden via beveiligde applicatieroutes gestreamd. De route controleert eerst LearningSpace, effectieve publicatie, de toggle voor alternatieve uitwerkingen of de adminsessie. Pas na een geslaagde controle opent zij `StorageProvider.openFile()`. Een verborgen of cross-LearningSpace asset bereikt de provider dus niet.

Local filesystem gebruikt een filesystemstream; Google Drive gebruikt server-side `files.get?alt=media`; OneDrive streamt via Microsoft Graph en de tijdelijke download-URL. Een enkele `Range: bytes=...` wordt upstream doorgegeven en resulteert in `206 Partial Content`; HEAD levert dezelfde metadata zonder body. De routes sturen waar beschikbaar `Content-Length`, `Content-Range`, `Accept-Ranges`, `ETag` en `Last-Modified` mee.

Assets gebruiken `Cache-Control: private, no-store, max-age=0`, zodat een latere visibilitywijziging niet door een publieke CDN-cache wordt omzeild. Directe publieke Drive-links worden niet gebruikt: bearer tokens, service-accountcredentials en tijdelijke OneDrive-download-URL's blijven altijd server-side.

## I. Smoke test

Voer na de eerste production sync uit:

1. Open de LearningSpace-URL, bijvoorbeeld `/6`, zonder adminsessie.
2. Controleer een zichtbaar portfolio, onderdeel en oefening.
3. Open PNG/JPG/PDF-uitwerkingen en de opgaven- en eindoplossingen-PDF.
4. Controleer dat verborgen content en directe verborgen asset-URL's 404 geven.
5. Controleer dat alternatieve uitwerkingen alleen voor leerlingen verschijnen wanneer de toggle actief is; adminpreview toont ze altijd.
6. Dien zowel anoniem als met een optionele naam een foutmelding in. Controleer in admin PINNED, TO DO, sorteren op datum/portfolio, filteren op portfolio, notitie, DONE en individuele/bulkdelete.
7. Wijzig een bestand in de gekozen cloudbron, wacht minstens de TTL en open opnieuw een leerlingroute; controleer de nieuwe syncsamenvatting.
8. Maak tijdelijk een ongeldige folder-ID, voer handmatige sync uit en controleer de vriendelijke fout. Herstel de ID en verifieer dat de oude index tijdens de fout beschikbaar bleef.
9. Log uit en controleer dat adminpagina's en admin-assetendpoints niet meer toegankelijk zijn.

## J. Troubleshooting / rollback

Zie voor mirrorfouten, completion markers, `--max-delete 10`, historyherstel, lokale mirrorlogs en laag-voor-laagdiagnose ook [PRODUCTION_RUNBOOK.md](./PRODUCTION_RUNBOOK.md#9-recovery-en-troubleshooting).

- **Databaseconfiguratie ontbreekt:** controleer `DATABASE_URL`, TLS en netwerktoegang; productie valt nooit terug op SQLite.
- **OAuth configuration error:** vergelijk tenant ID, client ID, client secret en de redirect URI teken voor teken met Entra en Vercel.
- **OneDrive connection expired:** kies **OneDrive opnieuw verbinden**. Controleer ook of de client secret nog geldig is.
- **Graph 403:** controleer of de ingelogde gebruiker toegang heeft tot de bron en of delegated `Files.Read` consent kreeg.
- **Google-configuratiefout:** controleer of `GOOGLE_SERVICE_ACCOUNT_JSON_B64` het volledige, geldig base64-gecodeerde JSON-keybestand bevat en herstart de server na een environmentwijziging.
- **Google Drive 403/404:** controleer de folder-ID en deel de rootfolder als Viewer met exact het `client_email` van het service account.
- **Bronwissel geblokkeerd:** controleer de doelconfiguratie en, voor Google Drive, `_mirror-complete.json`. Een mislukte vergelijking of switch laat de actieve bron en bestaande index intact.
- **Bronnen verschillen:** bekijk de paden in de vergelijking. Dit is een inhoudswaarschuwing; na controle kan een admin de switch expliciet bevestigen.
- **Sync al bezig:** wacht tot de actieve run klaar is. Na een crash verloopt de lease standaard na tien minuten.
- **Sync failure:** de laatste geldige index blijft actief. Bekijk Vercel runtime logs en de adminsyncsamenvatting; tokens, passwords en secrets worden niet gelogd.
- **Code rollback:** promote in Vercel een eerdere deployment of revert de Git-commit. Voor de volledig lokaal geaccepteerde baseline bestaat tag `v1.0-local-accepted`.
- **Database rollback:** restore de vooraf gemaakte providerbackup als de oudere code niet met het gemigreerde schema overweg kan.

Kwaliteitscontroles voor elke rollout:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
