# Installatie en herstel op een nieuwe Windows-pc

Deze handleiding bouwt de lokale productie-mirror van Portfolio Wiskunde opnieuw op een volledig nieuwe Windows-pc. Ze is geschreven voor een beheerder die commando's kan kopieren en plakken, maar geen infrastructuurexpert hoeft te zijn.

De definitieve keten blijft:

```text
School-OneDrive (bron van waarheid)
  -> OneDrive desktopclient op een vaste Windows-pc
  -> rclone sync
  -> persoonlijke Google Drive mirror
  -> read-only GoogleDriveProvider
  -> Vercel + Neon
```

> **Belangrijk:** voer opdrachten met placeholders zoals `<WINDOWS_USER>` of `<VOLLEDIG_PAD>` nooit letterlijk uit. Vervang ze eerst door de waarde voor de nieuwe pc. Plaats geen secrets in Git, screenshots, logs of chat.

## 1. Wat je vooraf nodig hebt

### Accounts en toegang

Zorg dat je kunt aanmelden bij:

- het school-OneDrive-account met toegang tot de map `PORTFOLIO`;
- het persoonlijke Google-account waarin `Portfolio Wiskunde Mirror` staat;
- Google Cloud project `Portfoliowiskunde`;
- de GitHub-repository `MStichelb/portfoliowiskunde`;
- het bestaande Vercel-project;
- de bestaande Neon-database;
- de veilige locatie waar production secrets en herstelcodes worden beheerd.

### Lokale software

Op de nieuwe pc zijn nodig:

- Git;
- Node.js 20 of nieuwer;
- pnpm via Corepack;
- rclone;
- de OneDrive desktopclient.

Windows 11 bevat normaal al `winget`. Controleer dit in PowerShell:

```powershell
winget --version
```

**Verwacht resultaat:** een versienummer. Werk Windows/App Installer bij als `winget` niet wordt herkend.

### Secrets die nooit in Git mogen

Bewaar minstens deze waarden uitsluitend in een password manager, secret manager, `.env.local` of de beveiligde deploymentomgeving:

- `GOOGLE_SERVICE_ACCOUNT_JSON_B64`;
- `ADMIN_PASSWORD`;
- `ADMIN_SESSION_SECRET`;
- `DATABASE_URL`;
- Google OAuth client secret voor rclone;
- het service-account JSON-bestand en de private key daarin;
- Microsoft/OneDrive client secret en token-encryptiesleutel indien die provider wordt gebruikt.

`.env.local`, `.env*`, `.data/`, rclone-configuratie en service-accountkeys mogen niet worden gecommit. Controleer voor iedere commit:

```powershell
git status --short
```

## 2. Repository herstellen

### 2.1 Git installeren

Open PowerShell en voer uit:

```powershell
winget install --id Git.Git -e
```

Sluit daarna PowerShell en open een nieuw venster:

```powershell
git --version
```

**Verwacht resultaat:** `git version ...`.

### 2.2 Repository clonen

Gebruik bijvoorbeeld `Documents\GitHub`:

```powershell
$githubRoot = Join-Path $HOME "Documents\GitHub"
New-Item -ItemType Directory -Force -Path $githubRoot | Out-Null
Set-Location $githubRoot
git clone https://github.com/MStichelb/portfoliowiskunde.git
Set-Location (Join-Path $githubRoot "portfoliowiskunde")
git branch --show-current
```

**Verwacht resultaat:** de laatste regel is `main`. Controleer daarna:

```powershell
git status
```

**Verwacht resultaat:** `working tree clean`.

### 2.3 Node.js en pnpm installeren

```powershell
winget install --id OpenJS.NodeJS.LTS -e
```

Open opnieuw een PowerShell-venster en ga terug naar de repository:

```powershell
Set-Location "$HOME\Documents\GitHub\portfoliowiskunde"
node --version
corepack enable
corepack prepare pnpm@11.16.0 --activate
pnpm --version
```

**Verwacht resultaat:** Node.js 20 of nieuwer en pnpm `11.16.0` of een compatibele nieuwere versie. Als `corepack` ontbreekt:

```powershell
npm install --global corepack
corepack enable
corepack prepare pnpm@11.16.0 --activate
```

### 2.4 Dependencies en lokale environment

```powershell
pnpm install
Copy-Item -LiteralPath ".env.example" -Destination ".env.local"
notepad .env.local
```

Vul lokale waarden in zonder ze te committen. Minimaal:

```dotenv
ADMIN_PASSWORD=<STERK-UNIEK-LOKAAL-WACHTWOORD>
ADMIN_SESSION_SECRET=<AFZONDERLIJKE-WILLEKEURIGE-SLEUTEL-MINSTENS-32-TEKENS>
PORTFOLIO_SOURCE_PATH=C:\Users\<WINDOWS_USER>\OneDrive\PORTFOLIO
GOOGLE_SERVICE_ACCOUNT_JSON_B64=<ALLEEN-INDIEN-GOOGLE-LOKAAL-WORDT-GETEST>
```

Gebruik lokaal bij voorkeur andere adminsecrets dan in productie. Productievariabelen blijven in Vercel; ze hoeven niet naar een nieuwe mirror-pc te worden gekopieerd om rclone te laten werken.

