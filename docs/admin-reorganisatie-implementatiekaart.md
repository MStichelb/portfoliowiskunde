# Admin-reorganisatie implementatiekaart

Deze kaart beschrijft de huidige implementatie ten opzichte van `masterplan-reorganisatie.txt`. De huidige code en databank zijn leidend; dit document stelt geen functionele wijziging voor.

## 1. Huidige routes en componenten

| Functie | Route | Belangrijkste component(en) | Server action/repository |
| --- | --- | --- | --- |
| Globaal beheeroverzicht | `/admin` | `src/app/admin/page.tsx`, `PageBanner` | `requireAdminUser`, `getLearningSpaces(true)`, `getManageableLearningSpaceIds` |
| Persoonlijke OneDrive-verbinding | `/admin/verbindingen` | `OneDriveConnectLink` | `hasOneDriveAuthorization(user.id)`, `/api/onedrive/connect`, `/api/onedrive/callback` |
| Globale instellingen | `/admin/instellingen` | `EmergencyAccessControl`, `LearningSpaceSourceSummary`, `LearningSpaceLifecycleActions`, `LearningSpaceCreateForm` | `setPublicEmergencyAccessAction`, `createLearningSpaceAction`, lifecycle-actions, `getLearningSpaces()` |
| Globaal toegangsbeheer | `/admin/toegang` | `AutoSubmitSelect`, `ConfirmActionButton`, eigen group-/membershiptabellen | actions in `src/app/admin/gebruikers/actions.ts`; queries in `src/lib/user-management.ts` |
| Globaal gebruikersbeheer | `/admin/gebruikers` | `UserManagementView`, `UserListFilters`, `UserAccessMenu`, `StudentResetControls` | actions in `src/app/admin/gebruikers/actions.ts`; `listManagedUsers`, memberships/access/storage/group queries |
| LearningSpace: portfolio's | `/admin/[spaceSlug]` | `AdminSpaceHeader`, `LearningSpaceNav`, portfolio-overzicht | `getAdminLearningSpaceBySlug`, `canManageLearningSpace`, portfolio/theme/warning queries |
| LearningSpace: thema's | `/admin/[spaceSlug]/themas` | `AdminSpaceHeader`, themaformulieren | theme-actions in `src/app/admin/actions.ts`, beschermd via `requireSpaceManagement` |
| LearningSpace: instellingen | `/admin/[spaceSlug]/instellingen` | `LearningSpaceSettingsForm`, beheerderssectie, `SourceSwitchPanel`, `LearningSpaceLifecycleActions` | `saveLearningSpaceAction`; editor-actions in de lokale `actions.ts`; source comparison/switch; lifecycle-actions |
| LearningSpace: publieke pagina | `/[spaceSlug]` | publieke LearningSpace-route; link vanuit `LearningSpaceNav` | publieke queries en `requirePublicLearningSpaceAccess` |
| LearningSpace: foutmeldingen | `/admin/[spaceSlug]/foutmeldingen` | `AdminSpaceHeader`, error-reportcomponenten | foutmelding-actions in `src/app/admin/actions.ts`, per LearningSpace beschermd |
| OneDrive OAuth | `/api/onedrive/connect`, `/api/onedrive/callback` | echte browsernavigatie via `OneDriveConnectLink` | `canAccessAdmin`, PKCE/state/owner-cookies, `exchangeMicrosoftCode` |
| Smartschool koppelen | `/api/auth/smartschool/link`, callback onder `/api/auth/smartschool/callback` | `SmartschoolConnectLink` | superadmincheck, Smartschool OAuth-state en identity/group-snapshotservices |

### A. `/admin`

