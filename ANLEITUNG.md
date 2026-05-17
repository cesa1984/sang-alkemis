# Sang Alkemis — Anleitung

Eine Lern-App für Bahasa Indonesia, basierend auf
Paulo Coelhos *Der Alchimist*.

Es gibt zwei Wege, die App zu benutzen:

- **Weg A:** App auf den Computer und dann auf das Handy
  (etwas mehr Aufwand, aber dauerhaft, offline-fähig)
- **Weg B:** App auf GitHub Pages hochladen (kostenlos, einmal einrichten,
  funktioniert dann von überall)

Für den schnellen Start empfehle ich **Weg B**. Aber lass uns mit
Weg A anfangen, damit du erstmal siehst, dass alles funktioniert.

---

## Schritt 1: ZIP-Datei entpacken

1. Lade `sang-alkemis.zip` auf deinen Computer herunter.
2. Klicke mit der rechten Maustaste auf die ZIP-Datei → "Extrahieren"
   (Windows) oder doppelklicke (Mac).
3. Du hast jetzt einen Ordner `app/` mit allen Dateien.

---

## Schritt 2: App lokal testen (auf dem Computer)

Du brauchst Python. Falls es noch nicht installiert ist, lade es von
https://www.python.org/downloads/ herunter und installiere es.

### Auf Windows:

1. Drücke `Windows-Taste + R`, tippe `cmd` ein und drücke Enter.
2. Im schwarzen Fenster: navigiere in den `app/`-Ordner. Wenn der Ordner
   z.B. unter `C:\Users\DeinName\Downloads\app` liegt, tippe:
   ```
   cd C:\Users\DeinName\Downloads\app
   ```
3. Starte den Server:
   ```
   python -m http.server 8000
   ```
   (falls das nicht klappt, versuche `python3 -m http.server 8000`)
4. Öffne im Browser: http://localhost:8000

### Auf Mac/Linux:

1. Öffne das Terminal.
2. Navigiere in den Ordner:
   ```
   cd ~/Downloads/app
   ```
3. Starte den Server:
   ```
   python3 -m http.server 8000
   ```
4. Öffne im Browser: http://localhost:8000

**Du solltest jetzt die App sehen** — mit dem Prolog und Kapitel 1 in
der Liste. Klicke auf ein Kapitel zum Lesen.

Zum Stoppen des Servers: `Strg + C` (Windows/Linux) bzw. `Cmd + C` (Mac)
im Terminal-Fenster.

---

## Schritt 3: App auf das Smartphone bringen

Hier hast du drei Optionen — je nach dem, was dir bequemer ist.

### Option 1 (am bequemsten): GitHub Pages

So funktioniert es: Deine App liegt im Internet unter einer festen URL.
Du gehst auf dem Handy einmal auf diese URL, installierst sie über das
Chrome-Menü → Fertig.

1. Gehe auf https://github.com und erstelle einen kostenlosen Account.
2. Klicke oben rechts auf das `+` → "New repository".
3. Gib einen Namen ein, z.B. `sang-alkemis`. Setze einen Haken bei
   "Public". Klicke "Create repository".
4. Auf der neuen Seite: klicke "uploading an existing file".
5. Ziehe **alle Dateien aus dem app/-Ordner** ins Browserfenster.
   (Wichtig: nicht den Ordner selbst, sondern die Dateien darin.)
6. Unten auf der Seite: "Commit changes".
7. Klicke auf "Settings" (oben), dann links auf "Pages".
8. Unter "Source" wähle: Branch `main`, Folder `/ (root)`. Klicke "Save".
9. Warte ein paar Minuten. Oben auf derselben Seite erscheint dann
   eine URL wie `https://deinname.github.io/sang-alkemis/`.
10. Diese URL auf dem Handy in Chrome öffnen.
11. Chrome-Menü (drei Punkte oben rechts) → "Zum Startbildschirm hinzufügen".
12. Fertig — die App liegt jetzt als Icon auf deinem Homescreen und
    funktioniert offline.

### Option 2: Vom Heimnetzwerk aus testen

Funktioniert nur, solange Handy und Computer im gleichen WLAN sind.

1. Server auf dem Computer starten (Schritt 2).
2. Finde die IP-Adresse deines Computers:
   - Windows: `ipconfig` im Terminal → "IPv4-Adresse" (z.B. 192.168.1.42)
   - Mac: Systemeinstellungen → Netzwerk → WLAN
3. Auf dem Handy im Chrome öffnen: `http://192.168.1.42:8000` (mit deiner IP).

Nachteil: PWA-Installation ("Zum Startbildschirm hinzufügen") funktioniert
hier nur eingeschränkt, weil die Verbindung nicht verschlüsselt ist.

### Option 3: Auf das Handy kopieren (nur lesen, kein PWA)

1. ZIP-Datei aufs Handy kopieren (z.B. per USB-Kabel oder Google Drive).
2. Entpacken auf dem Handy.
3. Mit einer App wie "HTTP Server" (Play Store) den Ordner servern.

Klingt umständlich? Ist es auch. Nimm Option 1.

---

## Bedienung in der App

- **Antippen** auf ein Wort → englische Übersetzung erscheint darunter
- **Lange drücken** (über 0,5 Sek.) → ganzer Satz auf Englisch in einer
  Leiste am unteren Rand
- **Doppel-Tippen** → Wort als "bekannt" markieren (wird verblasst)
- **Erneut doppel-tippen** → wieder als "lernend" markieren

Bekannte Wörter werden im Text gedämpft, damit dein Auge automatisch
zu den noch unbekannten Wörtern gezogen wird. Im Einstellungsmenü
(Zahnrad-Symbol) kannst du das abschalten und die Schriftgröße ändern.