Controleer dat Git het bestand negeert:

```powershell
git check-ignore -v .env.local
```

**Verwacht resultaat:** een regel die naar `.gitignore` verwijst.

### 2.5 Applicatie en kwaliteitscontroles

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

**Verwacht resultaat:** alle opdrachten eindigen zonder foutcode. Start lokaal:

```powershell
pnpm dev
```

Open `http://localhost:3000/admin`. Stop de server later met `Ctrl+C`.

## 3. School-OneDrive lokaal voorbereiden

1. Open **OneDrive** via Start.
2. Meld aan met het schoolaccount.
3. Laat OneDrive de schoolbibliotheek synchroniseren.
4. Zoek in Verkenner de map `PORTFOLIO`.
5. Klik rechts op `PORTFOLIO` en kies **Altijd behouden op dit apparaat**, **Always keep on this device** of de gelijkwaardige Files On-Demand-optie.
6. Wacht tot de mappen en bestanden een volledig groene statusindicator hebben.

De definitieve bronroot heeft deze vorm:

```text
C:\Users\<WINDOWS_USER>\OneDrive\PORTFOLIO
```

`<WINDOWS_USER>` kan op iedere pc anders zijn. Controleer de echte gebruikersmap:

```powershell
$env:USERNAME
Test-Path -LiteralPath "C:\Users\$env:USERNAME\OneDrive\PORTFOLIO"
```

**Verwacht resultaat:** de tweede opdracht geeft `True`. Als ze `False` geeft, zoek de werkelijke OneDrive-map in Verkenner en pas later `$source` in `mirror.ps1` aan.

De structuur is:

```text
PORTFOLIO/
+-- 5WIS/
+-- 6WIS/
`-- <toekomstige LearningSpaces>/
```

Elke directe submap wordt automatisch gespiegeld. Voeg geen extra organisatorische map tussen `PORTFOLIO` en `5WIS`/`6WIS` toe.

> **Waarom offline beschikbaar?** Online-only placeholders kunnen tijdens een geplande taak onvolledig of niet tijdig hydrateerbaar zijn. De mirror-pc moet de bronbestanden betrouwbaar kunnen lezen.

## 4. Rclone installeren

```powershell
winget install Rclone.Rclone
```

Open een nieuw PowerShell-venster:

```powershell
rclone version
```

**Verwacht resultaat:** de eerste regel begint met `rclone v`.

## 5. Google OAuth voor rclone configureren

Rclone gebruikt het persoonlijke Google-account met schrijfrechten. Dit is bewust een andere identiteit dan het read-only service account van de webapp.

### 5.1 Google Cloud voorbereiden

1. Open [Google Cloud Console](https://console.cloud.google.com/) en selecteer project `Portfoliowiskunde`.
2. Ga naar **APIs & Services > Library**, **API Library** of de gelijkwaardige API-bibliotheek.
3. Zoek **Google Drive API** en kies **Enable/Inschakelen** als ze nog niet actief is.
4. Open **Google Auth Platform** of **APIs & Services > OAuth consent screen**.
5. Configureer de doelgroep als **External/Extern**.
6. **Testing/Testen** is voldoende voor de eerste setup.
7. Open **Audience/Doelgroep > Test users/Testgebruikers** en voeg het persoonlijke Google-account toe.

> **Valkuil:** voeg dezelfde testgebruiker niet opnieuw toe als die al in de lijst staat. Google kan een dubbele toevoeging als `ineligible` weigeren. Controleer eerst de bestaande lijst.

Een External-app in Testing kan periodieke herauthenticatie vereisen. Google laat testautorisaties voor deze Drive-scope normaal na zeven dagen verlopen. Publiceer de OAuth-app later als **In production** als blijvende rclone-autorisatie nodig is; Google kan daarbij een unverified-appwaarschuwing of verificatievereisten tonen.

### 5.2 Desktop OAuth-client maken

1. Open **Clients**, **Credentials/Referenties** of **APIs & Services > Credentials**.
2. Kies **Create credentials > OAuth client ID**.
3. Application type: **Desktop app/Desktop-app**.
4. Geef een herkenbare naam, bijvoorbeeld `rclone vaste mirror-pc`.
5. Maak de client en bewaar client ID en client secret tijdelijk in een password manager.

Plaats client ID of secret nooit in deze repository. Bij vervanging van de pc kan dezelfde OAuth-client opnieuw worden gebruikt.

### 5.3 Rclone remote `gdrive` maken

Start:

```powershell
rclone config
```

Beantwoord de interactieve vragen als volgt. Nummering kan per rcloneversie verschillen; kies op basis van naam en letterlijke waarde:

1. `n` - **New remote**.
2. Naam: `gdrive`.
3. Storage type: **Google Drive**, met interne waarde `drive`.
4. Client ID: plak de eigen Desktop OAuth client ID.
5. Client secret: plak de eigen client secret.
6. Scope: kies **Full access all files**, met letterlijke waarde `drive`.
7. Root folder ID: leeg laten.
8. Service account file: leeg laten.
9. Advanced config: `n`/nee.
10. Browser authentication: `y`/ja.
11. Meld in de browser aan met het persoonlijke Google-account en geef toestemming.
12. Shared Drive/Team Drive: `n`/nee.
13. Bevestig en bewaar de remote.

> **Kritieke valkuil:** gebruik als scope `drive` of de menuoptie **Full access**. Gebruik niet `access` en niet `https://www.googleapis.com/auth/full`. Die ongeldige waarden veroorzaakten tijdens de eerste installatie Google-fout `400 invalid_scope`.

