# Smartschool OAuth en multi-user

## Huidige status

Smartschool OAuth is actief als identity provider boven op het interne user- en autorisatiemodel. De implementatie volgt de [officiële Smartschool OAuth-documentatie](https://www.smartschool.be/oauth/) en gebruikt rechtstreeks het ingestelde schoolplatform, nooit `oauth.smartschool.be`.

De bestaande password-login staat afzonderlijk op `/breakglass` en blijft als streng beveiligde noodtoegang beschikbaar voor de compatibility-superadmin. De gewone loginpagina's tonen uitsluitend **Aanmelden met Smartschool** en verwijzen nergens naar deze recoveryroute. Smartschool bepaalt uitsluitend de geverifieerde externe identiteit en groepen. Lokale rollen en beheerrechten worden nooit uit namen, usernames of groepsnamen afgeleid.

## Routes en officiële endpoints

- `GET /api/auth/smartschool/login` start de Authorization Code-flow;
- `GET /api/auth/smartschool/callback` valideert state, wisselt de code in en maakt de interne sessie;
- `GET /api/auth/smartschool/link` start dezelfde flow als expliciete koppeling voor een reeds aangemelde superadmin.

Voor `SMARTSCHOOL_PLATFORM_URL=https://school.smartschool.be` gebruikt de server:

```text
https://school.smartschool.be/OAuth
https://school.smartschool.be/OAuth/index/token
https://school.smartschool.be/Api/V1/userinfo
https://school.smartschool.be/Api/V1/groupinfo
```

De gevraagde scopes zijn exact `userinfo groupinfo`. Authorization gebruikt `response_type=code`, de exacte redirect URI en een cryptografisch willekeurige state. De state, intentie en eventuele lokale terugkeerbestemming zitten in een getekende, kortlevende HttpOnly-cookie met `SameSite=Lax` en `Secure` in productie.

De tokenexchange en profielcalls gebeuren server-side met het officieel ondersteunde `application/x-www-form-urlencoded` POST-formaat. Daardoor staat het access token niet in browserdata of API-querylogs.

## Configuratie

```text
SMARTSCHOOL_CLIENT_ID
SMARTSCHOOL_CLIENT_SECRET
SMARTSCHOOL_PLATFORM_URL
SMARTSCHOOL_REDIRECT_URI
```

Lokale callback:

```text
http://localhost:3000/api/auth/smartschool/callback
```

Exacte productiecallback:

```text
https://portfoliowiskunde.vercel.app/api/auth/smartschool/callback
```

`SMARTSCHOOL_PLATFORM_URL` is alleen de HTTPS-origin van het eigen Smartschoolplatform, zonder pad, query of fragment. Client secret en sessiesleutel blijven uitsluitend in de server-environment.

## Identiteit, groepen en rollen

Migration `021_multi_user_foundation` bevat users, externe identiteiten, teacher-memberships, groepsmappings en persoonlijke storageconnections. Migration `022_smartschool_oauth` maakt externe identiteit platformgebonden en voegt vervangbare groepssnapshots toe. De actuele keten loopt tot `025_editor_student_access_delegation`, dat de optionele delegatie van leerlingtoegang aan bewerkers vastlegt.

De identity key bestaat uit:

```text
provider = smartschool
provider_subject = userinfo.userID
provider_platform = genormaliseerde userinfo.platform
```

Een bestaande key hergebruikt altijd dezelfde interne user. Een onbekende key maakt een actieve interne user met rol `student`. Smartschool kan nooit automatisch `teacher` of `superadmin` toekennen en wijzigt een bestaande lokale rol niet.

`groups` en `parentGroups` worden defensief genormaliseerd met hun echte `groupID`. Beide soorten worden bewaard, maar toegang ontstaat alleen door een expliciete lokale mapping met exact hetzelfde provider/group-ID. Gelijke groepsnamen, hiërarchie of klassenamen geven nooit impliciet toegang. De snapshot wordt bij iedere Smartschool-login volledig vervangen.

Studentrouting:

- nul gemapte LearningSpaces: `/geen-leeromgeving`;
- één gemapte LearningSpace: automatische redirect;
- meerdere gemapte LearningSpaces: keuzelijst op `/`.

De navigatie volgt dezelfde actuele toegang. Bij exact één LearningSpace ziet een leerling geen overbodige selector en gaat Home rechtstreeks naar die leeromgeving. Bij meerdere LearningSpaces gaat Home naar de keuzepagina; op smalle schermen gebruikt de navigatie één compacte dropdown. Alleen teachers en superadmins zien de beheerknop.

Publieke pagina's, oplossingsbestanden, portfoliodocumenten en foutmeldingsinzendingen controleren de LearningSpace-toegang opnieuw op de server. Een student kan een andere LearningSpace niet openen door een URL of asset-ID te raden.

Een actieve superadmin beheert alle LearningSpaces. Een actieve teacher beheert alleen LearningSpaces met een lokaal `owner`- of `editor`-membership. Een `owner` kan ook de bronconfiguratie beheren. Een `editor` kan de dagelijkse inhoud, publicatie, foutmeldingen en synchronisatie beheren, maar kan niet impliciet een bron aan de eigen storageconnection koppelen. Meerdere teachers kunnen zo dezelfde LearningSpace beheren terwijl de bron naar de persoonlijke storageconnection van een andere user blijft verwijzen.

Een actieve teacher of superadmin kan een LearningSpace aanmaken; de maker wordt transactioneel eigenaar. Een eigenaar of superadmin kan de LearningSpace archiveren en herstellen. Permanent verwijderen blijft uitsluitend voor superadmins en alleen wanneer de LearningSpace gearchiveerd is.

## Sessies en tokens

Na de callback krijgt de interne user een revocable databasesessie van 30 dagen. De cookie is HMAC-ondertekend, HttpOnly, `SameSite=Lax`, `Secure` in productie en bevat alleen een willekeurige session-ID plus vervaltijd. De database koppelt die sessie aan de interne user. Bij actief gebruik vernieuwt de app de vervaltijd rolling zodra minder dan 15 dagen resten.

Rol, status en LearningSpace-toegang staan niet in de cookie. Iedere server-side autorisatiecheck leest de actuele user en rechten uit de database. Daardoor gelden een rolwijziging of het uitschakelen van een user meteen, ook wanneer de browser nog een geldige cookie heeft. Uitloggen trekt de databasesessie in en wist de cookie.

`userinfo` en `groupinfo` worden onmiddellijk in de callback opgehaald. Daarna is het Smartschool access token niet meer nodig en wordt het niet persistent opgeslagen. Er wordt ook geen Smartschool refresh token bewaard. OneDrive- en Google Drive-credentials en storageproviders worden door deze flow niet gewijzigd.

## Compatibility-superadmin koppelen

1. Meld alleen voor herstel rechtstreeks aan via `/breakglass` met het bestaande beheerwachtwoord.
2. Open `/admin/verbindingen` en kies **Smartschool koppelen**.
3. Meld bij Smartschool aan met de identiteit die bij de bestaande compatibility-superadmin hoort.
4. Controleer de bevestiging **Smartschool-account gekoppeld**.
5. Test Smartschool-login in een nieuwe privésessie voordat de password-fallback ooit wordt uitgezet.

De linkflow vereist tijdens start en callback dezelfde actieve superadminsessie. Het interne user-ID en de linkintentie zijn in de getekende OAuth-state vastgelegd. Een Smartschoolidentiteit die al aan een andere interne user gekoppeld is, wordt geweigerd; er wordt geen tweede superadmin aangemaakt.

## Break-glass admin access

De wachtwoordroute kan uitsluitend een sessie voor `user-legacy-superadmin` maken. Queryparameters, Smartschoolprofielen en gewone users kunnen via deze route geen superadmin worden. De bestaande rate limiting blijft actief. Geslaagde, ongeldige en rate-limited pogingen worden als veilige technische events gelogd zonder wachtwoord, token, authorization code of persoonsgegeven.

Gebruik `/breakglass` alleen wanneer Smartschool tijdelijk niet beschikbaar is. De afwezigheid van een zichtbare link en de afzonderlijke URL bieden alleen extra obscurity; het sterke environment-wachtwoord, de server-side compatibility-usercontrole, rate limiting en veilige sessie zijn de werkelijke bescherming. Een Smartschoolstoring verwijdert of wijzigt de lokale superadminrol nooit.

## Publieke noodtoegang

Een superadmin kan op `/admin/verbindingen` **Publieke noodtoegang** tijdelijk inschakelen. Deze DB-persistente instelling staat standaard uit en registreert wanneer ze werd geactiveerd. Inschakelen vereist een expliciete bevestiging en actieve noodtoegang blijft zichtbaar in de adminomgeving.

Wanneer de instelling actief is, mogen niet-aangemelde bezoekers alle actieve LearningSpaces openen. Zonder Smartschoolidentiteit is groepsfiltering onmogelijk. De bestaande repositoryqueries blijven uitsluitend effectief zichtbare portfolio's, oefeningen, documenten en alternatieve uitwerkingen teruggeven. Adminroutes, teacherbeheer, bronconfiguratie en break-glass krijgen nooit een uitzondering. Uitschakelen herstelt onmiddellijk de normale Smartschooltoegangscontrole. Er is bewust geen automatische vervaltijd; de hoofdbeheerder moet de tijdelijke uitzondering weer uitschakelen.

## Veilige foutafhandeling

Wanneer authorization, tokenexchange of de profielcall faalt, ziet de gebruiker alleen: **Aanmelden via Smartschool is momenteel niet beschikbaar. Probeer het later opnieuw.** De server logt uitsluitend het fouttype en de flowintentie, nooit tokens, codes, secrets of profieldata. Reeds geldige interne sessies blijven bruikbaar.

## Beheerinterface

Superadmins openen via `/admin/gebruikers` het globale overzicht **Gebruikers**. Daar kunnen zij:

- studenten en leraren lokaal van rol laten wisselen;
- users activeren of uitschakelen;
- zien aan welke user een persoonlijke storageconnection behoort;
- veilige accountresets uitvoeren wanneer ownership- en storage-invariants dat toelaten.

Per-LearningSpace toegang wordt niet op deze globale pagina beheerd. Eigenaren en bevoegde bewerkers gebruiken `/admin/[spaceSlug]/toegang` voor lerarenrechten, Smartschoolgroepen en individuele leerlingen. Eén groepsmapping geeft iedere bekende leerling met hetzelfde opgeslagen groupID automatisch toegang. Het roster toont alleen users die minstens één keer via Smartschool hebben aangemeld; de app haalt geen volledige officiële klaslijst op.

De UI kent nooit de superadminrol toe en voorkomt dat de laatste actieve superadmin wordt uitgeschakeld. Een groepsnaam is alleen een leesbaar label; toegang gebruikt steeds provider plus exact `groupID`. Dubbele mappings worden door database en servicegrens geweigerd.

Een `owner` en `editor` kunnen dezelfde LearningSpace beheren. De editor kan inhoud, publicatie, meldingen en synchronisatie beheren zonder een eigen OneDriveverbinding te koppelen. De expliciete storageconnection blijft eigendom van haar user; alleen de owner of superadmin kan de bronconfiguratie vervangen. Een editor kan leerlingtoegang alleen wijzigen wanneer de eigenaar de delegatie `editors_can_manage_access` heeft ingeschakeld.

## Bronnenhulp

De actie **Hulp bij bronnen** is voor teachers en superadmins beschikbaar in beheer en bij de broninstellingen. De inhoud komt uit `docs/BRONNEN-INSTELLEN.md`, zodat de in-app uitleg en de technische documentatie dezelfde werkwijze beschrijven.
