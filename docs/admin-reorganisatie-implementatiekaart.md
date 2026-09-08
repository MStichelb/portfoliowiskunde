# Admin-reorganisatie: definitieve implementatie

Dit document beschrijft de afgeronde adminarchitectuur. De huidige code, server-side autorisatie en database zijn leidend.

## 1. Canonieke beheerstructuur

### Globaal beheer

| Route | Doel | Toegang |
| --- | --- | --- |
| `/admin` | Overzicht van actieve en gearchiveerde LearningSpaces, plus acties voor Verbindingen, Gebruikers en Leeromgeving toevoegen | teacher en superadmin |
| `/admin/verbindingen` | Persoonlijke OneDrive-verbinding en globale Smartschool-, Google Drive- en noodtoegangsstatus | teacher; globale onderdelen alleen superadmin |
| `/admin/gebruikers` | Globaal gebruikersoverzicht, rollen, status, profielen en accountacties | alleen superadmin |

Een teacher ziet op `/admin` alleen LearningSpaces met een expliciet `owner`- of `editor`-membership. Een superadmin ziet alle LearningSpaces, maar globale superadminrechten worden niet als expliciet membership voorgesteld. Nieuwe LearningSpaces kunnen door een teacher of superadmin worden aangemaakt; de maker wordt transactioneel eigenaar.

### Per LearningSpace

| Onderdeel | Route | Doel |
| --- | --- | --- |
| Portfolio's | `/admin/[spaceSlug]` | Portfolio's, publicatiestatus, synchronisatie en waarschuwingen |
| Thema's | `/admin/[spaceSlug]/themas` | Thema's aanmaken, sorteren, wijzigen en verwijderen |
| Instellingen | `/admin/[spaceSlug]/instellingen` | Algemeen, Bewerkersrechten, Bronnen, Actieve bron en lifecycle |
| Toegang | `/admin/[spaceSlug]/toegang` | Leraren, Smartschoolgroepen, individuele leerlingen en effectief leerlingenoverzicht |
| Publieke pagina | `/[spaceSlug]` | Publieke leerlingweergave; de adminnavigatie opent rechtstreeks deze route |

Er bestaat bewust geen aparte `/admin/[spaceSlug]/publiek`-pagina. `AdminSpaceHeader` en `LearningSpaceNav` houden de per-space navigatie en context bij elkaar.

## 2. Rollen en toegangsmodel

### Applicatierollen

- `superadmin`: globaal beheer, alle actieve en gearchiveerde LearningSpaces en alle superadmintaken.
- `teacher`: toegang tot `/admin`; beheert alleen LearningSpaces waarvoor een expliciet owner- of editor-membership bestaat.
- `student`: geen adminrechten; krijgt uitsluitend publieke toegang via de centrale accessresolutie.
- Een uitgeschakelde user krijgt geen geldige sessie of toegang, ongeacht rol of bestaande cookie.

### LearningSpace-relaties

- `owner` (Eigenaar): volledig configuratie- en toegangsbeheer voor de LearningSpace.
- `editor` (Bewerker): dagelijks inhoudsbeheer en read-only inzage in lerarenrechten. Leerlingtoegang mag alleen worden gewijzigd wanneer `editors_can_manage_access = true`.
- `viewer` (Kijker): geen waarde in `learning_space_members`, maar individuele publieke kijktoegang via `individual_learning_space_access`.

Globale superadminrechten staan los van expliciete owner/editor-memberships. Een superadmin kan alles beheren, maar verschijnt alleen als expliciete eigenaar of bewerker wanneer zo'n membership werkelijk bestaat.

Publieke toegang is de unie van:

1. een exact gemapte Smartschoolgroep;
2. individuele kijktoegang;
3. een owner- of editor-membership.

Managementrechten impliceren dus publieke kijktoegang. Groepsafgeleide en individuele toegang blijven afzonderlijke routes en worden bij effectieve overzichten per user en LearningSpace gededupliceerd.