Test daarna:

```powershell
rclone lsd gdrive:
```

**Verwacht resultaat:** een lijst met mappen uit de persoonlijke Google Drive, eventueel inclusief `Portfolio Wiskunde Mirror`.

> **Padvalkuil:** een rclone remote gebruikt `gdrive:`. Schrijf nooit `gdrive\:`. Een backslash voor de dubbele punt maakt het pad ongeldig.

De rclone-config bevat OAuth-tokens. Zoek de locatie alleen indien nodig met `rclone config file`, beveilig het Windows-account en commit dit bestand nooit.

Officiele naslag bij gewijzigde menu's: [rclone Google Drive-configuratie](https://rclone.org/drive/), [Google Auth Platform-doelgroep](https://support.google.com/cloud/answer/15549945) en [Google OAuth-tokenverval](https://developers.google.com/identity/protocols/oauth2).

## 6. Google service account voor de webapp

De twee Google-identiteiten hebben tegengestelde rechten:

| Identiteit | Doel | Rechten |
| --- | --- | --- |
| Persoonlijk Google OAuth-account in rclone | Mirror schrijven en history beheren | Read/write via scope `drive` |
| Webapp-service-account | Portfolio's indexeren en assets streamen | Viewer + scope `drive.readonly` |

### 6.1 Service account en key

1. Open project `Portfoliowiskunde` in Google Cloud Console.
2. Ga naar **IAM & Admin > Service Accounts**.
3. Kies **Create service account**.
4. Geef een herkenbare naam, bijvoorbeeld `portfolio-wiskunde-webapp`.
5. Ken geen brede projectrol toe; voor Drive-toegang wordt de map zelf gedeeld.
6. Open het nieuwe account en kies **Keys > Add key > Create new key > JSON**.
7. Download het JSON-bestand naar een tijdelijke, beveiligde locatie.

> **Waarschuwing:** het JSON-bestand bevat een private key. Plaats het nooit in Git, OneDrive-mirrormappen, logs of chat.

### 6.2 Base64 maken

```powershell
$serviceAccountJson = "C:\PAD\NAAR\key.json"
$base64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($serviceAccountJson))
$base64 | Set-Clipboard
```

Plaats de waarde lokaal alleen indien de Google-provider lokaal moet worden getest:

```dotenv
GOOGLE_SERVICE_ACCOUNT_JSON_B64=<PLAK-HIER-DE-BASE64-ZONDER-AANHALINGSTEKENS>
```

Voeg dezelfde key in Vercel toe als **Sensitive** environment variable voor **Production** en redeploy. Controleer eerst dat de variabele correct is opgeslagen; verwijder daarna het tijdelijke JSON-bestand veilig van de pc.

### 6.3 Mirrorfolders delen

1. Lees `client_email` uit het service-account JSON-bestand.
2. Open persoonlijke Google Drive.
3. Deel iedere relevante map `Portfolio Wiskunde Mirror/current/<LearningSpace>` met dat e-mailadres.
4. Kies **Viewer/Kijker**, nooit Editor.

De webapp vraagt uitsluitend `https://www.googleapis.com/auth/drive.readonly` aan en kan daardoor geen bronbestanden wijzigen of verwijderen.

## 7. Google Drive mirrorstructuur

De definitieve structuur is:

```text
Portfolio Wiskunde Mirror/
+-- current/
|   +-- 5WIS/
|   +-- 6WIS/
|   `-- ...
`-- history/
    `-- YYYY-MM-DD/
```

- `current/` bevat de actuele eenrichtingsmirror en de completion marker per LearningSpace.
- `history/` bevat alleen bestanden die op het doel vervangen of verwijderd werden.
- `history/` is geen volledige snapshot of volledige backup van `current/`.
- Datum-historymappen ouder dan 60 dagen worden na een succesvolle mirror verwijderd.
- Niet-datum-mappen onder `history/` worden nooit automatisch verwijderd.
- History mag handmatig worden verwijderd en wordt niet opnieuw opgebouwd.

Herstel een gewenst bestand uit history naar School-OneDrive, de bron van waarheid, en laat daarna de mirror opnieuw lopen.

## 8. Definitieve `mirror.ps1`

Sla het script op als:

```text
C:\Users\<WINDOWS_USER>\OneDrive\ALGEMEEN\APPS\Portfolio\mirror.ps1
```

Maak de map indien nodig. Vervang in onderstaande bewezen productieversie `<WINDOWS_USER>` door de echte Windows-gebruikersmap. Controleer vooral `$source`; het script ontdekt alle directe LearningSpaces automatisch.

```powershell
$ErrorActionPreference = "Stop"

# ============================================================
# CONFIGURATIE
# ============================================================

$source = "C:\Users\<WINDOWS_USER>\OneDrive\PORTFOLIO"

$destination = "gdrive:Portfolio Wiskunde Mirror/current"
$historyRoot = "gdrive:Portfolio Wiskunde Mirror/history"

