# Production runbook

Dit document beschrijft de actuele productiearchitectuur van Portfolio Wiskunde. De webapp is een read-only index- en publicatielaag: bronbestanden worden uitsluitend buiten de webapp beheerd.

Voor een volledige herinstallatie van de vaste mirror-pc, met copy/paste-scripts, Google OAuth en Windows Taakplanner, zie [docs/SETUP-NIEUWE-PC.md](./docs/SETUP-NIEUWE-PC.md).

## 1. Productiearchitectuur

School-OneDrive is de bron van waarheid. De vaste productieketen is:

```text
School-OneDrive
  -> lokale OneDrive-client op een vaste Windows-pc
  -> rclone eenrichtingsmirror
  -> persoonlijke Google Drive
  -> Google Drive mirror voor Portfolio Wiskunde
```

De webapp bewaart per LearningSpace twee provider-onafhankelijke rollen: **primaire bron** en optionele **mirror**. Exact een geconfigureerde rol is actief. Normaal is de directe OneDrive-provider primair en actief en is Google Drive de mirror. De gewone synchronisatie en alle beveiligde assetroutes gebruiken uitsluitend de actieve rol. Er is geen automatische failover.

In compacte overzichten heet de actieve primaire configuratie **Bron**. Op de instellingen- en vergelijkingspagina gebruikt de UI de volledige rollen **Primaire bron** en **Mirror**.

De persoonlijke Google Drive gebruikt deze structuur:

```text
Portfolio Wiskunde Mirror/
+-- current/
|   +-- 5WIS/
|   +-- 6WIS/
|   `-- <toekomstige LearningSpaces>/
`-- history/
    `-- YYYY-MM-DD/
```

Wanneer Google Drive actief is, leest de webapp per LearningSpace uitsluitend de bijbehorende map onder `current/`. `history/` is nooit een webappbron en wordt niet geindexeerd. De persoonlijke Google Drive is een gecontroleerde mirror en niet de plaats waar dagelijks bronbestanden worden bewerkt.

## 2. Dynamische LearningSpaces

De lokale mirrorroot op de vaste Windows-pc is:

```text
C:\Users\<WINDOWS_USER>\OneDrive\PORTFOLIO
```

Elke directe submap is een afzonderlijke LearningSpace:

```text
PORTFOLIO/
+-- 5WIS/
`-- 6WIS/
```

`mirror.ps1` ontdekt deze directe submappen bij iedere uitvoering. Een nieuwe directe submap wordt automatisch naar `Portfolio Wiskunde Mirror/current/<mapnaam>/` gemirrord; hiervoor hoeft `mirror.ps1` niet te worden aangepast.

De mirror en de applicatieconfiguratie zijn twee afzonderlijke stappen. Nadat een nieuwe map voor het eerst succesvol is gemirrord:

1. maak in **Globaal beheer > Leeromgevingen** een LearningSpace aan;
2. configureer de normale productiebron als primaire bron;
3. voeg Google Drive als mirror toe met de folder-ID van `current/<LearningSpace>`;
4. vergelijk beide bronnen en controleer portfolio's, waarschuwingen en assets;
5. laat de primaire bron actief of voer de gecontroleerde switchflow uit wanneer de mirror nodig is.

## 3. Rclone op de mirror-pc

Rclone leest de lokale OneDrive-root uitsluitend als bron. Het wijzigt, hernoemt of verwijdert daar niets. De rclone-configuratie heeft wel schrijfbevoegdheid op de persoonlijke Google Drive, omdat zij `current/` moet bijwerken en oude doelversies naar `history/` moet verplaatsen.

Per ontdekte directe submap voert het script een eenrichtings-`rclone sync` uit van `PORTFOLIO/<LearningSpace>/` naar `Portfolio Wiskunde Mirror/current/<LearningSpace>/`. De richting wordt nooit omgekeerd.

Dit rclone-account staat los van de webappidentiteit:

- **rclone:** lokale bron read-only, persoonlijke Google Drive mirror read/write;
- **webapp-service-account:** gedeelde mirrorfolder als Viewer en uitsluitend Google-scope `drive.readonly`;
- **webapp:** geen rclone-credentials en geen Google Drive write/delete-aanroepen.

