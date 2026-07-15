# ThurSky – vollständige Einrichtung

Dieses Projekt verbindet:

- GitHub für Versionsverwaltung und automatische Netlify-Deployments
- Netlify Identity für Kunden- und Admin-Anmeldungen
- Netlify Functions für geschützte Serverlogik
- Supabase PostgreSQL für Bestellungen
- Supabase Storage für private Kundenbilder und Videos
- Decap CMS für öffentliche News-Beiträge im Git-Repository

## 1. Bilder kopieren

Lege deine Dateien so ab:

- `assets/images/logo.png`
- `assets/images/hero.jpg`
- Galerie: `assets/images/gallery/...`

Die Beispiel-Dateinamen in `index.html` müssen zu deinen echten Dateien passen. GitHub unterscheidet Gross- und Kleinschreibung.

## 2. GitHub

Im Projektordner:

```bash
git init
git add .
git commit -m "ThurSky Grundsystem"
git branch -M main
git remote add origin https://github.com/DEIN-NAME/DEIN-REPOSITORY.git
git push -u origin main
```

## 3. Supabase

1. Neues Supabase-Projekt erstellen.
2. SQL Editor öffnen.
3. Inhalt von `supabase/schema.sql` ausführen.
4. Unter Project Settings > API kopieren:
   - Project URL
   - anon/public key
   - service_role key

Der `service_role`-Key ist geheim und darf niemals in HTML, JavaScript oder GitHub gespeichert werden.

## 4. Netlify-Projekt mit GitHub verbinden

1. Add new project > Import an existing project.
2. GitHub-Repository auswählen.
3. Build command: `npm run build`
4. Publish directory: `.`
5. Functions directory wird durch `netlify.toml` gesetzt.

## 5. Umgebungsvariablen in Netlify

Unter Project configuration > Environment variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET` mit Wert `customer-files`

Danach einen neuen Deploy auslösen.

## 6. Netlify Identity

1. Identity im Netlify-Projekt aktivieren.
2. Registration auf `Invite only` setzen, wenn nur deine Kunden Konten bekommen sollen.
3. Für Tests kannst du vorübergehend offene Registrierung verwenden.
4. Deinen eigenen Benutzer anlegen und bestätigen.
5. In der Benutzerverwaltung deinem Konto die Rolle `admin` geben.
6. Abmelden und erneut anmelden, damit das neue Rollen-Token geladen wird.

Neue normale Benutzer erhalten durch `netlify/functions/identity.mjs` automatisch die Rolle `customer`.

## 7. Decap CMS

`admin/config.yml` verwendet momentan `git-gateway`, weil das mit Netlify Identity am einfachsten einzurichten ist.

1. In Netlify Identity > Services Git Gateway aktivieren.
2. `/admin/` öffnen.
3. Mit deinem Admin-Konto anmelden.
4. News-Beitrag erstellen und veröffentlichen.
5. Decap schreibt die Markdown-Datei nach `content/news` ins GitHub-Repository.
6. Netlify baut daraus automatisch `/news/` und einzelne News-Seiten.

Hinweis: Git Gateway ist von Netlify als veraltet markiert. Für eine spätere langfristige Umstellung kann Decap mit einem GitHub-OAuth-Backend betrieben werden.

## 8. Funktionsprüfung

- `/` öffentliche Website
- `/news/` News
- `/konto/` Kundenkonto
- `/backend/` Adminbackend
- `/admin/` Decap CMS

Testablauf:

1. Kundenkonto registrieren oder einladen.
2. Als Kunde auf der Startseite eine Anfrage absenden.
3. Als Admin im Backend Status und Nachricht ändern.
4. Datei zu einer Bestellung hochladen.
5. Als Kunde prüfen, ob Status und Download sichtbar sind.

## 9. Subdomains

Empfohlen:

- Hauptseite: `deine-domain.ch`
- Kundenkonto weiterhin: `deine-domain.ch/konto/`
- Backend: `deine-domain.ch/backend/`
- News: `deine-domain.ch/news/`

Separate Subdomains sind möglich, aber dafür sind meist getrennte Netlify-Projekte oder Proxy-Regeln nötig. Für SEO ist `/news/` in der Regel einfacher als `news.deine-domain.ch`.

## Sicherheit

- `SUPABASE_SERVICE_ROLE_KEY` niemals im Browser verwenden.
- Der Storage-Bucket muss privat bleiben.
- Kunden erhalten nur kurz gültige Downloadlinks.
- Jede API-Funktion prüft Netlify Identity serverseitig.
- `konto`, `backend` und `admin` werden über Header von Suchmaschinen ausgeschlossen.
