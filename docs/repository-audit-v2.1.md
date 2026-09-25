# Repository-audit Portfolio-app v2.1

Auditdatum: 25 september 2026
Onderzochte basis: commit `ace1679` op branch `feature/source-profiles`, aangevuld met de op dat moment aanwezige niet-gecommitteerde bronstructuur-preview. De productaanduiding “v2.1” staat niet in `package.json`; daar staat nog `0.1.0` (`package.json:3`).

Deze audit beschrijft de bestaande code. Er zijn geen functionaliteit, migraties of refactors toegevoegd. Statuslabels in dit document betekenen:

- **Geïmplementeerd en getest**: er is een volledige uitvoeringsroute en gerichte testdekking.
- **Gedeeltelijk / ondergetest**: bruikbare onderdelen bestaan, maar de gebruikersflow, integratie of essentiële invariant is onvolledig.
- **Voorbereid, niet functioneel**: model- of servicelogica bestaat, maar is niet bereikbaar of heeft geen complete productflow.
- **Afwezig**: er is geen passend datamodel of uitvoeringspad.

## 1. Managementsamenvatting

De applicatie heeft een bruikbare basis voor verdere uitbreiding: Next.js App Router met servercomponents en server actions, centrale autorisatie, PostgreSQL in productie, een providerabstractie voor lokale bestanden, OneDrive en Google Drive, versieerbare bronprofielen en een transactionele index/reconciliatielaag. De belangrijkste ontwerpsterkte is dat applicatiemetadata niet uit bestandsnamen wordt afgeleid of bij iedere synchronisatie wordt overschreven. Portfolio-, sectie- en oefeningrecords worden op een logische sleutel teruggevonden en scanner-eigenschappen worden via upserts bijgewerkt.

De belangrijkste grens is dat “stabiel” momenteel precies betekent:

- portfolio: `learning_space_id + portfolio_code`;
- sectie: `portfolio_id + sort_order`;
- oefening: `section_id + exercise_code`;
- generieke resource: `learning_space_id + scope + resource_id + provider source_id`;
- historische `solution_assets`: `variant_id + relative_path`.

Daarom blijven zichtbaarheid, planning, titeloverride, kleur, notities en foutmeldingsrelaties behouden bij een gewone resync en bij een bronwissel met dezelfde logische structuur. Ze blijven niet vanzelf behouden wanneer een portfoliocode wijzigt, een sectie wordt hernummerd, een oefening naar een andere sectie verhuist of wordt hernummerd. Een bestandsrename is voor generieke OneDrive/Google Drive-resources doorgaans veilig omdat het provider-item-ID stabiel blijft; voor historische `solution_assets` is de identiteit nog padgebaseerd.

Stand van de zeven uitbreidingsgebieden:

1. **Configureerbare bronprofielen/documentresources — geïmplementeerd en getest**, inclusief globale resources, oefeningsresources, file/directory/mixed scanning, templates, kopieën en gedeeld gebruik. Portfolio- en sectieherkenning blijven hard gecodeerd. De nieuwe visuele mapstructuur-preview bestaat alleen in de niet-gecommitteerde werkboom.
2. **Oefeningsmetadata niveaus/trajecten — afwezig.** Er zijn alleen publicatiestatus, alternatieve-uitwerkingvlag en een vrije notitie met label. Er is geen catalogus, koppeltabel, filter of readmodel voor niveau/traject.
3. **OneDrive-bronselectie en metadatareconciliatie — gedeeltelijk.** OAuth en opslaan van drive-/map-ID zijn functioneel, maar selectie is handmatige invoer; er is geen OneDrive-picker. Reconciliatie is sterk op oefeningsniveau, maar kent de identiteitsgrenzen hierboven. Bovendien scant de bronwisselflow momenteel met het ingebouwde standaardprofiel in plaats van het actieve bronprofiel (`src/lib/source-switch.ts:132-135` tegenover `src/lib/sync.ts:42-46`).
4. **Portfolio-/bronstatusoverzicht — gedeeltelijk.** Laatste sync, waarschuwingen, ontbrekende items, publicatiestatus en bronvalidatie bestaan, maar verspreid over meerdere pagina’s en zonder één status-readmodel.
5. **LearningSpace dupliceren/jaarovergang — afwezig.** Alleen bronprofielen en bronprofielsjablonen kunnen worden gekopieerd; er is geen transactionele LearningSpace-clone of expliciet beleid per gegevenscategorie.
6. **Eigendomsoverdracht/editorbeheer — gedeeltelijk / voorbereid.** Editorbeheer per LearningSpace werkt. Generieke owner/editor-upserts bestaan en zijn getest, maar de globale UI gebruikt ze niet; veilige overdracht van eigendom, opslagverbindingen en bronprofielen ontbreekt.
7. **Gebruikersarchivering — gedeeltelijk.** `active/disabled` blokkeert aanmelden en toegang, maar er is geen archiefstatus of bewaarlifecycle. De bestaande resetflow verwijdert de gebruiker en is dus geen archivering.