## 3. Rechtenmatrix

| Handeling | Superadmin | Eigenaar | Bewerker | Kijker/student |
| --- | --- | --- | --- | --- |
| LearningSpace beheren en inhoud synchroniseren | ja | ja | ja | nee |
| Instellingen en bronnen wijzigen | ja | ja | nee | nee |
| Lerarenrechten wijzigen | ja | ja | read-only | nee |
| Leerlingtoegang wijzigen | ja | ja | alleen bij delegatie aan | nee |
| Archiveren en herstellen | ja | ja | nee | nee |
| Permanent verwijderen | alleen archived | nee | nee | nee |

Alle mutaties controleren de actuele user, doel-LearningSpace en relevante rol opnieuw op de server. UI-verberging is nooit de autorisatiegrens. Voor een gearchiveerde LearningSpace zijn bestaande toegangsmutaties geblokkeerd. Permanent verwijderen blijft alleen mogelijk voor een superadmin en alleen nadat de LearningSpace is gearchiveerd; bronbestanden worden daarbij niet verwijderd.

## 4. Globaal gebruikersbeheer

`/admin/gebruikers` is een superadminoverzicht en beheert geen per-LearningSpace toegang meer.

Voor leraren toont de pagina:

- profiel en genormaliseerde naam;
- beheerrechten en effectieve kijkrechten;
- persoonlijke storageverbinding;
- actieve of uitgeschakelde status;
- veilige rol- en accountacties.

Voor leerlingen toont de pagina:

- profiel en klas, met optionele lokale klasoverride;
- effectieve kijkrechten;
- actieve of uitgeschakelde status;
- veilige rol- en accountacties, inclusief gerichte reset.

Per-LearningSpace lerarenrechten, Smartschoolgroepen en individuele leerlingtoegang worden uitsluitend beheerd via `/admin/[spaceSlug]/toegang`. De globale pagina toont de resulterende rechten alleen als overzicht.

## 5. Verbindingen en bronnen

`/admin/verbindingen` beheert verbindingen, niet de bronkeuze van een LearningSpace:

- Iedere teacher en superadmin kan een eigen persoonlijke OneDrive-verbinding koppelen of opnieuw verbinden.
- Smartschool, publieke noodtoegang en de globale Google Drive-service zijn alleen zichtbaar voor een superadmin.
- OAuth-starts gebruiken echte browsernavigatie; tokens en secrets blijven server-side.

`/admin/[spaceSlug]/instellingen` bevat per LearningSpace de bronconfiguratie:

- Primaire bron en optionele Mirror worden onafhankelijk opgeslagen.
- OneDrive verwijst naar een persoonlijke storageconnection plus stabiele drive- en map-ID.
- Google Drive behoudt de globale read-only mirror/service-accountarchitectuur.
- Lokale bestanden blijven alleen een development- en testprovider.
- Alle providers zijn vanuit de webapp read-only.

Een verbinding staat dus los van de LearningSpace-configuratie. De bron verwijst expliciet naar de juiste storageconnection; een superadmin behandelt de persoonlijke OneDrive-token van een andere teacher nooit impliciet als eigen verbinding.

## 6. Canonieke en legacy routes

De canonieke workflows zijn:

- globale acties via `/admin`;
- verbindingen via `/admin/verbindingen`;
- users via `/admin/gebruikers`;
- toegang per LearningSpace via `/admin/[spaceSlug]/toegang`;
- instellingen per LearningSpace via `/admin/[spaceSlug]/instellingen`.

Alleen voor bestaande bookmarks blijven beveiligde compatibility-redirects bestaan:

- `/admin/instellingen` redirect na superadmincontrole naar `/admin`;
- `/admin/toegang` redirect na superadmincontrole naar `/admin/gebruikers`.

Nieuwe documentatie en interne links gebruiken deze legacy routes niet als primaire workflow.