$retentionDays = 60

$date = Get-Date -Format "yyyy-MM-dd"
$backup = "$historyRoot/$date"

$logDir = Join-Path $PSScriptRoot "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$logFile = Join-Path $logDir ("mirror-" + $date + ".log")

Write-Host "Portfolio mirror gestart..."

# ============================================================
# 0. VEILIGHEIDSCONTROLES
# ============================================================

if (-not (Test-Path -LiteralPath $source -PathType Container)) {
    Write-Host "FOUT: bronmap bestaat niet: $source"
    exit 1
}

$learningSpaces = Get-ChildItem -LiteralPath $source -Directory

if ($learningSpaces.Count -eq 0) {
    Write-Host "FOUT: geen LearningSpace-mappen gevonden onder $source"
    exit 1
}

Write-Host "Gevonden LearningSpaces:"

foreach ($space in $learningSpaces) {
    Write-Host " - $($space.Name)"
}

# ============================================================
# 1. OUDE COMPLETION MARKERS ONGELDIG MAKEN
# ============================================================

& rclone delete $destination `
    --include "*/_mirror-complete.json" `
    --log-file $logFile `
    --log-level INFO

if ($LASTEXITCODE -ne 0) {
    Write-Host "FOUT: bestaande completion markers konden niet veilig worden verwijderd."
    Write-Host "Bekijk: $logFile"
    exit $LASTEXITCODE
}

# ============================================================
# 2. VOLLEDIGE PORTFOLIO-ROOT SPIEGELEN
# ============================================================

& rclone sync $source $destination `
    --backup-dir $backup `
    --delete-after `
    --max-delete 10 `
    --min-age 2m `
    --track-renames `
    --exclude "~$*" `
    --exclude "*.partial" `
    --exclude "_mirror-complete.json" `
    --log-file $logFile `
    --log-level INFO

if ($LASTEXITCODE -ne 0) {
    Write-Host "FOUT: mirror niet voltooid."
    Write-Host "Er worden geen completion markers aangemaakt."
    Write-Host "De webapp blijft daardoor de laatst geldige index gebruiken."
    Write-Host "Bekijk: $logFile"
    exit $LASTEXITCODE
}

# ============================================================
# 3. COMPLETION MARKER PER LEARNINGSPACE PLAATSEN
# ============================================================

foreach ($space in $learningSpaces) {

    $markerLocal = Join-Path $env:TEMP "_mirror-complete-$($space.Name).json"
    $markerRemote = "$destination/$($space.Name)/_mirror-complete.json"

    $marker = @{
        completedAt   = (Get-Date).ToUniversalTime().ToString("o")
        source        = "school-onedrive"
        learningSpace = $space.Name
        status        = "complete"
    }

    $marker |
        ConvertTo-Json |
        Set-Content -LiteralPath $markerLocal -Encoding UTF8

    & rclone copyto $markerLocal $markerRemote `
        --log-file $logFile `
        --log-level INFO

    if ($LASTEXITCODE -ne 0) {
        Remove-Item $markerLocal -ErrorAction SilentlyContinue

        Write-Host "FOUT: completion marker voor $($space.Name) kon niet worden geplaatst."
        Write-Host "Bekijk: $logFile"
        exit $LASTEXITCODE
    }

    Remove-Item $markerLocal -ErrorAction SilentlyContinue

    Write-Host "Completion marker geplaatst: $($space.Name)"
}

Write-Host "Portfolio mirror succesvol voltooid."
Write-Host "$($learningSpaces.Count) LearningSpace(s) verwerkt."
Write-Host "Log: $logFile"

# ============================================================
# 4. GOOGLE DRIVE HISTORY OUDER DAN 60 DAGEN OPRUIMEN
# ============================================================

Write-Host "History ouder dan $retentionDays dagen opruimen..."

$cutoffDate = (Get-Date).Date.AddDays(-$retentionDays)

$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"

$historyDirs = & rclone lsf $historyRoot --dirs-only
$historyListExitCode = $LASTEXITCODE

$ErrorActionPreference = $previousErrorActionPreference

if ($historyListExitCode -ne 0) {

    Write-Host "WAARSCHUWING: history kon niet worden gecontroleerd."
    Write-Host "De succesvolle mirror blijft behouden; cleanup wordt overgeslagen."

}
else {

    foreach ($dir in $historyDirs) {

        $dirName = $dir.TrimEnd("/")

        # Alleen mappen met exact formaat YYYY-MM-DD
        # worden automatisch als retentie-backup behandeld.
        try {
            $backupDate = [DateTime]::ParseExact(
                $dirName,
                "yyyy-MM-dd",
                [System.Globalization.CultureInfo]::InvariantCulture
            )
        }
        catch {
            # Andere mapnamen bewust laten staan.
            continue
        }

        if ($backupDate.Date -lt $cutoffDate) {

            Write-Host "Verwijder oude history: $dirName"

            $previousErrorActionPreference = $ErrorActionPreference
            $ErrorActionPreference = "Continue"

            & rclone purge "$historyRoot/$dirName" `
                --log-file $logFile `
                --log-level INFO

            $purgeExitCode = $LASTEXITCODE

            $ErrorActionPreference = $previousErrorActionPreference

            if ($purgeExitCode -ne 0) {
                Write-Host "WAARSCHUWING: history $dirName kon niet worden verwijderd."
            }
        }
    }
}

# ============================================================
# 5. LOKALE LOGS OUDER DAN 60 DAGEN OPRUIMEN
# ============================================================

Write-Host "Logs ouder dan $retentionDays dagen opruimen..."

try {

    $logCutoff = (Get-Date).AddDays(-$retentionDays)

    Get-ChildItem -LiteralPath $logDir -File -Filter "*.log" |
        Where-Object {
            $_.LastWriteTime -lt $logCutoff
        } |
        Remove-Item -Force -ErrorAction Stop

}
catch {

    Write-Host "WAARSCHUWING: niet alle oude logs konden worden opgeruimd."

}

Write-Host "Retentie-opruiming voltooid."
```

