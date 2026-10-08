# Schanzenlöwe

2D-Motorrad-Physikspiel im Browser (im Stil von „Rider“): Hügel, Schanzen, Lücken, Flips. Läuft komplett im Browser, der Spielstand liegt im localStorage.

- 20 Level in 5 Welten (Sonnenwiese, Dünenpiste, Winterberg, Nachtstadt, Vulkan) mit 3 Sternen je Level (Ziel, alle Münzen, Flips), Checkpoints, Endlos-Modus
- Gelände-Bausteine ab Welt 4: Loopings, Schwebeplattformen (stehend, auf/ab, seitlich), Seilbrücken
- Trick-Kombos: Flips, Luftzeit, Wheelie, Stoppie und Looping hintereinander erhöhen den Multiplikator; gebucht wird nach 2,2 s am Boden ohne neuen Trick, bei einem Sturz ist die Kombo weg
- Ghosts: die eigene Bestfahrt fährt halb durchsichtig mit; als Link/Code (`SG1…`) teilbar, damit Freunde dagegen fahren
- Tagesstrecke: jeden Tag eine neue, für alle gleiche Strecke aus dem Datum (vom Autopilot auf Fahrbarkeit geprüft)
- Level-Editor: Strecke aus Bausteinen zusammenstecken, mit dem Autopilot prüfen, speichern und als Link/Code (`SL1…`) teilen
- 3 Motorräder (Flitzer, Hüpfer, Bulle), Kauf mit gesammelten Münzen in der Garage
- Steuerung: ↑/W Gas · ↓/S Bremse · ←/A Nase hoch · →/D Nase runter · R Neustart · C ab Checkpoint · Esc Pause; auf dem Handy vier Touch-Tasten
- Kein Ton (bewusst)

## Entwickeln

```
node server.js          # http://localhost:11000
npm test                # Logik-Tests (inkl. Fahrbarkeit aller Level)
node test/varianten.js  # Autopilot-Fahrbarkeitstabelle, optional --cp
node test/fahrt.js alle flitzer [--flip] [--cp] [--steil]
```

- `js/logik.js`: Physik, Gelände-Baukasten (inkl. Looping/Plattform/Seilbrücke), Level, Autopilot, Kombos, Editor-Bausteine, Tagesstrecke, Ghost- und Strecken-Codes (UMD, ohne Browser)
- `js/spiel.js`: Zeichnen, Eingabe, Menüs, Speicherstand
- Debug im Browser: `schanzenloewe.start('1-3')`, `.sim(sek)`, `.tick(n)`, `.halt(true)`, `.bild(n)`, `.editor()`, `.code('SL1…')`

### Codes

- Strecke: `SL1` + Welt (0–4) + je Baustein ein Buchstabe und pro Wert eine Base-36-Stufe, optional `~` + Name (Base64url). Beispiel: `SL10H22S33CO2W12S54`
- Ghost: `SG1` + Base64url der Bytes (Strecken-Schlüssel `l:4-1` / `t:JJJJMMTT` / `c:<Strecken-Code>`, Motorrad, Zeit, Name, Positionen mit 5 Hz als Differenzen). Ghosts zeichnen Positionen auf statt Eingaben, damit sie in jedem Browser gleich ablaufen.
- Beides funktioniert auch als Link: `https://…/#SL1…`

## Hosting

Wie die anderen Spiele: Docker auf Render (`render.yaml`, Dienst `schanzenloewe`), Passwort über `ZUGANG_PASSWORT` (`zugang.js`), Datenschutzseite `/datenschutz`.