Voor uitbreiding moeten eerst drie bestaande risico’s expliciet worden behandeld:

- de bronwissel moet hetzelfde actieve bronprofiel gebruiken als normale synchronisatie;
- eigendomsoverdracht moet LearningSpace-membership, persoonlijke opslagverbindingen en bronprofieleigendom als afzonderlijke concepten behandelen;
- nieuwe metadata moet aan logische oefeningidentiteit hangen en een expliciete reconciliatieregel krijgen voor hernummeren/verplaatsen.

## 2. Huidige architectuur

### 2.1 Uitvoeringsmodel en routes

- De app gebruikt Next.js 16.3 App Router. Publieke en beheerroutes zijn dynamisch (`src/app/layout.tsx:29`, `src/app/[spaceSlug]/page.tsx:15`, `src/app/admin/page.tsx:16`).
- Publieke toegang loopt via `requirePublicLearningSpaceAccess`; ingelogde gebruikers krijgen toegang via groep, individueel recht of beheerrol. Anonieme toegang bestaat alleen wanneer de globale noodtoegang aanstaat (`src/lib/learning-space-access.ts:7-15`, `src/lib/public-access.ts:31-46`).
- Beheerrechten zijn centraal gescheiden: superadmin, owner, editor en optioneel gedelegeerd leerlingtoegangsbeheer (`src/lib/authorization.ts:45-135`). Alleen owner/superadmin mag broninstellingen en lerarentoegang wijzigen.
- Smartschool OAuth maakt of koppelt een lokale gebruiker, bewaart groepen als snapshots, controleert `status === active` en maakt daarna de lokale sessie (`src/app/api/auth/smartschool/callback/route.ts:31-60`). Smartschoolgroepen bepalen toegang, niet de applicatierol zelf.
- Studentpagina’s roepen `preparePublicIndex` aan. Een ontbrekende eerste index synchroniseert blokkerend; een verouderde geldige index wordt na de response vernieuwd; prefetch triggert geen sync (`src/lib/public-index.ts:18-48`).

### 2.2 Data- en persistentielaag

- Productie vereist PostgreSQL; lokaal en in tests wordt libSQL/SQLite gebruikt (`src/lib/database.ts:24-42`). De PostgreSQL-client heeft per instance maximaal één connectie (`src/lib/database.ts:71-74`).
- Migraties zijn handgeschreven SQL en worden bij de eerste database-initialisatie van een instance uitgevoerd onder een PostgreSQL advisory lock (`src/lib/database.ts:112-131`).
- De database kent onder meer `learning_spaces`, `learning_space_sources`, `users`, `external_identities`, `external_identity_groups`, `learning_space_members`, `individual_learning_space_access`, `storage_connections`, `source_profiles`, `learning_space_source_profiles`, `source_profile_templates`, portfolio/sectie/oefeningtabellen en twee assetmodellen (`src/lib/database-migrations.ts:210-250`, `308-336`, `367-433`, `821-981`).
- De repositorylaag gebruikt expliciete SQL en `DatabaseClient.batch` voor meerstapsmutaties. `drizzle-orm` is wel dependency maar vormt niet de actieve repositorylaag.

### 2.3 Bron-, scanner- en synchronisatieketen

