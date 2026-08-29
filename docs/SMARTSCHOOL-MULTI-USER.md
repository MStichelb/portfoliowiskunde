# Voorbereiding Smartschool en multi-user

## Huidige status

De applicatie heeft een intern user- en autorisatiemodel, maar communiceert nog niet met Smartschool. Smartschool wordt later uitsluitend een identity provider. Rollen en beheerrechten blijven lokale applicatiedata en worden nooit rechtstreeks uit externe claims overgenomen.

De route `/api/auth/smartschool/callback` bestaat als fail-closed placeholder en antwoordt met HTTP 503 en een duidelijke melding. Er vindt geen authorization request, token exchange of API-call plaats.

## Datamodel

Migration `021_multi_user_foundation` voegt toe:

- `users`: interne gebruiker met `superadmin`, `teacher` of `student` en status `active` of `disabled`;
- `external_identities`: generieke koppeling van provider-subject aan exact één interne user;
- `learning_space_members`: `owner`- of `editor`-rechten voor teachers per LearningSpace;
- `learning_space_group_mappings`: externe groep naar LearningSpace, zonder hardgecodeerde klasnamen;
- `storage_connections`: persoonlijke, door een interne user bezeten storageverbinding;
- `learning_space_sources.storage_connection_id`: expliciete verwijzing van een bron naar de juiste verbinding;
- `admin_sessions.user_id`: sessies zijn aan een interne user gekoppeld.

Een superadmin hoeft geen membership per LearningSpace te hebben. Een actieve superadmin mag alles beheren; een actieve teacher alleen LearningSpaces met een `owner`- of `editor`-membership. Studenten en disabled users hebben geen adminrechten.

## Tijdelijke compatibilitylaag

De bestaande wachtwoordlogin blijft actief. Migration 021 maakt de interne user `user-legacy-superadmin` en koppelt bestaande adminsessies daaraan. `ADMIN_PASSWORD` en `ADMIN_SESSION_SECRET` blijven dus voorlopig vereist.

De bestaande versleutelde OneDrive-token wordt uit de generieke settings naar een persoonlijke `storage_connections`-record van deze compatibility-superadmin gemigreerd. Bestaande OneDrive-bronnen krijgen de bijbehorende `storage_connection_id`. Tokens blijven AES-256-GCM-versleuteld en server-side.

De bestaande adminroutes blijven voorlopig bewust superadmin-only. De centrale helpers voor authenticated users, adminrollen en LearningSpace-management bestaan al, maar teacher-scoped route-integratie wordt pas geactiveerd wanneer er een echte externe teachersessie en beheer-UI zijn. Hierdoor ontstaan nu geen gedeeltelijk beveiligde teacherflows.

## Groepstoegang voor leerlingen

De pure resolver ontvangt genormaliseerde externe groepslidmaatschappen en lokale mappings:

- nul gekoppelde LearningSpaces: geen bestemming;
- één LearningSpace: automatische bestemming;
- meerdere LearningSpaces: keuzelijst.

Providernaam en externe group-ID vormen samen de vergelijking. Parser- of storagegegevens spelen hierin geen rol.

## Toekomstige configuratie

De volgende environment variables zijn gereserveerd maar worden nog niet door runtimecode gelezen:

```text
SMARTSCHOOL_CLIENT_ID
SMARTSCHOOL_CLIENT_SECRET
SMARTSCHOOL_REDIRECT_URI
```

Geplande productiecallback:

```text
https://portfoliowiskunde.vercel.app/api/auth/smartschool/callback
```

Registreer of activeer deze pas nadat de officiële Smartschool OAuth-documentatie voor de concrete omgeving beschikbaar is.

## Volgende activeringsstap

1. Verkrijg van Smartschool de officiële authorization- en tokengegevens, scopes en stabiele identifiers. Leg niets vast op basis van aannames.
2. Implementeer een provider achter `ExternalAuthProvider` die uitsluitend genormaliseerde identity- en groepsdata teruggeeft.
3. Bouw een server-side authorization start en callback met state, PKCE indien officieel ondersteund, veilige cookies en tokenverwerking.
4. Zoek of maak transactioneel de `external_identities`- en `users`-koppeling. Bepaal lokale rollen uitsluitend uit de database.
5. Voeg algemene gebruikerssessies toe voor teacher en student; blokkeer disabled users bij iedere sessieresolutie.
6. Migreer adminpagina's, server actions en admin-assetroutes per LearningSpace van de huidige superadmin-check naar `requireLearningSpaceManagement`. Houd globale user- en LearningSpace-administratie superadmin-only.
7. Voeg een beperkte superadmin-UI toe voor users, memberships en group mappings.
8. Breid de OneDrive-connect-UI uit met het maken/kiezen van een specifieke storageconnection. Bind naast `user_id` ook de bedoelde `storage_connection_id` cryptografisch aan de OAuth-state. Een LearningSpaceSource moet daarna expliciet die connection kiezen.
9. Koppel de huidige superadmin aan een geverifieerde Smartschool-identity. Schakel de wachtwoordcompatibility pas uit nadat login, recovery en beheerrechten in productie zijn gecontroleerd.

Tot die activering zijn er geen Smartschool-secrets nodig en worden geen Smartschoolgegevens opgeslagen.
