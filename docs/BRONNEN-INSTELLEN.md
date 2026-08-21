# Bronnen instellen

De webapp leest bronbestanden altijd read-only. Ze wijzigt of verwijdert nooit bestanden in OneDrive, Google Drive of een lokale testmap.

## 1. Begrippen

- Primaire bron: de normale bron waaruit portfolio's worden gelezen.
- Mirror: een tweede, onafhankelijk geconfigureerde kopie die bij problemen kan overnemen.
- Actieve bron: de bron waarvan de laatst geslaagde index momenteel wordt gebruikt.

Een ingestelde mirror wordt niet vanzelf actief. Eerst vergelijk je beide bronnen en daarna bevestig je de omschakeling.

## 2. OneDrive verbinden

1. Open Globaal beheer en ga naar Verbindingen.
2. Kies OneDrive verbinden of OneDrive opnieuw verbinden.
3. Meld je aan met het Microsoft-account dat leestoegang heeft tot de bronmap.
4. Controleer dat de status OneDrive geconnecteerd verschijnt.

De verbinding is app-breed. De drive-ID en map-ID stel je afzonderlijk per leeromgeving in.

## 3. OneDrive drive-ID en map-ID

Open de gewenste map in OneDrive en gebruik Microsoft Graph Explorer of de bestaande IT-beheertool om de drive en map op te zoeken. Vul de technische drive-ID en map-ID exact in. Het optionele pad of label is alleen herkenningsinformatie voor beheerders.

Gebruik geen gedeelde browser-URL als map-ID. Vraag je IT-beheerder om de Graph-ID's wanneer je ze niet kunt ophalen.

## 4. Google Drive service account

De app gebruikt in productie een afzonderlijk Google service account met alleen leestoegang.

1. Configureer de service-accountgegevens als beveiligde serveromgevingvariabele.
2. Deel de gewenste Google Drive-map met het e-mailadres van het service account als Viewer.
3. Kopieer de folder-ID uit de Google Drive-URL naar de bronconfiguratie.
4. Geef een herkenbaar label of pad op zodat je de map later eenvoudig controleert.

Plaats nooit de service-account-JSON of andere secrets in deze instellingenpagina.

## 5. Google mirror en completion marker

Wanneer Google Drive als mirror wordt gebruikt, draait rclone buiten de webapp. Rclone maakt een eenrichtingskopie en schrijft na een volledig geslaagde mirror een bestand met de naam _mirror-complete.json in de root van elke leeromgeving.

De marker moet status complete en een geldige completedAt bevatten. Er geldt geen maximale leeftijd. Ontbreekt de marker of is hij ongeldig, dan weigert de app een nieuwe indexering en blijft de laatst geldige index actief.

## 6. Bronnen vergelijken

1. Sla de primaire bron en mirror op.
2. Ga naar Actieve bron.
3. Kies Bronnen vergelijken.
4. Controleer gelijke bestanden, ontbrekende paden en parserwaarschuwingen.

Lege mappen tellen niet als inhoudsverschil. Waarschuwingen die in beide bronnen gelijk voorkomen tellen evenmin als mirrorverschil.

## 7. Lage overlap

Bij zeer weinig overlap verschijnt de waarschuwing dat de bronnen mogelijk niet bij elkaar horen. Controleer dan vooral of de juiste map-ID voor dezelfde leeromgeving werd ingevoerd. Dit is een waarschuwing: omschakelen blijft mogelijk na expliciete bevestiging.

## 8. Omschakelen en terugschakelen

Na een geslaagde vergelijking kan je overschakelen naar de mirror. De volledige nieuwe index wordt transactioneel opgeslagen. Gebruik dezelfde vergelijking om later terug te schakelen naar de primaire bron.

Bij een providerfout, ongeldige marker of mislukte scan wordt niet omgeschakeld en blijft de bestaande index behouden.

## 9. Problemen oplossen

- OneDrive-fout: verbind OneDrive opnieuw en controleer drive-ID, map-ID en toegangsrechten.
- Google Drive-fout: controleer de serverconfiguratie, Viewer-deling en folder-ID.
- Mirror onvolledig: controleer het externe rclone-proces en _mirror-complete.json.
- Veel verschillen: verifieer dat primary en mirror naar dezelfde leeromgeving wijzen.
- Parserwaarschuwing: controleer de map- en bestandsnaamconventies van de relevante portfolio-inhoud.

Rclone, Taakplanner en mirrorretentie worden buiten de webapp beheerd.