Dit is de versie met de bewezen `[DateTime]::ParseExact(...)` binnen `try/catch`. Gebruik geen oudere `TryParseExact`-variant. Cleanupfouten na een geslaagde mirror tonen alleen een waarschuwing en maken de actuele completion markers niet ongeldig.

Controleer de twee rclonepaden nogmaals:

```text
gdrive:Portfolio Wiskunde Mirror/current
gdrive:Portfolio Wiskunde Mirror/history
```

Ze bevatten `gdrive:` en nooit `gdrive\:`.

## 9. `mirror-hidden.vbs`

Sla dit bestand naast `mirror.ps1` op als:

```text
C:\Users\<WINDOWS_USER>\OneDrive\ALGEMEEN\APPS\Portfolio\mirror-hidden.vbs
```

Vervang `<VOLLEDIG_PAD_NAAR_MIRROR.PS1>` door het echte volledige pad:

```vbscript
Set shell = CreateObject("WScript.Shell")

command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File " & _
          Chr(34) & "<VOLLEDIG_PAD_NAAR_MIRROR.PS1>" & Chr(34)

exitCode = shell.Run(command, 0, True)

WScript.Quit exitCode
```

Voorbeeld na vervanging:

```vbscript
Chr(34) & "C:\Users\<WINDOWS_USER>\OneDrive\ALGEMEEN\APPS\Portfolio\mirror.ps1" & Chr(34)
```

- `0` start PowerShell zonder zichtbaar venster.
- `True` wacht tot PowerShell klaar is.
- Daardoor blijft de Task Scheduler-run correct actief zolang rclone draait.

> **Eerdere UX-valkuil:** PowerShell rechtstreeks starten, zelfs met `-WindowStyle Hidden`, gaf iedere vijf minuten kort een zwart venster. De definitieve oplossing is `wscript.exe` met `mirror-hidden.vbs`.

Test het VBS-bestand pas nadat `mirror.ps1` handmatig succesvol is uitgevoerd:

```powershell
& "C:\Windows\System32\wscript.exe" "C:\Users\<WINDOWS_USER>\OneDrive\ALGEMEEN\APPS\Portfolio\mirror-hidden.vbs"
```

Er verschijnt geen venster. Controleer daarna of de logtijd is bijgewerkt en markers bestaan.

## 10. Windows Taakplanner instellen

### 10.1 Taak maken

1. Druk `Win+R`.
2. Voer `taskschd.msc` uit.
3. Kies rechts **Taak maken...**, **Create Task...** of de gelijkwaardige uitgebreide optie.
4. Gebruik niet alleen **Basistaak maken**, omdat dan belangrijke overlap- en stopinstellingen kunnen ontbreken.

### 10.2 Tab Algemeen / General

- Naam: `Portfolio Wiskunde Mirror`.
- Kies **Alleen uitvoeren wanneer gebruiker is aangemeld** / **Run only when user is logged on**.
- Gebruik het Windows-account dat ook toegang heeft tot school-OneDrive en de rclone-config.
- Hoogste bevoegdheden zijn normaal niet nodig.

Deze keuze is bewust: Windows Hello/PIN leverde tijdens de eerste installatie geen bruikbaar accountwachtwoord voor **Uitvoeren ongeacht of gebruiker is aangemeld**. Er hoeft daardoor geen Windows-wachtwoord in Taakplanner te worden opgeslagen.

De gebruiker moet wel bij Windows aangemeld blijven; een vergrendelde sessie is normaal geen probleem, volledig afmelden wel.

Kies niet als workaround **Wachtwoord niet opslaan. Alleen toegang tot lokale computerbronnen**. Die optie kan netwerktoegang beperken en is daarom ongeschikt voor een internet/rclone-taak.

### 10.3 Tab Triggers

Maak een trigger:

- begin volgens schema, bijvoorbeeld **Dagelijks/Daily**;
- herhaal taak elke **5 minuten**;
- duur: **Onbepaald/Indefinitely**;
- **Ingeschakeld/Enabled**.

Menu's en vertalingen verschillen licht per Windowsversie. Het eindresultaat moet tonen dat de trigger iedere vijf minuten herhaalt zonder einddatum.

### 10.4 Tab Acties / Actions

Maak **Programma starten/Start a program**:

Programma/script:

```text
C:\Windows\System32\wscript.exe
```

Argumenten:

