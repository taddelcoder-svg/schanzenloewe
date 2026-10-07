# Schanzenlöwe

2D-Motorrad-Physikspiel im Browser (im Stil von „Rider“): Hügel, Schanzen, Lücken, Flips. Läuft komplett im Browser, der Spielstand liegt im localStorage.

- 12 Level in 3 Welten (Sonnenwiese, Dünenpiste, Winterberg) mit 3 Sternen je Level (Ziel, alle Münzen, Flips), Checkpoints, Endlos-Modus
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

- `js/logik.js`: Physik, Gelände-Baukasten, Level, Autopilot (UMD, ohne Browser)
- `js/spiel.js`: Zeichnen, Eingabe, Menüs, Speicherstand
- Debug im Browser: `schanzenloewe.start('1-3')`, `.sim(sek)`, `.tick(n)`, `.halt(true)`, `.bild(n)`

## Hosting

Wie die anderen Spiele: Docker auf Render (`render.yaml`, Dienst `schanzenloewe`), Passwort über `ZUGANG_PASSWORT` (`zugang.js`), Datenschutzseite `/datenschutz`.