De OAuth-app voor rclone staat definitief **In production / Published**. Laat haar niet in **Testing** staan, omdat een tijdens Testing verleende Drive-refresh-token na zeven dagen kan verlopen. Na een wijziging van Testing naar In production/Published moet de bestaande remote eenmalig opnieuw worden geautoriseerd met `rclone config reconnect gdrive:`; test daarna met `rclone lsd gdrive:` voordat de geplande mirror opnieuw wordt ingeschakeld.

De Windows Taakplanner voert de mirror iedere vijf minuten uit via `mirror-hidden.vbs`, zodat geen PowerShell-venster verschijnt. Configureer bij taakoverlap **Geen nieuw exemplaar starten**. De scripts zijn pc-configuratie en bevatten geen applicatiecode; leg hun absolute locatie vast in de taak. De aanbevolen indeling is:

```text
<mirror-werkmap>/
+-- mirror.ps1
+-- mirror-hidden.vbs
`-- logs/
```

De productieversie van `mirror.ps1` gebruikt onder meer:

- `--backup-dir` om vervangen en verwijderde doelbestanden naar `history/YYYY-MM-DD/` te verplaatsen;
- `--delete-after` zodat doelverwijderingen pas na de kopieerfase gebeuren;
- `--max-delete 10` als veiligheidsstop bij onverwacht veel verwijderingen;
- `--min-age 2m` om bestanden die mogelijk nog worden geschreven niet meteen te spiegelen;
- `--track-renames` om hernoemingen efficient te verwerken;
- excludes voor tijdelijke OneDrive-, Office- en gedeeltelijke bestanden.

Files On-Demand-bestanden moeten op de vaste pc leesbaar zijn. Controleer bij hydrateerproblemen eerst de lokale OneDrive-client. Laat de geplande mirror slechts op deze ene vaste pc draaien; andere computers synchroniseren alleen via de normale school-OneDrive-client.

## 4. Completion markers

Iedere gemirroriseerde LearningSpace heeft een eigen marker:

```text
current/<LearningSpace>/_mirror-complete.json
```

Minimale inhoud:

```json
{
  "completedAt": "2026-08-14T15:20:00.000Z",
  "source": "school-onedrive",
  "status": "complete"
}
```

De mirrorvolgorde is bewust fail-closed:

1. verwijder de oude marker van iedere te verwerken LearningSpace;
2. voer de volledige mirror uit;
3. schrijf de marker alleen nadat de mirror volledig succesvol is afgerond;
4. voer daarna retentiecleanup uit.

Voor iedere Google Drive-indexering leest de webapp eerst de marker in de ingestelde LearningSpace-root. Zij vereist `status === "complete"` en een geldige ISO-datum in `completedAt`. Er geldt bewust geen maximale leeftijd: een oude succesvolle mirror blijft een geldige snapshot wanneer de mirror-pc uit staat.

Bij een ontbrekende, onleesbare of ongeldige marker:

- start geen nieuwe indexering;
- overschrijf of verwijder geen bestaande indexdata;
- blijft de laatst geldige index volledig actief;
- krijgt de admin een gerichte melding dat de mirror niet volledig is.

De marker zelf wordt nooit als portfolio, document of solution asset geindexeerd.

## 5. Retentie

De definitieve retentieperiode is **60 dagen**.

- Rclone verplaatst vervangen en verwijderde doelbestanden naar `history/YYYY-MM-DD/`.
- Na een succesvolle actuele mirror verwijdert het script datum-historymappen ouder dan 60 dagen.
- Alleen mapnamen die exact als een datum kunnen worden geclassificeerd, komen voor automatische cleanup in aanmerking.
- Niet-datum-mappen onder `history/` worden bewust nooit automatisch verwijderd.
- Lokale mirrorlogs ouder dan 60 dagen worden verwijderd.
- Een fout tijdens history- of logcleanup maakt een reeds succesvolle actuele mirror niet ongeldig en verwijdert de nieuwe completion markers niet.
- `history/` en lokale logs mogen handmatig worden verwijderd. Ze zijn afgeleide operationele data en worden niet opnieuw opgebouwd.

Herstel een bestand bij voorkeur naar School-OneDrive, de bron van waarheid, en laat daarna de normale mirror opnieuw lopen. Bewerk `current/` niet als alternatieve master.

## 6. Productiehosting

| Onderdeel | Definitieve productieconfiguratie |
| --- | --- |
| Hosting | Vercel Hobby, Next.js Node.js Functions |
| Compute region | Frankfurt, `fra1`, projectbreed via `vercel.json` |
| Database | Neon PostgreSQL in Frankfurt |
| Bestandsbronnen | Primaire bron en optionele mirror per LearningSpace; exact een actief |
| Google-auth | App-breed service account, mirrorfolder gedeeld als Viewer |
| Lokale opslag | Niet gebruikt in productie |

Productie vereist PostgreSQL. Er is in productie geen fallback naar SQLite, een lokale databasefile of `LocalFilesystemProvider`.

Belangrijke production environment variables, zonder waarden in Git op te nemen:

| Variabele | Gebruik |
| --- | --- |
| `DATABASE_URL` | Neon PostgreSQL TLS-verbinding |
| `ADMIN_PASSWORD` | Uniek productie-adminwachtwoord |
| `ADMIN_SESSION_SECRET` | Afzonderlijke willekeurige sessiesleutel |
| `GOOGLE_SERVICE_ACCOUNT_JSON_B64` | Base64 van het Google service-accountkeybestand |
| `REPORT_RATE_LIMIT_SECRET` | Aanbevolen afzonderlijke sleutel voor foutmeldings-rate-limits |
| `PORTFOLIO_AUTO_SYNC_TTL_SECONDS` | Optionele request-driven sync-TTL |
| `PORTFOLIO_SYNC_LEASE_SECONDS` | Optionele databaselease voor syncoverlap |

De volledig ondersteunde optionele OneDrive/Entra-route gebruikt daarnaast:

- `MICROSOFT_TENANT_ID`;
- `MICROSOFT_CLIENT_ID`;
- `MICROSOFT_CLIENT_SECRET`;
- `MICROSOFT_REDIRECT_URI`;
- `GRAPH_TOKEN_ENCRYPTION_KEY`.

Bewaar secrets uitsluitend in de deploymentomgeving, bij voorkeur als Vercel Sensitive Environment Variables, en redeploy na rotatie.

De applicatie voert migrations automatisch en alleen voorwaarts uit onder database-lock. De huidige keten loopt van `001_initial` tot en met `031_exercise_note_labels`; controleer na een release dat `schema_migrations` deze laatste versie bevat. Migrations 021 tot en met 025 bouwen het multi-usermodel, Smartschool OAuth, toegangsbeheer, legacy ownership en optionele delegatie van leerlingtoegang uit. Migration 026 voegt het optionele portfoliobericht toe; migrations 027 tot en met 029 migreren foutmeldingen additief naar de canonieke thread-, issue- en reportstructuur. Migration 030 voegt optionele plain-textnotities en hun positie toe aan oefeningen; migration 031 voegt het optionele notitielabel toe.

Migration 021 maakt een compatibility-superadmin, koppelt bestaande adminsessies daaraan en verhuist de bestaande versleutelde OneDrive-token uit de generieke settings naar diens persoonlijke storageconnection. Bestaande OneDrive-bronnen worden naar die connection verwezen. Smartschool OAuth is actief; de afzonderlijke wachtwoordlogin blijft alleen als break-glassroute behouden. De actuele multi-userwerking staat in [docs/SMARTSCHOOL-MULTI-USER.md](./docs/SMARTSCHOOL-MULTI-USER.md).

## 7. Storage providers

- **OneDrive:** normale primaire productiebron via Microsoft Entra, delegated OAuth en `Files.Read`.
- **Google Drive:** normale mirror. Elke LearningSpace wijst naar zijn eigen folder onder `current/`.
- **Local filesystem:** uitsluitend voor lokale ontwikkeling en acceptance-tests.

Alle providers implementeren dezelfde read-only `StorageProvider`-grens. De webapp mag bestanden listen, lezen en streamen, maar wijzigt of verwijdert nooit bron- of mirrorbestanden. Publicatie- en adminautorisatie worden gecontroleerd voordat een provider een asset opent.

### Handmatig omschakelen

De primaire en mirrorconfiguratie blijven onafhankelijk in PostgreSQL opgeslagen. Portfolio-ID's, oefening-ID's, publicatieplanning, visibility en foutmeldingen blijven LearningSpace-metadata en worden niet per provider gedupliceerd.

1. Open de instellingen van de LearningSpace en kies **Bronnen vergelijken**.
2. De server initialiseert de niet-actieve provider, voert een verse read-only indexanalyse uit en vergelijkt logische relatieve paden met de huidige geldige index. Provider-item-ID's tellen niet mee.
3. Een onbereikbare of fout geconfigureerde bron blokkeert de switch. Voor Google Drive blokkeert ook een ontbrekende of ongeldige completion marker.
4. Ontbrekende of extra indexeerbare inhoud en waarschuwingen die slechts in een bron voorkomen worden getoond als inhoudsverschillen. Lege structurele containers en identieke waarschuwingen in beide bronnen tellen niet mee.
5. Na bevestiging analyseert de server het doel opnieuw. De doelindex en actieve bron worden in een database-transactie opgeslagen. Pas na een volledig geslaagde transactie gebruiken sync en assetstreaming de nieuwe bron.

De vergelijking berekent daarnaast overlap uitsluitend op genormaliseerde relatieve paden van indexeerbare bestanden. Wanneer beide bronnen minstens vijf bestanden bevatten en minder dan 25% van de unieke bestandspaden overeenkomt, waarschuwt de UI dat mogelijk de verkeerde map is gekoppeld. Dit blijft een inhoudswaarschuwing en geen technische blokkade; omschakelen vereist dan wel een expliciete bevestiging.

Portfolio-ID's blijven provider-onafhankelijke strings. Numerieke, numeriek-alfabetische en alfabetische codes zoals `2`, `2A`, `12B` en `X` worden canoniek uppercase behandeld en natuurlijk gesorteerd. Source comparison vergelijkt dezelfde logische relatieve paden en construeert geen identiteit uit provider-item-ID's.

Oefeningsnotities en hun optionele labels zijn applicatiemetadata in PostgreSQL en kunnen boven of onder de volledige uitwerking verschijnen. Een bron-sync werkt alleen geindexeerde broninhoud bij en behoudt bestaande notitietekst, label en positie.

Er is bewust geen automatische failover of automatische terugschakeling. Een mislukte validatie of persist laat de vorige actieve bron en index volledig intact. Terugschakelen volgt exact dezelfde flow. Bij een actieve Google mirror toont admin de laatst geldige `completedAt` in `Europe/Brussels`.

Bestaande single-source LearningSpaces worden door de database-migratie automatisch als **primaire, actieve bron** opgenomen. Hun huidige provider en configuratie blijven ongewijzigd; er is geen handmatige datamigratie nodig.

## 8. LearningSpace-lifecycle

- **Actief:** publiek resolveerbaar volgens de publicatie-instellingen, beheerbaar en synchroniseerbaar.
- **Archiveren:** verdwijnt uit de leerlingomgeving en synchronisatie stopt; alle instellingen en metadata blijven bewaard.
- **Herstellen:** activeert dezelfde LearningSpace opnieuw met behoud van configuratie en metadata.
- **Permanent verwijderen:** is uitsluitend beschikbaar vanuit de gearchiveerde toestand en vereist bevestiging.

Permanent verwijderen wist alleen LearningSpace-gebonden applicatie- en databasemetadata. Local, OneDrive en Google Drive blijven onaangeraakt.

## 9. Recovery en troubleshooting

### Mirror faalt of marker ontbreekt

De marker blijft afwezig en de webapp weigert de nieuwe indexering. De laatst geldige index blijft actief. Los de mirrorfout op en voer de mirror opnieuw uit; na succes verschijnt een nieuwe marker.

Staat de primaire bron nog actief, dan blokkeert een ontbrekende marker alleen vergelijken of omschakelen naar Google Drive. Staat Google Drive al actief, dan blijft een mislukte gewone sync eveneens fail-closed op de laatst geldige index. De applicatie schakelt nooit zelfstandig van rol.

### Primaire bron tijdelijk onbereikbaar

Open de LearningSpace-instellingen, vergelijk de mirror en controleer `completedAt` en eventuele inhoudsverschillen. Bevestig daarna handmatig **Overschakelen naar mirror**. Wanneer de primaire bron hersteld is, kies **Bronnen vergelijken** en vervolgens **Terugschakelen naar primaire bron**. Bronconfiguraties hoeven daarbij niet opnieuw te worden ingevoerd.

### Meer dan tien onverwachte deletes

`--max-delete 10` stopt rclone. Onderzoek eerst de lokale OneDrive-root, Files On-Demand-status, excludes en rclonelog. Verhoog of omzeil de limiet niet voordat de verwijderingen verklaard zijn.

### Oud of vervangen bestand herstellen

Zoek het bestand onder `history/YYYY-MM-DD/`, herstel het naar de overeenkomstige plaats in School-OneDrive en voer daarna de mirror opnieuw uit. History is herstelhulp, geen tweede bron van waarheid.

### Mirror handmatig uitvoeren

Voer op de vaste pc het script zichtbaar uit om voortgang en fouten te zien:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "<absoluut-pad>\mirror.ps1"
```

