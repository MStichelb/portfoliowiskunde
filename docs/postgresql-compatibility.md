# PostgreSQL-compatibiliteit

De lokale ontwikkelomgeving en de gewone Vitest-suite gebruiken SQLite/libSQL. Productie gebruikt PostgreSQL. Gedeelde migraties en runtimequery's moeten daarom in beide databases geldig zijn.

## Geautomatiseerde controle

`src/lib/sql-portability.test.ts` blokkeert bekende SQLite-only constructies en PostgreSQL-onveilige, ongetypeerde parameterpatronen. De workflow `.github/workflows/postgresql-compatibility.yml` start daarnaast voor elke pull request en push naar `main` een lege PostgreSQL 16-service en voert uit:

```text
corepack pnpm test:postgres
```

Deze integratietest past alle migraties toe en voert representatieve gedeelde repositoryquery's uit, inclusief unieke naamcontroles, LearningSpace-updates, `ON CONFLICT` en `RETURNING`.

Maak in de GitHub-ruleset voor `main` de statuscheck `PostgreSQL compatibility / postgresql-compatibility` verplicht. Daardoor kan een pull request met incompatibele SQL niet worden gemerged voordat Vercel de productiebranch bouwt.

## Lokaal uitvoeren

Gebruik uitsluitend een lege, tijdelijke PostgreSQL-database. Zet in PowerShell de URL en start daarna de test:

```powershell
$env:POSTGRES_TEST_DATABASE_URL = "postgresql://portfolio:portfolio@localhost:5432/portfolio_test"
corepack pnpm test:postgres
```

De test wordt in de gewone SQLite-suite overgeslagen wanneer `POSTGRES_TEST_DATABASE_URL` ontbreekt. Databasegevoelige wijzigingen zijn pas releaseklaar nadat zowel de gewone database-/migratietests als deze PostgreSQL-test slagen.