```text
LearningSpace
  -> actieve learning_space_source
  -> StorageProvider (local / OneDrive / Google Drive)
  -> actief source_profile-configsnapshot
  -> indexSource()
  -> IndexedPortfolio / IndexedSection / IndexedExercise / IndexedAsset
  -> persistIndex() in één databasebatch
  -> admin- en studentreadmodels
  -> beveiligde assetroutes die het providerbestand streamen
```

- `StorageProvider` biedt `list`, `openFile` en `readFile` (`src/lib/storage/provider.ts:1-33`). OneDrive gebruikt item-ID en eTag; Google Drive gebruikt bestand-ID en version/md5; lokaal gebruikt het relatieve pad en bestandsgrootte/mtime als versie (`src/lib/storage/onedrive-provider.ts:43-64`, `src/lib/storage/google-drive-provider.ts:87-105`, `src/lib/storage/local-filesystem-provider.ts:16-40`).
- `synchronizeSource` verwerft een databaselease, controleert de provider, laadt het actieve bronprofiel, indexeert en persisteert transactioneel (`src/lib/sync.ts:19-81`). Een mislukking vóór persistence laat de laatste geldige index staan.
- `persistIndex` markeert eerst de bestaande index als niet gezien, upsert daarna de actuele boom en markeert ontbrekende assets. Opschonen/archive is een aparte expliciete actie (`src/lib/repositories.ts:690-889`, `952-968`).
- De domeinindex bevat alleen code/nummer/suffix en assets op oefeningniveau; er is geen apart object voor niveau, traject of deelvraag (`src/lib/domain.ts:54-92`). Een suffix zoals `3a` of `3a1` is onderdeel van `exerciseCode`, niet een relationeel subobject (`src/lib/parser.ts:93-123`).

### 2.4 Bronprofielen

- Een concreet bronprofiel is een gevalideerd JSON-snapshot met `configVersion: 1`, een vaste scannerconventie `legacy_portfolio_v1`, globale resources en oefeningsresources (`src/lib/source-profile-config.ts:389-422`).
- Globale resources kunnen bronbestanden of externe links zijn. Oefeningsresources zijn alleen bronbestanden. Herkenning ondersteunt file-, directory- en mixed oefeningscontexten, vaste submappen, semantische rollen, bestandstypes, multipliciteit en weergavemodus (`src/lib/source-profile-config.ts:72-242`).
- Nieuwe LearningSpaces krijgen een onafhankelijke kopie van het standaardsjabloon; bestaande concrete profielen veranderen niet wanneer het sjabloon wijzigt (`src/lib/repositories.ts:393-415`, `src/lib/source-profile-templates.ts`). Een profiel kan daarnaast bewust worden gedeeld of onafhankelijk worden gekopieerd (`src/lib/source-profiles.ts:166-201`).

### 2.5 Applicatiemetadata en publicatie

- Portfolio: titeloverride, kaartkleur, thema, vrije tekst, externe links en publicatievenster.
- Sectie: zichtbaarheid en publicatievenster.
- Oefening: zichtbaarheid, publicatiekolommen, tonen alternatieve uitwerking, vrije notitie, notitielabel en positie.
- Synchronisatie-upserts wijzigen alleen scanner-eigenschappen en laten deze applicatievelden intact (`src/lib/repositories.ts:738-839`). Tests bewijzen behoud van portfolio-opmaak en oefeningnotities bij resync (`src/lib/repositories.test.ts:620-672`).
- Portfolio- en sectieplanning worden effectief afgedwongen via `resolvePortfolioPublication` en `resolveChildPublication` (`src/lib/publication.ts:11-36`). Oefeningplanning is slechts voorbereid: `publish_from` en `publish_until` bestaan en worden geschreven, maar student-, asset- en adminreadmodels geven oefening altijd `limited: false` met lege datums (`src/lib/repositories.ts:1287-1293`, `1375-1381`, `1408-1411`, `1513-1517`, `1579-1582`). Er is ook geen `exercises.publication_limited`-kolom. De huidige UI biedt daarom alleen zichtbaar/verborgen op oefeningniveau (`src/app/components/exercise-bulk-table.tsx:41-64`).

## 3. Auditbevindingen per gebied

### 3.1 Identiteit en synchronisatie

**Geïmplementeerd en getest**