## 7. Masterplan afgerond

Gerealiseerd:

- compact globaal LearningSpace-overzicht met details en archiefweergave;
- gecentraliseerde Verbindingen-pagina;
- transactionele LearningSpace-creatie met de maker als eigenaar;
- per-space tabs voor Portfolio's, Thema's, Instellingen en Toegang;
- per-space lerarenbeheer met Eigenaar, Bewerker en Kijker;
- groeps- en individuele leerlingtoegang met een gededupliceerd roster;
- optionele delegatie van leerlingtoegang aan bewerkers;
- lifecycle in Instellingen met owner/superadmin archive en restore;
- superadmin-only, archived-only permanente verwijdering;
- globale userpagina als overzicht in plaats van tweede bron van per-space toegangsbeheer;
- beveiligde legacy redirects.

Bewust uitgesteld:

- overdracht van ownership tussen users;
- extra toekomstige editorrechten buiten de huidige delegatietoggle;
- verdere bronflexibiliteit, zoals meerdere actieve verbindingen kiezen in de OAuth-UI of nieuwe providers;
- archivering of historische tracking van users buiten de huidige veilige resetflow.

Nog handmatig in productie te controleren zijn echte Smartschool- en OneDrive-authenticatie, externe folderrechten, sync met productiebestanden en de volledige rolmatrix met echte accounts. Deze checks muteren geen productiegegevens tenzij de beheerder de betreffende test bewust uitvoert.

## 8. Regressiedekking

De automatische suite dekt onder meer:

- sessies, rolling expiration, logout, disabled users en actuele rolwijzigingen;
- superadmin-, teacher- en studentautorisatie;
- owner/editor-management en afzonderlijke viewer-access;
- groep, individueel, groep plus individueel zonder duplicaten en delegatie aan/uit;
- archived access-invariants;
- transactionele creatie en storageconnection-ownership;
- archive, restore, archived-only delete en DB-only cleanup;
- canonieke routes, beveiligde legacy redirects en per-space deep links;
- OneDrive PKCE/read-only grenzen, connection-isolatie, sourceconfiguratie en source switching.

## 9. Productiechecklist

1. Meld een teacher aan via Smartschool en controleer de lokale rol en navbar.
2. Meld een student aan via Smartschool en controleer de toegankelijke LearningSpaces.
3. Controleer dat een uitgeschakelde Smartschooluser de normale disabled-melding krijgt en geen sessie.
4. Laat een eigenaar leraren-, groeps- en individuele toegang wijzigen.
5. Controleer dat een bewerker bij delegatie UIT leerlingtoegang alleen kan bekijken.
6. Controleer dat dezelfde bewerker bij delegatie AAN groepen en individuele leerlingen kan beheren.
7. Controleer een superadmin met expliciet owner- en editor-membership; globale rechten en badges mogen niet worden vermengd.
8. Maak als teacher een nieuwe LearningSpace en controleer het owner-membership en de lege toestand zonder bron.
9. Koppel de persoonlijke OneDrive van die teacher via `/admin/verbindingen`.
10. Selecteer die verbinding onder LearningSpace `Instellingen > Bronnen`.
11. Synchroniseer bestaande bestanden en controleer portfolio's, warnings en beveiligde assets.
12. Hernoem of verplaats de bronmap zonder de map-ID te wijzigen en controleer dat de bron bruikbaar blijft.
13. Controleer de publieke studentweergave en weigering van niet-toegankelijke deep links/assets.
14. Test archiveren en herstellen als eigenaar; controleer dat toegangsmutaties archived geblokkeerd zijn.
15. Controleer `/admin/instellingen` naar `/admin` en `/admin/toegang` naar `/admin/gebruikers` met een bevoegde sessie.

Voer destructieve production checks, zoals permanent verwijderen of user reset, alleen uit met speciaal aangemaakte testdata.
