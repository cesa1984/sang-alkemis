# Sang Alkemis — Bahasa Indonesia Lern-App

Eine Progressive Web App (PWA) zum Lernen von Bahasa Indonesia
durch Paulo Coelhos *Der Alchimist*.

---

## Installation

### Variante A: Lokal auf dem Computer testen

1. Entpacke die ZIP-Datei in einen Ordner.
2. Im Ordner einen lokalen Server starten:
   ```bash
   python3 -m http.server 8000
   ```
3. Browser öffnen: `http://localhost:8000`

**Wichtig:** Die App funktioniert NICHT direkt durch Doppelklick auf
`index.html` — der Browser blockiert dann das Laden von JSON-Dateien
(CORS-Sperre). Der lokale Server ist Pflicht.

### Variante B: Auf Android installieren (PWA)

1. App auf GitHub Pages hosten (siehe Variante C unten) ODER
   App auf einem Webserver hosten ODER
   per lokalem Server vom Heimnetzwerk aus erreichbar machen.
2. Im Chrome-Browser auf Android die URL öffnen.
3. Menü (drei Punkte oben rechts) → **Zum Startbildschirm hinzufügen**.
4. Fertig. Die App liegt jetzt mit Icon auf dem Homescreen und
   funktioniert auch offline (nach dem ersten Laden).

### Variante C: Auf GitHub Pages hosten (kostenlos, dauerhaft)

1. GitHub-Account erstellen (falls noch nicht vorhanden).
2. Neues Repository erstellen, z.B. `sang-alkemis`.
3. Alle Dateien aus dem ZIP in das Repository hochladen.
4. Settings → Pages → Source: `main` branch, root.
5. Nach ein paar Minuten unter
   `https://<dein-username>.github.io/sang-alkemis/` erreichbar.
6. Diese URL auf dem Handy öffnen → "Zum Startbildschirm hinzufügen".

---

## Bedienung

| Geste                              | Aktion                                  |
|------------------------------------|-----------------------------------------|
| **Kurzer Klick** auf Wort          | Wortübersetzung anzeigen                |
| **Langer Druck (>0.5s)** auf Wort  | Ganzen Satz auf Englisch anzeigen       |
| **Doppel-Klick** auf Wort          | Als "bekannt" markieren (gedämpft)      |
| **Erneuter Doppel-Klick**          | Wieder als "lernend" markieren          |
| Klick auf leere Stelle             | Aktive Übersetzung ausblenden           |
| Zurück-Button                      | Zur Kapitelübersicht                    |

Bekannte Wörter werden im Text verblasst dargestellt, damit dein Auge
automatisch zu den unbekannten Wörtern gezogen wird. Das kann in den
Einstellungen (⚙) abgeschaltet werden.

---

## Neue Kapitel hinzufügen

Es gibt zwei Wege:

### Weg 1: Direkt in den `chapters/` Ordner (für Entwicklung)

1. Neue JSON-Datei mit demselben Format in `chapters/` ablegen.
2. In `app.js` die Konstante `BUILTIN_CHAPTERS` erweitern:
   ```js
   const BUILTIN_CHAPTERS = [
     'chapters/00-prolog.json',
     'chapters/01-bagian-satu.json',
     'chapters/02-mein-neues-kapitel.json',  // <-- hier
   ];
   ```
3. Service-Worker-Cache leeren (in den Einstellungen "Alle Daten löschen")
   oder über die Browser-Entwicklertools.

### Weg 2: Über den Import-Button (für Endnutzer)

1. In der App auf **"Kapitel importieren"** tippen.
2. JSON-Datei vom Handy auswählen.
3. Fertig — das Kapitel erscheint sofort in der Liste.

Importierte Kapitel werden im Browser-Speicher (`localStorage`)
gespeichert und bleiben erhalten, auch wenn die App geschlossen wird.

---

## Format einer Kapitel-JSON-Datei

```json
{
  "id": "02-eindeutige-id",
  "number": "BAGIAN DUA",
  "title": "Titel des Kapitels",
  "language": "id",
  "tokens": [
    {
      "en": "English translation of the whole sentence.",
      "t": [
        ["indonesisches", "indonesian"],
        ["wort", "word"],
        "."
      ]
    },
    "PARA",
    {
      "dialog": true,
      "en": "\"Dialog line in English.\"",
      "t": [
        "\u201C",
        ["sebuah", "a"],
        ["kalimat", "sentence"],
        ".",
        "\u201D"
      ]
    }
  ]
}
```

**Regeln:**
- Jedes Element in `tokens` ist entweder:
  - Ein Objekt mit `t` (Token-Array) und `en` (Satzübersetzung).
    Optional `dialog: true` für wörtliche Rede (kursiv dargestellt).
  - Der String `"PARA"` für einen Absatzumbruch.
- In `t`-Arrays sind Elemente entweder:
  - Ein `[indonesisch, englisch]` Paar → klickbares Wort.
  - Ein String → Satzzeichen (nicht klickbar, kein Slot).
- `id` muss einzigartig sein. Bestehende Kapitel mit derselben `id`
  werden überschrieben.

---

## Daten & Speicher

Alle Daten werden im Browser-`localStorage` gespeichert:

- **Kapitel** (`sangalkemis_chapters_v1`)
- **Lernstand** (`sangalkemis_progress_v1`) — welche Wörter du als
  "bekannt" markiert hast. Der Lernstand wird über alle Kapitel hinweg
  geteilt (wenn du "yang" im Prolog als bekannt markierst, ist es auch
  in Kapitel 1 verblasst).
- **Einstellungen** (`sangalkemis_settings_v1`)

Lösche niemals die Website-Daten in den Browser-Einstellungen, sonst
ist dein Lernstand weg. Du kannst optional über die App selbst
("🗑 Alle Daten löschen") zurücksetzen.

---

## Probleme & Lösungen

**Die App zeigt keine Kapitel und der Import-Button funktioniert nicht.**
→ Du hast die Datei direkt durch Doppelklick geöffnet (`file://` URL).
   Starte stattdessen einen lokalen Server (siehe oben).

**Auf Android wird die App nicht installiert.**
→ Die App muss über `https://` (oder `http://localhost`) erreichbar
   sein. Eine reine `file://` URL oder eine IP im Heimnetz reicht nicht
   für die PWA-Installation.

**Lernstand ist weg.**
→ Browser-Daten wurden gelöscht oder die App wurde in einem anderen
   Browser geöffnet. localStorage ist pro Browser/Domain.