- Deterministische logische IDs worden aangemaakt in `persistIndex`: portfolio op ruimte+code, sectie op portfolio+volgorde en oefening op sectie+code (`src/lib/repositories.ts:738-789`).
- Resync activeert teruggekeerde records opnieuw en bewaart beheerdata doordat `ON CONFLICT` alleen scannerkolommen bijwerkt (`src/lib/repositories.ts:740-803`).
- Ontbrekende bronitems worden eerst `is_indexed = 0`/`missing_since`; pas de handmatige opschoning zet `archived_at` (`src/lib/repositories.ts:844-868`, `952-968`).
- Repositorytests dekken idempotentie, bestandsvervanging, rename/missing/restore van generieke resources, behoud van notities/opmaak, bronwissels en falende scans (`src/lib/repositories.test.ts:43-70`, `193-278`, `620-732`, `786-884`; `src/lib/source-switch.test.ts:40-209`).

**Risico’s en grenzen**

- Sectievolgorde is identiteit. Een hernummerde sectie wordt een nieuwe sectie; alle oefeningen eronder krijgen nieuwe IDs.
- Oefeningcode is identiteit binnen de sectie. Hernummeren of verplaatsen maakt een nieuwe oefening; notitie, zichtbaarheid en foutmeldingsrelaties migreren niet automatisch.
- Legacy `solution_assets` blijven padgebaseerd (`stableId(variantId, relativePath)` en unique op `variant_id, relative_path`), terwijl `source_resource_assets` provider-ID-gebaseerd zijn (`src/lib/repositories.ts:755-768`, `793-836`; `src/lib/database-migrations.ts:957-981`). Een rename heeft daardoor verschillende semantiek per assetpad.
- `source-switch.ts` roept `indexSource(provider)` zonder actief profiel aan. Bij een aangepast profiel kan vergelijking of omschakelen dus een andere index produceren dan normale synchronisatie. Dit blijkt rechtstreeks uit de code en heeft geen gerichte custom-profile-bronwisseltest.
- `sourceManifestFromIndex` vergelijkt paden en bestandstypen, niet provider-ID of inhoudshash, en neemt `portfolio.resourceAssets` niet op (`src/lib/source-comparison.ts:30-92`). Gelijke inhoud met gewijzigde paden geldt als verschil; gelijke paden met gewijzigde inhoud en verschillen in niet-legacy globale resources kunnen in de preview onopgemerkt blijven.

### 3.2 Bronnen, bronprofielen en resources

**Geïmplementeerd en getest**

- Globale bronbestanden/externe links en configureerbare oefeningsresources zijn end-to-end aangesloten op schema, editor, scanner, persistence en readmodels.
- Scanner v2 onderscheidt eerst oefeningscontext en classificeert daarna resources. Conflicten leiden deterministisch tot “niets gekozen” plus waarschuwing (`src/lib/storage/portfolio-indexer.ts:142-249`, `308-499`).
- File-, directory- en mixed modus, eigen marker, nummer aan begin, vaste submap, contextspecifieke herkenning en meerdere bestanden hebben brede tests (`src/lib/storage/portfolio-indexer.test.ts:185-687`).
- Profielen/sjablonen hebben ownership, kopie/gedeeld-gebruik, archief en strict server-side Zod-validatie (`src/lib/source-profiles.ts:117-361`; `src/lib/source-profile-templates.test.ts:62-448`).

**Gedeeltelijk of afwezig**

- `scanner.convention` is nog een literal; portfoliomap- en sectiegrammar zijn hard gecodeerd in `parser.ts` (`src/lib/source-profile-config.ts:389-394`, `src/lib/parser.ts:9-17`, `67-91`). Nieuwe conventies vereisen een nieuwe configversie en parserstrategie.
- Oefeningsresources ondersteunen geen `external_link`; globale links wel (`src/lib/source-profile-config.ts:21-24`, `98-120`, `197-208`).
- Er is geen expliciet deelvraagmodel. `3a`/`3a1` zijn zelfstandige oefeningcodes; `step` ordent bestanden binnen één resource maar draagt geen pedagogische betekenis.
- De preview in `src/lib/source-profile-structure-preview.ts` en `src/app/components/source-profile-structure-preview.tsx` is **voorbereid, niet als baseline bevestigd**: deze bestanden en hun integratie waren niet gecommitteerd. De unit-test slaagt, maar er is geen browser-QA uitgevoerd.