```text
"C:\Users\<WINDOWS_USER>\OneDrive\ALGEMEEN\APPS\Portfolio\mirror-hidden.vbs"
```

**Start in** mag leeg blijven.

### 10.5 Tab Voorwaarden / Conditions

- Schakel beperkingen rond accuvoeding uit als de pc ook op batterij betrouwbaar moet spiegelen.
- Een aparte netwerkvoorwaarde is niet noodzakelijk; rclone rapporteert zelf een fout wanneer internet ontbreekt.
- De pc moet wakker zijn om de taak te kunnen uitvoeren.

### 10.6 Tab Instellingen / Settings

- **Taak zo snel mogelijk uitvoeren nadat een geplande start is gemist**: aan.
- **Taak stoppen als deze langer duurt dan**: `1 uur`.
- **Als de actieve taak niet stopt wanneer daarom wordt gevraagd, geforceerd stoppen**: aan.
- **Als de taak al wordt uitgevoerd**: **Geen nieuw exemplaar starten** / **Do not start a new instance**.

De Nederlandse Windows-interface bood tijdens de eerste installatie geen 30 minuten als minimum; daarom is 1 uur gebruikt. De overlapinstelling is essentieel: twee gelijktijdige mirrors kunnen markers, deletes en history onvoorspelbaar maken.

### 10.7 Eerste taaktest

Klik rechts op de taak en kies **Uitvoeren/Run**. Vernieuw de Taakplannerweergave na afloop.

Veelvoorkomende laatste-resultaatcodes:

| Code | Betekenis |
| --- | --- |
| `0x0` | Laatste run geslaagd |
| `0x41301` | Taak draait momenteel |
| `0x41303` | Taak heeft nog niet gelopen |

Controleer daarnaast altijd de lokale mirrorlog en de completion markers; alleen een statuscode is geen inhoudelijke mirrorcontrole.

## 11. Eerste veilige mirrortest

Voer deze stappen uit voordat Taakplanner automatisch mag draaien. Lees iedere dry-run volledig.

Open PowerShell en definieer:

```powershell
$source = "C:\Users\<WINDOWS_USER>\OneDrive\PORTFOLIO"
$destination = "gdrive:Portfolio Wiskunde Mirror/current"
$history = "gdrive:Portfolio Wiskunde Mirror/history/$(Get-Date -Format 'yyyy-MM-dd')"
```

### A. Veilige copy dry-run

```powershell
rclone copy $source $destination --dry-run --min-age 2m --exclude "~$*" --exclude "*.partial" --exclude "_mirror-complete.json" -P
```

**Verwacht:** alleen uploads/updates, nooit doelverwijderingen. Controleer dat bron en doel juist om staan.

### B. Eerste echte copy

```powershell
rclone copy $source $destination --min-age 2m --exclude "~$*" --exclude "*.partial" --exclude "_mirror-complete.json" -P
```

**Verwacht:** de directe LearningSpace-mappen verschijnen onder `current/`. `copy` verwijdert nog niets op het doel.

### C. Sync dry-run

```powershell
rclone sync $source $destination --dry-run --backup-dir $history --delete-after --max-delete 10 --min-age 2m --track-renames --exclude "~$*" --exclude "*.partial" --exclude "_mirror-complete.json" -P
```

**Verwacht:** na een correcte eerste copy weinig of geen transfers en geen onverwachte deletes.

> **Bekende migratievalkuil:** bij overgang van oude testmappen naar de nieuwe dynamische rootstructuur werden veel doelverwijderingen gepland en stopte `--max-delete 10` terecht de sync. De oude testmappen zijn toen handmatig uit `current/` verwijderd. Dat gedrag is niet noodzakelijk een bug: rclone maakte het doel gelijk aan de nieuwe bronstructuur.

### D. Een nieuw bestand testen

Maak in een geschikte test-LearningSpace precies een testbestand:

```powershell
$testFile = Join-Path $source "5WIS\mirror-test.txt"
Set-Content -LiteralPath $testFile -Value "mirror test $(Get-Date -Format o)"
Start-Sleep -Seconds 130
rclone sync $source $destination --dry-run --backup-dir $history --delete-after --max-delete 10 --min-age 2m --track-renames --exclude "~$*" --exclude "*.partial" --exclude "_mirror-complete.json" -P
```

**Verwacht:** exact een nieuwe transfer voor `5WIS/mirror-test.txt`. Voer daarna het echte `mirror.ps1` uit en controleer dat het bestand in `current/5WIS/` staat.

### E. Een delete testen

```powershell
Remove-Item -LiteralPath $testFile
Start-Sleep -Seconds 130
rclone sync $source $destination --dry-run --backup-dir $history --delete-after --max-delete 10 --min-age 2m --track-renames --exclude "~$*" --exclude "*.partial" --exclude "_mirror-complete.json" -P
```

**Verwacht:** exact een geplande verwijdering van het testbestand. Voer `mirror.ps1` uit; het doelbestand verdwijnt uit `current/` en komt onder de historymap van vandaag terecht.

### F. `--backup-dir` bij vervanging testen

