# Quizduell – Handy-Buzzer

## Dateien
- `server.js`: Mehrspieler-Server und Quizfragen
- `public/index.html`: Spieloberfläche
- `package.json`: Startskript und Abhängigkeiten

## Lokal starten
Node.js installieren, im Projektordner `npm install` und danach `npm start` ausführen. Dann `http://localhost:3000` öffnen.

## Online hosten
Dieses Projekt benötigt einen Node.js-Host, der WebSockets/Socket.IO unterstützt. In den Hosting-Einstellungen den Startbefehl `npm start` verwenden. Danach die öffentliche URL mit den Mitspielern teilen.

Hinweis: Spielräume liegen im Arbeitsspeicher des Servers. Bei einem Server-Neustart werden laufende Spiele beendet. Vor dem Spieleabend einmal gemeinsam testen.