### 3.3 Metadata en publicatie

**Geïmplementeerd en getest**

- Bestaande appmetadata blijft behouden bij normale synchronisatie zolang de logische ID gelijk blijft.
- Publieke pagina’s en assetroutes berekenen zichtbaarheid server-side; verborgen of niet-geïndexeerde inhoud wordt niet alleen in de UI verborgen (`src/lib/repositories.ts:1394-1437`, `1497-1517`, `1542-1590`, `1593-1603`).
- Alternatieve uitwerkingen hebben een afzonderlijke leerlingvlag en worden ook in de assetquery afgeschermd.

**Afwezig / voorbereid**

- Niveau en traject bestaan nergens in schema, domeintypes, repositories, formulieren of filters.
- Er is geen metadataherkomst/auditveld (`created_by`, `updated_by`) en geen wijzigingshistoriek.
- Oefeningplanning is database-technisch voorbereid maar functioneel niet aangesloten, zoals beschreven in 2.5. Nieuwe metadata mag deze half-afgewerkte semantiek niet kopiëren.
- Metadata op een individueel bronbestand/resource bestaat niet. Alleen de bovenliggende oefening en de technische resourceconfig hebben betekenisvelden.

### 3.4 LearningSpace-beheer

**Geïmplementeerd en getest**

- Aanmaken gebeurt transactioneel met bron, eigen bronprofielsnapshot en ownermembership (`src/lib/repositories.ts:385-415`; `src/lib/learning-space-creation.test.ts:27-65`).
- Archiveren en herstellen bewaren instellingen en geïndexeerde metadata; permanente verwijdering vereist eerst archiveren (`src/lib/repositories.ts:508-551`; `src/lib/repositories.test.ts:699-784`).
- Owner/editor-autorisatie en optionele delegatie van leerlingtoegang zijn gescheiden.

**Gedeeltelijk of afwezig**

- Er is geen duplicatiefunctie. `createLearningSpaceForOwner` maakt altijd een lege ruimte met het actuele standaardsjabloon; het kopieert geen thema’s, publicatie, toegangsregels, portfolio-appmetadata of bronconfig van een bestaande ruimte.
- Er is geen jaarovergangsbeleid dat per gegevenscategorie kiest tussen kopiëren, resetten, refereren of overslaan.
- Het globale overzicht toont owner/editor/groepen en provider, maar geen samengestelde gezondheid. Het per-space overzicht toont publicatiestatus, aantallen en waarschuwingen; header en instellingen tonen sync- en bronstatus (`src/lib/admin-learning-space-overview.ts:21-69`, `src/app/admin/[spaceSlug]/page.tsx:19-35`, `src/app/components/admin-space-header.tsx:10-35`, `src/app/components/learning-space-settings-form.tsx:110-115`). Dit is herbruikbare basis voor één status-readmodel.

### 3.5 Database en architectuur

**Sterk**

- Meerrecordmutaties gebruiken de transactionele `batch`-primitive.
- Source-profileconfig is strict gevalideerd en versieerbaar.
- Externe provideridentiteit en technische versiegegevens worden opgeslagen.
- Toegang en publicatie worden opnieuw gecontroleerd bij assetlevering.

**Technische schuld / risico**