```powershell
$backupTest = Join-Path $source "5WIS\mirror-backup-test.txt"
Set-Content -LiteralPath $backupTest -Value "versie 1"
Start-Sleep -Seconds 130
& "C:\Users\<WINDOWS_USER>\OneDrive\ALGEMEEN\APPS\Portfolio\mirror.ps1"
Set-Content -LiteralPath $backupTest -Value "versie 2"
Start-Sleep -Seconds 130
& "C:\Users\<WINDOWS_USER>\OneDrive\ALGEMEEN\APPS\Portfolio\mirror.ps1"
```

**Verwacht:** `current/5WIS/mirror-backup-test.txt` bevat versie 2 en de vorige versie staat in `history/YYYY-MM-DD/5WIS/`. Verwijder daarna het testbestand uit School-OneDrive en laat de mirror nogmaals lopen.

### G. Completion marker en fail-closed gedrag

Na een geslaagde run:

```powershell
rclone cat "gdrive:Portfolio Wiskunde Mirror/current/5WIS/_mirror-complete.json"
```

**Verwacht:** geldige JSON met `status` gelijk aan `complete`, een ISO-datum en `learningSpace` gelijk aan `5WIS`.

Test de beveiliging alleen als al een geldige index bestaat:

```powershell
rclone deletefile "gdrive:Portfolio Wiskunde Mirror/current/5WIS/_mirror-complete.json"
```

Start in admin handmatig een sync voor 5WIS. **Verwacht:** de webapp weigert de scan met `De Google Drive-mirror is momenteel niet volledig...` en behoudt de laatst geldige index. Voer daarna onmiddellijk `mirror.ps1` uit om alle markers veilig terug te plaatsen.

### H. Stabiele dynamische rootsync

Voer stap C nogmaals uit nadat alle bedoelde wijzigingen verwerkt zijn.

**Verwacht:** `0 transfers` en `0 deletes`, afgezien van bewust nog niet verwerkte bestanden jonger dan twee minuten.

## 12. Completion marker troubleshooting

Per LearningSpace staat de marker hier:

```text
current/<LearningSpace>/_mirror-complete.json
```

Inhoud ongeveer:

```json
{
  "completedAt": "2026-08-14T15:20:00.000Z",
  "source": "school-onedrive",
  "learningSpace": "5WIS",
  "status": "complete"
}
```

Als de webapp onmiddellijk meldt dat de Google Drive-mirror niet volledig is, controleer dan in deze volgorde:

1. bestaat `_mirror-complete.json` in de juiste `current/<LearningSpace>`-map;
2. bevat hij geldige JSON, `status: complete` en een geldige `completedAt`;
3. wijst de Google Drive folder-ID in de webapp naar `current/<LearningSpace>`;
4. wijst hij niet naar de oude testmap en niet naar de algemene `current`-root;
5. kan het service account precies die map als Viewer lezen.

Tijdens de eerste setup was een oude/verkeerde folder-ID de concrete oorzaak van deze melding, terwijl de marker elders wel correct bestond.

De webapp gebruikt geen freshness-limiet. Een oude maar geldige marker blijft bruikbaar wanneer de mirror-pc uit staat.

## 13. LearningSpaces aan de webapp koppelen

Voor iedere LearningSpace:

1. open **Globaal beheer > Leeromgevingen**;
2. maak de LearningSpace aan of kies **Beheren**;
3. kies provider **Google Drive**;
4. open in Google Drive `Portfolio Wiskunde Mirror/current/5WIS`, `current/6WIS`, enzovoort;
5. kopieer de folder-ID uit de Drive-URL, het deel na `/folders/`;
6. plak die ID bij de overeenkomstige LearningSpace;
7. sla op en kies **Nu synchroniseren**;
8. controleer portfolio's, warnings, markeracceptatie en een asset.

> **Belangrijk:** lokale bronconfiguratie staat in de lokale SQLite-database. Productieconfiguratie staat in Neon PostgreSQL. Google Drive folder-ID's worden niet via Git meegenomen en moeten in productie eenmalig afzonderlijk worden ingesteld.

Een nieuwe directe map onder `PORTFOLIO` vereist geen aanpassing aan `mirror.ps1`, maar wel een nieuwe LearningSpace-record en folder-ID in iedere afzonderlijke applicatiedatabase waarin die omgeving beschikbaar moet zijn.

## 14. Vercel en Neon productie

- GitHub `main` is de codebron; een push activeert de gekoppelde Vercel-deployment.
- Productie gebruikt Vercel Hobby en Next.js Node.js Functions.
- `vercel.json` configureert projectbreed `fra1`.
- Neon PostgreSQL staat in Frankfurt.
- Productie gebruikt geen SQLite en geen lokale filesystemprovider.

Belangrijke Vercel Production environment variables:

```text
DATABASE_URL
ADMIN_PASSWORD
ADMIN_SESSION_SECRET
GOOGLE_SERVICE_ACCOUNT_JSON_B64
REPORT_RATE_LIMIT_SECRET                    (aanbevolen)
PORTFOLIO_AUTO_SYNC_TTL_SECONDS             (optioneel)
PORTFOLIO_SYNC_LEASE_SECONDS                (optioneel)
MICROSOFT_TENANT_ID                         (optionele OneDrive-route)
MICROSOFT_CLIENT_ID                         (optionele OneDrive-route)
MICROSOFT_CLIENT_SECRET                     (optionele OneDrive-route)
MICROSOFT_REDIRECT_URI                      (optionele OneDrive-route)
GRAPH_TOKEN_ENCRYPTION_KEY                  (optionele OneDrive-route)
```