- `src/app/admin/page.tsx` vraagt een teacher of superadmin via `requireAdminUser` en toont alleen actieve, beheerbare LearningSpaces. `getLearningSpaces(true)` sluit archief uit; `getManageableLearningSpaceIds` geeft superadmin alle actieve ruimtes en teachers alleen owner/editor-ruimtes.
- Superadmin ziet nu knoppen voor Smartschool koppelen, Gebruikers, Toegang, Leeromgevingen beheren en Uitloggen. Een teacher ziet alleen Mijn verbindingen en Uitloggen.
- Elke kaart linkt naar `/admin/<slug>` en toont `shortLabel`, naam en `sourceSummary`: primaire provider plus eventuele mirrorprovider. Owner/editor-namen, gekoppelde groepen en connection owner zijn al opvraagbaar via `listManagedMemberships`, `listManagedGroupMappings` en `listManagedSourceOwners`, maar worden hier nog niet geladen.
- Aanbeveling voor het masterplan: een compacte `Toon archief`-schakelaar op dezelfde pagina vraagt minder routing en kan dezelfde kaarten hergebruiken. Een aparte archiefroute is pas nuttig bij een groot archief.

### B. `/admin/instellingen`

- `src/app/admin/instellingen/page.tsx` is superadmin-only via `requireAdmin`.
- Leeromgeving toevoegen gebruikt `LearningSpaceCreateForm` en `createLearningSpaceAction`.
- Actieve en gearchiveerde ruimtes komen beide uit `getLearningSpaces()` en worden lokaal op `isActive` gesplitst. `LearningSpaceLifecycleActions` levert beheren/archiveren of beheren/herstellen/verwijderen.
- Smartschool-noodtoegang gebruikt `EmergencyAccessControl`, `getPublicEmergencyAccess` en `setPublicEmergencyAccessAction`.
- Het verbindingenblok toont de compatibility/superadmin-OneDrive-status en globale Google-service-accountconfiguratie. Dit is niet hetzelfde als de persoonlijke teacherpagina `/admin/verbindingen`.

### C. `/admin/toegang`

- De pagina is volledig superadmin-only via `requireAdmin`.
- Automatische lerarenherkenning gebruikt `getConfiguredTeacherGroupId`/`setConfiguredTeacherGroupId` in `app_settings`; dezelfde instelling staat al op `/admin/gebruikers`.
- Smartschoolgroepen koppelen gebruikt `learning_space_group_mappings` via `createGroupMappingAction`, `removeGroupMappingAction`, `listManagedGroupMappings` en `listKnownExternalGroups`.
- Automatische toegang controleren combineert `listManagedGroupUsers` met de mappings. Dit is een inspectieweergave van opgeslagen snapshots, geen live Smartschool-call.
- Gedeeld beheer gebruikt `learning_space_members` via `listManagedMemberships`, `saveMembershipAction` en `removeMembershipAction`. `listManagedSourceOwners` toont daarnaast welke persoonlijke storage connection een bron gebruikt.
- De acties op deze globale pagina doen nu een globale superadmincheck. Ze mogen niet ongewijzigd naar een ownerpagina worden verplaatst: de latere acties moeten het concrete `learningSpaceId` server-side met `requireLearningSpaceConfiguration` controleren.

### D. `/admin/gebruikers`

- `src/app/admin/gebruikers/page.tsx` laadt users, LearningSpaces, memberships, effectieve accessflags, storage-status, bekende klasgroepen, alle bekende groepen en de ingestelde lerarengroep.
- `UserManagementView` splitst uitsluitend op de lokale `users.role`; Smartschoolrollen worden niet vertrouwd. Nieuwe Smartschoolusers starten als student, behalve als hun snapshot de expliciet geconfigureerde teacher-groupID bevat.
- `listManagedUsers` levert genormaliseerde voor-/achternaam, status, gedetecteerde klas/override en een vlag voor individuele toegang.
- `listManagedUserAccess` houdt drie oorzaken apart: `groupDerived`, `individual` en `managementRole`. `UserAccessMenu` wijzigt alleen `individual_learning_space_access`; afgeleide toegang is read-only.
- Herbruikbaar voor een LearningSpace-roster: naamweergave, zoek/sorteer/filterpatronen, paginering en compacte tabelregio. Globale rol/status/resetcontrols horen niet in het LearningSpace-roster.