## Wörterbuch

In der Bibliothek findest du den Knopf **"Dictionary"**. Dort siehst
du alle Wörter aus allen geladenen Kapiteln, alphabetisch sortiert.

- **Suchfeld**: Tippe ein, um nach indonesischen ODER englischen
  Wörtern zu suchen (z.B. "domba" oder "sheep").
- **Filter** "All / Learning / Known": Zeige alle Wörter, nur die noch
  zu lernenden, oder nur die bereits bekannten.
- **Antippen** auf einen Eintrag: markiert das Wort als bekannt
  (oder umgekehrt). Diese Markierung wirkt sich sofort auch auf den
  Kapiteltext aus.
- Pro Eintrag siehst du alle Übersetzungen, die das Wort in
  verschiedenen Kontexten hatte. Eine Zahl wie `×3` zeigt an, wie
  oft diese Übersetzung im Text vorkam.

## Vokabel-Test (Lern-Phase + Spaced Repetition)

Im Wörterbuch oben rechts findest du das **Stift-Symbol (✎)** —
das startet einen Vokabel-Test. Das System kombiniert zwei bewährte
Lernmethoden: kurzfristige Wiederholung am selben Tag (damit du
dir das Wort wirklich einprägst) und Spaced Repetition über Tage
(damit du es nicht wieder vergisst).

**Wie eine Session abläuft:**

1. Du beginnst mit **10 Wörtern**.
2. Jedes Wort wird auf einer großen Karte angezeigt — du denkst die
   englische Übersetzung.
3. Tippe auf die Karte zum Aufdecken.
4. Bewerte: **"Knew it"** oder **"Didn't know"**.
5. Die Karten kommen **mehrmals in derselben Session** wieder, bis
   du jedes Wort gut kannst.
6. Wenn du ein Wort **2× hintereinander richtig** hast, "graduiert" es —
   und kommt erst morgen wieder.
7. Nach Abschluss: Zusammenfassung mit zwei wichtigen Knöpfen:
   - **"Repeat today's words"** — die heute gelernten Wörter nochmal
     üben, um sie noch besser einzuprägen.
   - **"Start new session"** — 10 neue Wörter beginnen.

**Wie die Wiederholung funktioniert:**

| Antwort | Nächste Sichtung |
|---------|-------------------|
| Falsch  | sehr bald wieder (~3 Karten später) |
| 1× richtig | etwas später (~7 Karten) |
| 2× richtig in Folge | graduiert! morgen wieder |

Wenn ein bereits graduiertes Wort an einem späteren Tag falsch
beantwortet wird, fällt es zurück in die Lern-Phase und wird
heute wieder mehrfach geübt.

**Langfristige Wiederholung** (nach Graduierung):

| Stufe | Nächste Abfrage |
|-------|------------------|
| 1     | morgen          |
| 2     | in 3 Tagen      |
| 3     | in 7 Tagen      |
| 4     | in 14 Tagen     |
| 5     | in 30 Tagen     |
| 6     | in 90 Tagen → gemeistert (wird als "known" markiert) |

**Auswahl der Wörter:**

- Zuerst kommen alle Wörter, die heute fällig sind (Wiederholungen).
- Dann **Wörter, die du angefangen hast aber noch nicht graduiert sind**
  (z.B. weil du eine Session abgebrochen hast).
- Erst dann werden neue Wörter dazu genommen — sortiert nach Häufigkeit
  im Buch (damit du beim Lesen schnell Fortschritte machst).

**Was vom Test ausgeschlossen ist:**

Grammatikalische Partikel wie *yang, di, ke, dan, itu* und sehr
kurze Wörter — die lernst du beim Lesen ohnehin automatisch und
sie wären im Test nur Lärm.

**Tipp:** Mach am besten **mehrere Sessions am selben Tag**, vor allem
am Anfang. Eine erste Session führt 10 Wörter ein, eine zweite
Wiederholung am Abend mit "Repeat today's words" prägt sie tief ins
Gedächtnis ein. Morgen kommen sie dann automatisch nochmal in der
Spaced-Repetition-Wiederholung.

---

## Neue Kapitel hinzufügen

Wenn Claude dir ein neues Kapitel als JSON-Datei gibt:

1. Die JSON-Datei aufs Handy laden (per Email, Google Drive, etc.)
2. In der App auf **"Import chapter"** tippen.
3. Die JSON-Datei auswählen.
4. Fertig — das neue Kapitel erscheint sofort in der Liste.

Importierte Kapitel werden im Browser gespeichert und bleiben erhalten,
auch wenn du die App schließt oder das Handy neu startest.

Wichtig: Wenn du die App über GitHub Pages benutzt, kannst du Kapitel
auch direkt ins GitHub-Repository hochladen — dann sehen es alle, die
deine URL benutzen. Aber für den persönlichen Gebrauch reicht der Import-Button.

---

## Probleme?

**Die App zeigt eine leere Seite oder lädt nicht.**
→ Du hast `index.html` direkt doppelgeklickt? Das funktioniert nicht.
   Du brauchst entweder den lokalen Server (Schritt 2) oder GitHub Pages.

**Die Wort-Übersetzung erscheint nicht beim Antippen.**
→ Stelle sicher, dass du die neueste Version der App benutzt (v2).
   Bei GitHub Pages: schließe und öffne die App-Verknüpfung neu.

**Der Lernstand ist plötzlich weg.**
→ Browser-Daten gelöscht? localStorage ist pro Browser/Domain. Wenn du
   die App in einem anderen Browser öffnest, fängst du bei Null an.