- Migraties draaien tijdens runtime-initialisatie. Dat is operationeel eenvoudig, maar vergroot cold-start- en deployrisico en koppelt applicatiestart aan DDL-rechten.
- De meeste kern-FK’s uit de initiële tabellen hebben geen `ON DELETE CASCADE`; `permanentlyDeleteLearningSpace` onderhoudt daarom een handmatige deletelijst (`src/lib/repositories.ts:525-550`). Nieuwe tabellen moeten daar expliciet aan worden toegevoegd of relationele cascades krijgen.
- Er is geen productiegerichte PostgreSQL-integratietest in de onderzochte set; de repositorytests gebruiken libSQL. SQL-portabiliteit is dus grotendeels door implementatiediscipline, niet door beide engines bewezen.
- `hydrateLearningSpaces` leest voor een selectie alle `learning_space_sources` en filtert daarna in geheugen (`src/lib/repositories.ts:356-366`). Nu is dat klein; voor grotere aantallen is een `WHERE learning_space_id IN (...)` wenselijk.
- `getAdminPortfolios` scoped portfolio’s en generieke resources op LearningSpace, maar leest alle oefeningen en alle legacy solution-assets uit de database en filtert pas in het readmodel (`src/lib/repositories.ts:1093-1107`). Dat schaalt onnodig mee met de volledige installatie.
- `getMissingIndexCounts` telt alleen ontbrekende `solution_assets`, terwijl de opschoonactie ook ontbrekende `source_resource_assets` archiveert (`src/lib/repositories.ts:973-979`, `952-968`). Een nieuw statusoverzicht moet beide assetmodellen tellen.
- `getStudentPortfolio` laadt alle studentportfolio’s van een LearningSpace en zoekt daarna één record (`src/lib/repositories.ts:1390-1392`). Dat is geen blokkade voor de zeven uitbreidingen, maar nieuwe metadata mag dit patroon niet verder vergroten.

## 4. Implementatiekaart voor de zeven uitbreidingsgebieden

| Uitbreidingsgebied | Huidige status | Herbruikbare bouwstenen | Benodigde wijziging | Minimale testgrens | Risico |
|---|---|---|---|---|---|
| 1. Configureerbare source profiles/documentresources | **Geïmplementeerd en getest**, portfolio/sectiegrammar nog vast | `sourceProfileConfigV1Schema`, profieltemplates, scanner v2, generieke resource-index, editors | Voor nieuwe mapconventies: config v2 met expliciete portfolio-/sectieregels en een dispatcher per configversie; preview pas als productonderdeel beschouwen na commit/integratiecontrole | Parser/indexer contracttests per conventie, legacy-v1 regressie, malformed-configtests, custom-profile sync én source-switch | **Middel**: verkeerde regels kunnen inhoud laten verdwijnen; nooit stil een ambigu bestand kiezen |
| 2. Oefeningsmetadata: niveaus/trajecten | **Afwezig** | Stabiele `exercise.id`, metadata-upsertpatroon, admin exercise readmodel | Genormaliseerde definities en koppelingen met duidelijke scope; repositorymutaties; adminbewerking; studentfilter/readmodel. Geen opslag in scannerconfig of bestandsnaam | Resync/missing/restore, hernummer/move-contract, autorisatie, filtercombinaties, archief van definities | **Middel-hoog**: semantiek en cardinaliteit zijn productkeuzes; identitywijziging kan metadata losmaken |
| 3. OneDrive-bronselectie en metadatareconciliatie | **Gedeeltelijk** | Persoonlijke OAuth-verbinding, `learning_space_sources`, item-ID/eTag, source-switchpreview | Server-side mapbrowser/picker die uitsluitend binnen de verbonden tenant/drive werkt; gekozen IDs valideren; source-switch actief profiel laten gebruiken; expliciete reconcilepreview voor logische identitywijzigingen | Authz per connection-owner, folder paging, inaccessible/deleted folder, custom-profile switch, rename/move/replace matrices | **Hoog**: credentials en bronwisseling; nooit clientvertrouwen op drive/folder-ID |
| 4. Portfolio-/bronstatusoverzicht | **Gedeeltelijk** | `getLatestSyncSummary`, warning/missing counts, source validation, publicatiestatus, admin cards | Eén server-side status-readmodel per LearningSpace/portfolio; severityregels; links naar bestaande beheerpagina’s. Begin read-only, zonder nieuwe polling | Query/readmodeltests, scoped visibility voor teacher/superadmin, failed-sync/last-good-index, archived spaces | **Laag-middel**: vooral N+1/queryvolume en het verwarren van laatste poging met laatste geslaagde sync |
| 5. LearningSpace dupliceren/jaarovergang | **Afwezig** | Transactionele create, profieltemplateclone, themes/access/source tabellen, stabiele IDs | Expliciet clone-commando met nieuwe IDs en policy per categorie: basisinstellingen, thema’s, profiel snapshot/link, owners/editors, groepen, bron, publicatie, notities, foutmeldingen. Eerst dry-run/samenvatting | Volledige rollback, geen bronbestanden wijzigen, unieke slug, geen student-/rapportlekkage, onafhankelijke metadata na clone | **Hoog**: impliciet kopiëren kan toegang of niet-gepubliceerde data lekken |
| 6. Ownership transfer/editor management | **Gedeeltelijk / voorbereid** | `learning_space_members`, per-space editorflow, generieke membershipservices, profielownership, connectionownership | Eén transactionele overdrachtsservice met preflight. Garandeer minstens één owner; beslis apart over LearningSpace, bronprofielen en persoonlijke storageconnection. Sluit daarna pas UI aan; verwijder of beveilig losse ongebruikte actions | Laatste-ownerbescherming, target actief/teacher, rollback, source/profile ownership, editorpromotie, superadmin, archived space | **Hoog**: huidige generieke remove/upsert bewaakt geen laatste owner en actions zijn niet in UI gebruikt |
| 7. User archiving | **Gedeeltelijk** (`disabled`), archief ontbreekt | Actieve statuscontrole in auth, sessies, userreset-safetychecks, userfilters | Kies lifecycle (`active/disabled/archived`) of `archived_at`; trek sessies in; behoud historische verwijzingen; blokkeer login en nieuwe rechten; vereis overdracht van owners/sources/profiles vóór archief. Houd reset als afzonderlijke destructieve handeling | Smartschool relogin, sessierevocatie, historische rapporten, eigenaar/bron/profielblokkades, restore, filters | **Middel-hoog**: privacy/bewaring en FK-semantiek; disabled is nu omkeerbaar, reset destructief |