### F. Per-LearningSpace beheer

- `AdminSpaceHeader` levert titel, synchronisatiestatus, mirrorwaarschuwing, foutmeldingenteller en syncactie. `LearningSpaceNav` bevat nu Portfolio's, Thema's, conditioneel Instellingen en Publieke pagina; er bestaat nog geen sectie `access`.
- Portfolio's en Thema's vereisen `canManageLearningSpace`: superadmin of owner/editor.
- Instellingen vereisen `canConfigureLearningSpace`: superadmin of owner. `LearningSpaceSettingsForm` bevat Algemeen en Bronnen; de pagina bevat daarnaast Beheerders, Actieve bron en voor superadmin Status leeromgeving.
- Editor toevoegen/verwijderen is al per LearningSpace beschermd via `requireLearningSpaceConfiguration`. De huidige UI kan alleen editors toevoegen; owners worden alleen getoond.
- `SourceSwitchPanel` hergebruikt de bestaande, per-space beveiligde compare/switch-actions. Bronnen blijven read-only.
- Lifecycle is momenteel zowel in UI als server actions superadmin-only. Archive/restore/delete gebruiken alle `requireAdmin`; permanent verwijderen controleert bovendien archived state en bevestigingsslug. Het masterplan vraagt dus een latere, securitygevoelige splitsing: owner mag archive/restore, alleen superadmin delete.

## 2. Huidig rechtenmodel

| Concept | Model/tabel | Resolutie/service | Server-side controle |
| --- | --- | --- | --- |
| Superadmin | `users.role = 'superadmin'` | `getAuthenticatedUser`; impliciet toegang/beheer/configuratie voor alle ruimtes | `requireAdmin` voor globale superadmintaken; centrale authorizationhelpers voor per-space flows |
| Teacher | `users.role = 'teacher'` | lokale rol, eventueel alleen bij eerste registratie afgeleid uit ingestelde teacher-groupID | `requireAdminUser` laat actieve teachers de admin binnen |
| Student | `users.role = 'student'` | standaardrol voor nieuwe externe identiteit | geen admin; publieke toegang via centrale accessresolutie |
| LearningSpace owner | `learning_space_members.role = 'owner'` | `getLearningSpaceMemberRole`, `listManagedMemberships` | mag beheren en configureren via `canManageLearningSpace`/`canConfigureLearningSpace` |
| LearningSpace editor | `learning_space_members.role = 'editor'` | dezelfde helpers | mag beheren/synchroniseren/publiceren, niet configureren |
| View-only teacher | `individual_learning_space_access` of group mapping | `getAccessibleLearningSpaceIds`, `listManagedUserAccess` | dezelfde publieke accesscheck als voor leerlingen; geen managementrecht |
| Individuele studenttoegang | `individual_learning_space_access` | `setIndividualLearningSpaceAccess` | superadminactie op `/admin/gebruikers`; target moet student/teacher en ruimte actief zijn |
| Smartschool group-derived access | `external_identity_groups` + `learning_space_group_mappings` | exacte `(provider, external_group_id)`-join | `getAccessibleLearningSpaceIds`/`canAccessLearningSpace` |
| Management-implied view access | `learning_space_members` | memberships zijn een derde OR-tak in `getAccessibleLearningSpaceIds` | owner/editor krijgt automatisch publieke kijktoegang |

Belangrijke conclusies:

