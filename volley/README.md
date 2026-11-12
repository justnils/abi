# Wabbel Volley

Strand-Volleyball mit Wackelpudding-Physik – läuft im Browser auf Handy, Tablet und Desktop.
Keine Abhängigkeiten, kein Build-Schritt: reines HTML5 Canvas + JavaScript (ES-Module).

## Starten

```bash
cd volley
python3 -m http.server 8000   # dann http://localhost:8000 öffnen
```

(ES-Module brauchen einen Webserver, Doppelklick auf `index.html` reicht nicht.)
Funktioniert auf jedem statischen Hosting (z. B. GitHub Pages). Auf dem Handy lässt sich das Spiel
über „Zum Startbildschirm hinzufügen“ als App installieren und läuft danach auch offline.

## Spielen

- **1 Spieler** gegen den Computer (leicht / mittel / schwer) oder **2 Spieler** an einem Gerät
- Max. 3 Berührungen pro Seite, Ball am Boden = Punkt für die Gegenseite
- Sieg bei 5 / 10 / 15 / 25 Punkten mit 2 Punkten Vorsprung

| | Links | Rechts |
|---|---|---|
| Tastatur | `A` `D` laufen, `W`/Leertaste springen | `←` `→` laufen, `↑` springen |
| Touch | ◀ ▶ + HOPP unten links | HOPP + ◀ ▶ unten rechts (2-Spieler) |
| Gamepad | Pad 1 | Pad 2 |

Sprungtaste halten = höher springen. `Esc`/`P` pausiert.

## Aufbau

| Datei | Inhalt |
|---|---|
| `engine.js` | Physik, Regeln, Punktezählung, Computer-Gegner (ohne Grafik, läuft auch in Node) |
| `main.js` | Grafik, Eingabe (Tastatur/Touch/Gamepad), Sound (WebAudio), Menüs |
| `index.html` | Layout, Touch-Buttons, Menüs |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | Offline-Fähigkeit / installierbare Web-App |

Die Physik läuft mit festem Zeitschritt (120 Hz) und ist dadurch auf allen Geräten gleich schnell.