## 5. Technische dependency map

```text
Smartschool OAuth
  -> users + external_identities + external_identity_groups
  -> groepsrechten / individueel recht / learning_space_members
  -> publieke en beheerautorisatie

storage_connections (persoonlijk eigendom)
  -> learning_space_sources (primary/mirror)
  -> StorageProvider
  -> source_profile-config
  -> scanner/index
  -> logische portfolio/sectie/oefening-ID
  -> applicatiemetadata + publicatie + foutmeldingen

ownership transfer
  -> veilige user archiving
  -> veilige LearningSpace-duplicatie met nieuwe owner

logische oefening-ID + reconciliatiebeleid
  -> niveaus/trajecten
  -> metadata behoud bij OneDrive rename/move/bronwissel

sync/source/warning/publication readmodels
  -> geconsolideerd statusoverzicht
```

Volgorde-afhankelijkheden, zonder versieroadmap:

- Userarchivering mag pas owners, gebruikte storageverbindingen en eventueel bronprofieleigendom veilig kunnen overdragen of expliciet blokkeren.
- LearningSpace-duplicatie mag pas worden gebouwd nadat per categorie vastligt wat wordt gekopieerd. Toegangsregels en publicatie mogen niet impliciet meekomen.
- Niveau/trajectmetadata kan technisch naast de scanner bestaan, maar moet vóór implementatie een identiteit- en reconciliatiecontract krijgen.
- Een OneDrive-picker is grotendeels onafhankelijk, maar source-switch moet eerst profielconsistent worden gemaakt om een gekozen bron betrouwbaar te valideren.
- Het statusoverzicht is read-only te realiseren met bestaande data en kan vroeg observability leveren zonder mutatierisico.

## 6. Open technische beslissingen die de code niet kan nemen