1. Een teacher-kijker kan volledig met bestaande individuele view access worden gemodelleerd. Een nieuw membershiptype `viewer` zou management en publieke toegang opnieuw vermengen en is niet nodig.
2. Owner en editor impliceren vandaag al publieke view access.
3. Eén persoonlijke OneDrive-connection kan door meerdere `learning_space_sources` worden verwezen; er staat geen unieke beperking op `storage_connection_id`. De provider ontvangt de connection-ID per bron.
4. Teachers kunnen nu geen LearningSpace aanmaken doordat `canCreateLearningSpace`/`requireLearningSpaceCreation` uitsluitend superadmin toestaan en `createLearningSpaceAction` deze guard uitvoert.
5. `createLearningSpace` schrijft LearningSpace en bron(nen) transactioneel via `executeBatch`, maar maakt geen owner-membership. Voor het masterplan is een service nodig die in dezelfde batch de ruimte, bronnen en `learning_space_members(owner)` voor de maker creëert. Alleen na succesvolle creatie mag worden geredirect.

## 3. Huidige verbindingen

### OneDrive

- `storage_connections` is persoonlijk door `owner_user_id`; credentials staan versleuteld in `encrypted_credentials` en de status is active/disconnected.
- `learning_space_sources.storage_connection_id` wijst naar de specifieke verbinding. `getOwnedStorageConnection` en `saveStorageCredentials` bewaken ownership; de OAuth callback bindt state aan de aangemelde user-ID in een HttpOnly cookie.
- `/admin/verbindingen` toont voor iedere teacher/superadmin diens eigen default OneDrive-connection. De connectflow is een echte browsernavigation.
- De compatibility-superadmin heeft een gemigreerde legacyconnection. Migratie 024 koppelt historische OneDrive-LearningSpaces duplicaatvrij als owner.
- Het schema ondersteunt meerdere connections per user, hoewel de huidige UI/OAuth-flow standaard één deterministische/default OneDrive-connection gebruikt.

### Smartschool

- OAuth-clientconfiguratie is app-breed/environment-based. Koppelen is superadmin-only via `/api/auth/smartschool/link`.
- Smartschoolidentiteiten staan in `external_identities`; groepssnapshots in `external_identity_groups` met group-ID, optionele naam en `direct`/`parent` membershiptype.
- Smartschool is de bron voor groepsinformatie. Snapshots worden bij OAuth-login vervangen; beheerweergaven doen geen live group-call.
- Noodtoegang is een globale setting in `app_settings` en verzwakt adminautorisatie niet.

### Google Drive

- De huidige productieverbinding gebruikt een app-breed service account uit environmentconfiguratie en read-only Drive-scope.
- Per LearningSpace staan folder-ID/label en validatiestatus in `learning_space_sources`. Google Drive gebruikt in de huidige UI geen persoonlijke teacher-OAuth-connectie.
- `storage_connections` staat technisch provider `google_drive` toe, maar de huidige service-accountprovider en statusweergave zijn globaal; dit mag niet als persoonlijke connection worden voorgesteld zonder nieuwe authenticatielogica.

Alle storageproviders blijven vanuit de webapp read-only. Local is een testprovider; OneDrive en Google Drive wijzigen geen bronbestanden.

## 4. Herbruikbare bestaande logica