Gebruik voor de normale geplande uitvoering `mirror-hidden.vbs`. Start niet gelijktijdig nog een tweede mirror.

### Logs controleren

Controleer de door `mirror.ps1` geconfigureerde lokale `logs`-map. Logs ouder dan 60 dagen kunnen al automatisch verwijderd zijn. Logbestanden bevatten operationele rclone-uitvoer, maar horen geen app-, Google- of databasesleutels te bevatten.

### Google Drive controleren

1. controleer of `current/<LearningSpace>/_mirror-complete.json` bestaat en geldige JSON bevat;
2. controleer de Google Drive folder-ID in de LearningSpace-instellingen;
3. controleer of de juiste mirrorfolder als Viewer gedeeld is met exact het `client_email` uit het service-accountbestand;
4. controleer of `GOOGLE_SERVICE_ACCOUNT_JSON_B64` geldig is en redeploy na een wijziging;
5. bekijk de adminsyncsamenvatting en Vercel Function logs voor een gecontroleerde providerfout.

### Lagen afzonderlijk diagnosticeren

- **School-OneDrive/lokale pc:** bronmap aanwezig, OneDrive-client gezond, bestanden lokaal leesbaar.
- **Rclone:** handmatige run, exitcode, delete-safeguard en lokale mirrorlogs.
- **Google Drive:** `current/`, completion marker, folder sharing en service-accounttoegang.
- **Vercel:** deploymentstatus, `fra1`, environment variables en Function logs.
- **Neon:** Frankfurt-project beschikbaar, `DATABASE_URL`, TLS en databaseverbinding.
- **Webapp:** LearningSpace folder-ID, laatste syncstatus, warnings en bewaarde index.

