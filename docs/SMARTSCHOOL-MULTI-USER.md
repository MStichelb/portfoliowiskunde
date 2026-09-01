# Smartschool OAuth en multi-user

## Huidige status

Smartschool OAuth is actief als identity provider boven op het interne user- en autorisatiemodel. De implementatie volgt de [officiële Smartschool OAuth-documentatie](https://www.smartschool.be/oauth/) en gebruikt rechtstreeks het ingestelde schoolplatform, nooit `oauth.smartschool.be`.

De bestaande password-login op `/admin/login` blijft voorlopig beschikbaar voor de compatibility-superadmin. Smartschool bepaalt uitsluitend de geverifieerde externe identiteit en groepen. Lokale rollen en beheerrechten worden nooit uit namen, usernames of groepsnamen afgeleid.

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

Migration `021_multi_user_foundation` bevat users, externe identiteiten, teacher-memberships, groepsmappings en persoonlijke storageconnections. Migration `022_smartschool_oauth` maakt externe identiteit platformgebonden en voegt vervangbare groepssnapshots toe.

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

Publieke pagina's, oplossingsbestanden, portfoliodocumenten en foutmeldingsinzendingen controleren de LearningSpace-toegang opnieuw op de server. Een student kan een andere LearningSpace niet openen door een URL of asset-ID te raden.

Een actieve superadmin beheert alle LearningSpaces. Een actieve teacher beheert alleen LearningSpaces met een lokaal `owner`- of `editor`-membership. Globale lifecycleacties blijven superadmin-only. Disabled users krijgen geen geldige sessie en bestaande sessies stoppen bij de eerstvolgende servercontrole.

## Sessies en tokens

Na de callback krijgt de interne user een revocable databasesessie. De cookie is HMAC-ondertekend, HttpOnly, `SameSite=Lax`, `Secure` in productie en bevat alleen een willekeurige session-ID plus vervaltijd. De database koppelt die sessie aan de interne user.

`userinfo` en `groupinfo` worden onmiddellijk in de callback opgehaald. Daarna is het Smartschool access token niet meer nodig en wordt het niet persistent opgeslagen. Er wordt ook geen Smartschool refresh token bewaard. OneDrive- en Google Drive-credentials en storageproviders worden door deze flow niet gewijzigd.

## Compatibility-superadmin koppelen

1. Meld aan via `/admin/login` met het bestaande beheerwachtwoord.
2. Kies op `/admin` **Smartschool koppelen**.
3. Meld bij Smartschool aan met de identiteit die bij de bestaande compatibility-superadmin hoort.
4. Controleer de bevestiging **Smartschool-account gekoppeld**.
5. Test Smartschool-login in een nieuwe privésessie voordat de password-fallback ooit wordt uitgezet.

De linkflow vereist tijdens start en callback dezelfde actieve superadminsessie. Het interne user-ID en de linkintentie zijn in de getekende OAuth-state vastgelegd. Een Smartschoolidentiteit die al aan een andere interne user gekoppeld is, wordt geweigerd; er wordt geen tweede superadmin aangemaakt.

## Beheer en volgende stap

Groep-naar-LearningSpace-mappings, lokale rollen en teacher-memberships blijven beheerdata in de database. De huidige foundation en autorisatiehelpers ondersteunen ze volledig; een aparte gebruikers- en groepsbeheerinterface is nog niet toegevoegd. De volgende gerichte uitbreiding is zo'n superadmin-UI, zonder wijziging aan de OAuth-flow of automatische roltoekenning.