- **Adminoverzicht:** bestaande LearningSpace-kaarten, `sourceSummary`, `cardColorStyle`, `getLearningSpaces` en authorization-ID-lijsten behouden; verrijk alleen de querylaag voor owner/editor/groupdetails.
- **Nieuwe LearningSpace:** `LearningSpaceCreateForm`, `learningSpaceInput`, bronvalidatie, `assignOwnedStorageConnections` en repositorybatch hergebruiken. Voeg ownership toe binnen één creatieservice in plaats van een tweede losse action.
- **Verbindingen:** verplaats/hercomposeer `OneDriveConnectLink`, connectionstatus, Google-configcheck, `EmergencyAccessControl` en `SmartschoolConnectLink`; wijzig OAuth-routes niet voor een layoutverplaatsing.
- **Per-space beheer:** `AdminSpaceHeader` en `LearningSpaceNav` uitbreiden met één route/tab; bestaande `canManageLearningSpace` en `canConfigureLearningSpace` blijven de centrale grens.
- **Gedeeld beheer:** memberships en editor-actions bestaan al. Verplaats de UI; maak owner/editor-mutaties per-space geautoriseerd voordat globale UI verdwijnt.
- **Kijktoegang:** `individual_learning_space_access`, `setIndividualLearningSpaceAccess`, `listManagedUserAccess` en `UserAccessMenu` blijven de enige individuele accessbron.
- **Groepstoegang:** `listKnownExternalGroups`, `isClassGroupName`, mappingrepositories en exacte ID-matching hergebruiken. De twee dropdowns zijn alleen een UI-splitsing van dezelfde dataset.
- **Roster-UI:** zoek/sorteer/filter/paginatie uit `UserManagementView`/`UserListFilters` als patroon hergebruiken, maar met een per-space readmodel.
- **Bronnen en switching:** `LearningSpaceSettingsForm`, `SourceSwitchPanel`, source-validation en connection ownership intact laten.
- **Lifecycle:** repositoryfuncties en `canPermanentlyDeleteLearningSpace` behouden; alleen actionautorisatie en redirects later gericht opsplitsen.

## 5. Verwachte nieuwe logica

1. Een nieuwe route `/admin/[spaceSlug]/toegang` plus `access` in `AdminSpaceSection`.
2. Een per-space summaryquery voor owner(s), editors, gekoppelde groepen en sourceproviders/owners, bruikbaar voor kaarten en toegangspagina zonder globale datasets in de UI te filteren.
3. Een per-space rosterquery, bijvoorbeeld `listLearningSpaceRoster(learningSpaceId)`, die group-derived en individuele studenttoegang verenigt, per user dedupliceert en toegangsoorzaken/groepsnamen teruggeeft.
4. Per-space group- en membershipactions met `requireLearningSpaceConfiguration`; globale superadminactions mogen niet simpelweg worden gekopieerd.
5. Individuele studentzoek-/toevoegflow die bestaande `setIndividualLearningSpaceAccess` gebruikt, maar target-space en ownerbevoegdheid server-side controleert.
6. Een transactionele `createLearningSpaceForOwner(input, actorId)`-service en aangepaste creation policy om teachers te laten creëren en direct owner te maken.
7. Een gesplitste lifecycleaction: owner/superadmin archive/restore; permanent delete uitsluitend superadmin en archived.
8. Een samengestelde `/admin/verbindingen`-readlaag: persoonlijk OneDrive voor teacher/admin, plus Smartschool/Google/noodtoegang alleen voor superadmin.

Niet nieuw nodig: een viewer-membershiprol, nieuwe view-accesstabel, nieuwe groepsbron of tweede public-accessresolver.

### Smartschoolgroepen en roster

- `listKnownExternalGroups` levert provider, group-ID en laatst bekende naam. `isClassGroupName` classificeert reeds generiek met `^[3-6]`; klasgroepen en overige groepen kunnen dus zonder schemawijziging worden gesplitst.
- `listManagedGroupUsers` levert users per group-ID, maar mist voor het beoogde roster de volledige naamvelden, klasprioriteit en de concrete reden waarom een user toegang tot één LearningSpace heeft.
- De nieuwe rosterquery moet starten bij de gekozen LearningSpace en twee sets verenigen: users via mappings/snapshots en users via individuele access. Gebruik `UNION`/`DISTINCT` of aggregatie op `users.id`, niet één rij per membership.
- Voor kolom `Klas`: gebruik eerst de lokale class override, anders een Smartschoolgroep waarvan de naam met 3-6 begint. Voeg alleen een niet-klasgroep toe als die groep daadwerkelijk toegang tot deze LearningSpace verleent; zo kan `6WEWI6 • wetenschappen` ontstaan zonder willekeurige andere memberships te tonen.
- Groepssnapshots zijn login-gebonden en kunnen dus verouderd zijn tot de volgende Smartschoollogin. De UI moet ze als opgeslagen Smartschoolinformatie behandelen, niet als live roster.