Een storing in Vercel, Neon of Google Drive kan zo onafhankelijk worden onderzocht zonder School-OneDrive of de mirrorhistoriek te wijzigen.

## 10. Rollout- en smokecheck

Voor iedere production rollout:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Controleer na deployment minimaal:

1. Vercel Functions draaien in `fra1` en Neon bevindt zich in Frankfurt.
2. De publieke LearningSpace-routes laden zonder adminsessie.
3. Een zichtbare PNG/JPG/PDF opent; verborgen directe assetroutes blijven ontoegankelijk.
4. Een handmatige Google Drive-sync accepteert een geldige marker.
5. Een tijdelijk ontbrekende marker geeft een vriendelijke adminfout en behoudt de bestaande index.
6. De vaste Windows-taak maakt na herstel opnieuw markers aan.
7. Een vergelijking met gelijke bronnen geen verschillen toont en een doelverschil expliciete bevestiging vereist.
8. Een switch naar mirror en terug dezelfde publieke URL's, visibility en portfolio-ID's behoudt.
9. Een leerlingmelding zonder en met optionele naam aankomt; admin PINNED/TO DO op datum en portfolio kan sorteren, op een portfolio kan filteren en DONE ongewijzigd beheert.

## 11. Portabiliteit

De kernarchitectuur is bewust niet sterk Vercel-specifiek: Next.js, PostgreSQL, `StorageProvider`-abstracties en environment variables vormen de hoofdgrenzen. Vercel levert momenteel hosting en Functions, maar kan later worden vervangen door een andere Next.js-compatibele host zonder het portfolio-, publicatie- of providerdatamodel opnieuw te ontwerpen.