1. **Niveau/trajectsemantiek**: is er per oefening exact één niveau en één traject, of zijn beide many-to-many? Zijn definities appbreed, per eigenaar of per LearningSpace? Zijn ze zichtbaar voor leerlingen en filterbaar?
2. **Hernummeren/verplaatsen**: moet de app een oefening met hetzelfde providerbestand maar een nieuwe sectie/code automatisch als dezelfde oefening herkennen, een beheerder om bevestiging vragen, of bewust als nieuw behandelen?
3. **Deelvragen**: blijft `3a` een zelfstandige oefening, of komt er een parent-childmodel waarin oefening 3 deelvragen a/b bevat? Het huidige `exerciseSuffix` beslist dit niet.
4. **Jaarovergang**: welke categorieën gaan mee bij duplicatie: owners/editors, Smartschoolgroepen, individuele toegang, bronconfig, bronprofiel als kopie of link, thema’s, zichtbaarheid/planning, notities, externe links en foutmeldingen? Veilig default: toegang, publicatie, notities en meldingen niet kopiëren zonder expliciete keuze.
5. **Eigendom**: staat een LearningSpace meerdere owners toe na de nieuwe flow, of is er één primaire owner? Moet een bronprofiel automatisch mee overgaan? Een persoonlijke OneDrive-verbinding kan niet veilig als eigendom van een ander worden beschouwd zonder herverbinding.
6. **Gebruikersbewaring**: betekent archiveren alleen login blokkeren, of ook persoonsgegevens pseudonimiseren na een bewaartermijn? Welke historische rapporten moeten de oorspronkelijke naam behouden?
7. **Bronstatus-severity**: wat is operationeel “fout”: laatste poging mislukt met geldige oude index, incomplete mirror, ontbrekende niet-verplichte resource, geplande verborgen publicatie, of alleen geen bruikbare index?

## 7. Conclusie en aanbevolen eerste implementatiestap

De architectuur hoeft niet te worden vervangen. De uitbreidingen passen op de bestaande lagen wanneer de logische identiteit, ownership en snapshotsemantiek behouden blijven. De grootste fout zou zijn nieuwe metadata in bronprofiel-JSON of bestandsnamen te stoppen: bronprofielen beschrijven herkenning, terwijl niveau, traject, publicatie en notities applicatiemetadata zijn die een synchronisatie moeten overleven.

**Aanbevolen eerste implementatiestap: maak bronvalidatie profielconsistent en bouw daarop een read-only status-readmodel.** Dit is de kleinste stap die een aangetoond integratiegat sluit en tegelijk veilige observability voor latere bronselectie en jaarovergang levert.

Scope:

- laat `compareLearningSpaceSources` en `switchLearningSpaceSource` exact hetzelfde actieve, gevalideerde bronprofiel laden als `synchronizeSource`;
- voeg een server-side `LearningSpaceSourceStatus`-readmodel toe dat bestaande gegevens bundelt: actieve bron/rol/provider, profielnaam/configversie, laatste poging, laatste geslaagde sync, validatiestatus, warningcount, missingcount en aanwezigheid van een bruikbare index;
- toon dit read-only in het bestaande beheer, zonder polling, nieuwe autorisatieregels of wijziging aan de bronbestanden;
- voeg nog geen OneDrive-picker, metadata, duplicatie of lifecyclemutatie toe.

Acceptatiecriteria:

1. Een custom bronprofiel levert bij normale sync, vergelijking en daadwerkelijke switch dezelfde manifest- en resourceclassificatie op.
2. Een mislukte vergelijking/switch wijzigt de actieve bron en laatste geldige index niet.
3. Owner en superadmin zien de juiste status; editor ziet alleen status van beheerde LearningSpaces; leerlingen krijgen geen nieuw endpoint of beheerdata.
4. Het statusmodel onderscheidt laatste poging van laatste geslaagde index en markeert een bruikbare oude index niet als verdwenen.
5. Gerichte tests dekken custom-profile primary/mirror, incomplete/inaccessible target, archived LearningSpace en autorisatiescope op beide databaseadapters waar mogelijk.

Na deze stap zijn OneDrive-selectie en een geconsolideerd statusoverzicht veiliger uit te bouwen. Metadata, duplicatie en gebruikersarchivering kunnen daarna afzonderlijk worden uitgevoerd zodra de open productbeslissingen hierboven zijn vastgelegd.

## Auditcontrole

- Geen browser-QA, build, lint, deployment of productiequery uitgevoerd.
- Een als gericht bedoelde Vitest-opdracht heeft door argumentdoorgifte onverwacht de volledige suite uitgevoerd: **132 testbestanden, 863 tests geslaagd**. Dit geeft brede regressiezekerheid, maar vervangt geen PostgreSQL-productie-integratietest of browseracceptatie.
- De reeds aanwezige gewijzigde en niet-gevolgde bronprofiel-previewbestanden zijn alleen gelezen en niet aangepast.