## 6. Risicopunten

| Risico | Gevolg en maatregel |
| --- | --- |
| Autorisatie bij verplaatste actions | `/admin/toegang` gebruikt nu `requireAdmin`. Iedere nieuwe per-space mutatie moet eerst actor én target `learningSpaceId` controleren; nooit vertrouwen op verborgen formvelden of UI-filtering. |
| Teacher-creatie | Alleen de UI openen is onvoldoende. Creation guard, action en transactionele repository/service moeten samen veranderen; owner-insert moet atomair zijn. |
| Ownership van bronnen | `assignOwnedStorageConnections` koppelt bij een nieuwe OneDrive-bron de connection van de handelende user. Bestaande connection-ID's moeten bij edits behouden of expliciet veilig overgedragen worden; superadmin mag niet impliciet een persoonlijke teacherconnection overnemen. |
| Globale querydata | `listManagedUsers`, memberships en mappings zijn globale datasets. Een ownerpagina mag geen gegevens van andere LearningSpaces lekken; gebruik target-scoped queries. |
| Publieke toegang versus beheer | Voeg geen `viewer` toe aan `learning_space_members`; dat creëert twee bronnen van waarheid naast `individual_learning_space_access`. |
| Lifecycle | Archive/restore/delete delen nu superadminactions en redirects naar `/admin/instellingen`. Splits autorisatie en bestemmingen zonder de archived-before-delete invariant te verzwakken. |
| Gearchiveerde ruimtes | `getManageableLearningSpaceIds` en `/admin` werken alleen met actieve ruimtes. Een archiefweergave heeft een expliciete beheerquery nodig; maak archief niet per ongeluk publiek toegankelijk. |
| Ownerbeheer | De huidige per-space UI kan editors toevoegen/verwijderen, maar geen owners beheren. Bij owneroverdracht moeten minimaal één geldige owner, storageafhankelijkheden en self-removal expliciet worden beslist en getest. |
| Destructieve acties | Permanente delete wist alleen DB-metadata en is correct archived-only. Behoud bevestigingsslug, superadmincheck en repository-invariant. |
| Redirects en oude routes | Actions verwijzen nog naar `/admin/instellingen` en `/admin/toegang`. Verplaats eerst links/actions, voeg tijdelijke compatibiliteit toe en verwijder routes pas nadat tests en bookmarks zijn afgedekt. |
| Dubbele bronnen van waarheid | Kaartdetails en toegangspagina moeten dezelfde membership/mapping/sourcequeries gebruiken als autorisatie; geen aparte UI-only status opslaan. |

## 7. Testdekking