Markeer secrets in Vercel waar mogelijk als **Sensitive** en selecteer **Production**. Een environmentwijziging vereist een nieuwe deployment.

### Bekende regiovalkuil

Aanvankelijk ontving Vercel requests in Parijs maar routeerde Functions naar Washington:

```text
Received in Paris (cdg1)
Routed to Washington D.C. (iad1)
```

Omdat Neon in Frankfurt stond, gaf dit voelbare extra latency. De definitieve repositoryconfiguratie is:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["fra1"]
}
```

Na redeploy moeten Function logs `Routed to Frankfurt (fra1)` tonen. Dit maakte de app tijdens de eerste productie-installatie merkbaar sneller.

## 15. Compacte herstelchecklist voor een nieuwe pc

1. OneDrive installeren en met het schoolaccount aanmelden.
2. `PORTFOLIO` lokaal/offline beschikbaar maken.
3. Git, Node.js, pnpm en rclone installeren.
4. Repository clonen en dependencies installeren.
5. Alleen benodigde lokale secrets veilig herstellen.
6. Rclone remote `gdrive` met het persoonlijke Google-account configureren.
7. `mirror.ps1` en `mirror-hidden.vbs` plaatsen en alle gebruikerspaden controleren.
8. Copy- en sync-dry-runs uitvoeren; daarna `mirror.ps1` handmatig testen.
9. Windows Taakplanner met `wscript.exe` en herhaling iedere vijf minuten instellen.
10. Een automatische run, log en resultaatcode controleren.
11. Service-account Viewer-sharing op alle `current/<LearningSpace>`-mappen controleren.
12. Iedere webapp-LearningSpace handmatig synchroniseren.
13. Completion marker en fail-closed behoud van de vorige index testen.
14. Controleren dat een stabiele dry-run nul transfers en nul deletes toont.

## 16. Wat bij alleen een nieuwe pc niet opnieuw hoeft

Zolang de cloudresources niet verwijderd of beschadigd zijn, blijven bestaan:

- de GitHub-repository en commitgeschiedenis;
- het Vercel-project, domein en production environment variables;
- de Neon-database en alle productiondata;
- Google Cloud project `Portfoliowiskunde`;
- het Google service account, tenzij de key bewust wordt vervangen;
- de bestaande persoonlijke Google Drive mirror en history;
- de Desktop OAuth-client voor rclone;
- production LearningSpaces, folder-ID's en publicatie-instellingen.

Op een nieuwe pc moeten vooral OneDrive, rclone-autorisatie, lokale scripts, Task Scheduler en eventuele lokale developmentenvironment opnieuw worden ingericht.

## 17. Herstel bij verloren credentials

### Rclone OAuth verloren of verlopen

Voer `rclone config` uit, kies remote `gdrive` en autoriseer opnieuw met het persoonlijke Google-account. Verwijder de Google Drive mirror niet. Bij External/Testing kan de refresh token na zeven dagen verlopen.

### Service-account JSON-key verloren

1. open het service account in Google Cloud;
2. trek de verloren/oude key in;
3. maak een nieuwe JSON-key;
4. maak opnieuw Base64;
5. werk `.env.local` en Vercel `GOOGLE_SERVICE_ACCOUNT_JSON_B64` bij;
6. redeploy Vercel;
7. test folder sharing en handmatige sync.

De service-accountidentiteit blijft gelijk, dus bestaande Viewer-sharing blijft normaal behouden zolang niet het hele service account wordt vervangen.

### Adminwachtwoord verloren

Stel een nieuw sterk en uniek `ADMIN_PASSWORD` in als Vercel Sensitive Production environment variable en redeploy. Probeer het oude wachtwoord niet uit logs of Git terug te halen.

### Sessiesleutel verloren

Genereer een nieuwe sterke `ADMIN_SESSION_SECRET`, stel die in Vercel in en redeploy. Alle bestaande adminsessies worden daardoor ongeldig; dit is verwacht en veilig.

### Database- of providersecret verloren

Roteer het secret bij Neon, Microsoft of Google, werk uitsluitend de beveiligde environment bij en redeploy. Een secret dat mogelijk gelekt is moet worden ingetrokken, niet teruggezocht in oude logs of deployments.

## 18. Laatste controle

Een herstelde installatie is pas klaar wanneer:

- OneDrive volledig lokaal beschikbaar is;
- `rclone lsd gdrive:` werkt;
- een handmatige `mirror.ps1` eindigt met `Portfolio mirror succesvol voltooid.`;
- iedere LearningSpace een geldige `_mirror-complete.json` heeft;
- Task Scheduler zonder zichtbaar venster draait en overlap weigert;
- een stabiele dry-run nul onverwachte transfers/deletes toont;
- de webapp de correcte folder-ID's gebruikt;
- een handmatige webappsync en beveiligde assetweergave slagen;
- lint, typecheck, tests en build groen zijn.

Zie ook [het production runbook](../PRODUCTION_RUNBOOK.md) voor architectuur, retentie, lifecycle en laag-voor-laagdiagnose.