| Onderwerp | Bestaande relevante tests | Huidige dekking / gat |
| --- | --- | --- |
| LearningSpace creation | `src/lib/repositories.test.ts`, `src/app/admin/actions.authorization.test.ts`, `learning-space-create-form.test.tsx` | repositorycreatie, duplicate slug, providerdefaults en superadmin-only guard; nog geen maker-ownertransactie |
| Owner/editor memberships | `src/lib/multi-user.test.ts`, `src/lib/user-management.test.ts`, `database-migrations.test.ts` | beheer/configuratie, upsert/remove, legacy ownerbackfill; per-space editor-actions hebben geen gerichte actiontest |
| Individual view access | `src/lib/user-management.test.ts`, `user-management-view.test.tsx` | combinatie en UI-onderscheid tussen individual/group/management |
| Group mappings | `src/lib/multi-user.test.ts`, `src/lib/user-management.test.ts` | exacte provider/groupID-matching, uniqueness, create/delete, snapshots |
| User access resolution | `src/lib/multi-user.test.ts`, `src/lib/user-management.test.ts`, `src/lib/public-access.test.ts` | groep + individueel + management en noodtoegang; nog geen per-space rosterquery |
| Archive/restore/delete | `src/lib/learning-space-lifecycle.test.ts`, `learning-space-lifecycle-actions.test.tsx`, `src/lib/repositories.test.ts`, `src/lib/source-switch.test.ts` | policy, UI, metadataretentie, DB-only delete en archived source-switchblock; owner archive/restore bestaat nog niet |
| Connections | `src/lib/multi-user.test.ts`, `src/lib/onedrive.test.ts`, `src/app/api/onedrive/connect/route.test.ts`, storage-provider tests | ownershipisolatie, meerdere connections, read-only Graph/PKCE en teacher OAuth-start |
| Smartschool auth/snapshots | `smartschool-auth-flow.test.ts`, `smartschool-client.test.ts`, callback/login route-tests, `multi-user.test.ts` | state, platformbinding, profile/groupnormalisatie, snapshotvervanging, disabled users |
| Admin navigation | `src/app/admin/page.test.ts`, `learning-space-nav.test.tsx`, `admin-space-header.test.tsx`, site-navigationtests | huidige links, compacte nav en rolgedrag; nieuwe routes/zichtbaarheidsregels nog niet afgedekt |
| LearningSpace settings | `learning-space-settings-form.test.tsx`, `src/app/admin/instellingen/page.test.tsx`, `src/app/admin/instellingen/actions.test.ts` | providers, OAuth-link en noodtoegang; geen volledige route-actiontest voor owner/source-edit/lifecycle |
| Source switching | `src/lib/source-switch.test.ts`, componenttests rond bronstatus/sync | vergelijking, marker/security en archived block; behouden bij UI-verplaatsing |

Deze analyse heeft geen tests uitgevoerd; de testbestanden zijn statisch geïnventariseerd.

## 8. Advies voor implementatievolgorde

Het opgesplitste masterplan is technisch logisch, mits functionaliteit eerst wordt **toegevoegd en hergebruikt** en oude globale routes pas als laatste verdwijnen.

1. **Readmodels en autorisatiegrenzen:** voeg target-scoped kaartsummary en rosterquery toe. Leg per toekomstige action vast of owner, editor of superadmin bevoegd is.
2. **Verbindingen samenbrengen:** bouw `/admin/verbindingen` uit met bestaande componenten. Houd persoonlijke OneDrive-data user-scoped en Smartschool/Google/noodtoegang superadmin-only.
3. **Adminoverzicht verrijken:** laad actieve plus optioneel gearchiveerde ruimtes en bestaande membership/group/source-samenvattingen. Verplaats de create-UI naar een modal zonder creation policy al stil te verruimen.
4. **Per-space Toegang read-only:** voeg route/tab en blokken Leraren, Groepen en gebruikers, en Gebruikers toe met de nieuwe scoped queries.
5. **Per-space mutaties:** koppel bestaande individual access, group mappings en editorbeheer aan nieuwe actions met `requireLearningSpaceConfiguration`. Voeg tests toe voordat `/admin/toegang` verdwijnt.
6. **Teacher creation + ownership:** wijzig creation policy en maak LearningSpace, bron(nen) en owner-membership in één transactie. Test rollback, duplicate slug en connection ownership.
7. **Lifecycle herschikken:** verplaats status naar Algemeen; laat owner archive/restore toe via aparte guards, behoud delete superadmin-only/archived-only.
8. **Oude routes afbouwen:** pas alle links en redirects aan, behoud waar nuttig tijdelijke redirects, en verwijder pas daarna de oude inhoud van `/admin/instellingen` en `/admin/toegang`.

Afhankelijkheden die vóór latere UI-batches nodig zijn: de scoped roster/summaryqueries, transactionele ownercreatie en de expliciete lifecycle-authorisatiematrix. Zonder die basis zou de reorganisatie securityregels in componenten dupliceren.
