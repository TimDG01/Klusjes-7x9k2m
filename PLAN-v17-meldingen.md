# Bouwplan v17 — Avondmelding (push) voor openstaande klusjes

> **Werkbestand over sessies heen.** Vink af wat af is en commit dit bestand mee, zodat een
> volgende sessie ziet waar het staat. Actuele werkafspraken staan in `CLAUDE.md`; wat er per
> versie shipte in `CHANGELOG.md`. **NOOIT op `main` werken** — alles op branch
> `claude/sharp-dijkstra-7x5ww6`; `main` = live app, raakt pas aan als de gebruiker het vraagt.

## Doel
Een dagelijkse herinnering (standaard **19u Brussel**, per gezin instelbaar door de ouder):
elk kind dat dan nog klusjes open heeft, krijgt een **push op de gsm terwijl de app dicht is**
— met zijn naam ("Hey Lenn 👋") en een korte lijst van de niet-gedane klusjes. Enkel kinderen,
één melding per dag per gezin.

## Architectuur (beslist)
- **Scheduler + sender buiten Google:** GitHub Actions (gratis cron op de publieke repo) draait
  een Node-script met de **Firebase Admin SDK**, dat de DB leest en via **FCM** pusht.
- **Geen Blaze/betaalkaart:** FCM en RTDB-lezen zijn gratis op het Spark-plan. Eén web-push+FCM-
  implementatie dekt **iOS én Android**.
- **Waarom het script zelf rekent:** de DB bewaart taak-*definities* + rotatie-*stand* + `checks`
  (wat gedáán is), **niet** een kant-en-klaar takenlijstje. De app berekent dat elke render; het
  script moet diezelfde berekening overdoen (een app-geschreven samenvatting zou net ontbreken
  voor het kind dat de app die dag niet opende — de doelgroep).

## Nieuwe DB-velden (onder `settings`, per gezin)
- `notifyTime`: `"HH:MM"` of `"uit"` (ouder-instelbaar, default `"19:00"`).
- `lastNotified`: `"yyyy-M-d"` — dedup-vlag, door het server-script geschreven (Admin SDK).
- `members/{uid}/fcmTokens/{token}: <timestamp>` — push-tokens per kind (map = meerdere toestellen).

---

## Checklist

### Fase 0 — Basis & tracking
- [x] Branch herbasseerd op `origin/main` (volledige `.gitignore` behouden, `migratie.html` weg).
- [x] Dit bestand (`PLAN-v17-meldingen.md`) aangemaakt + gepusht naar de branch.
- [x] Verouderde `migratie.html`-verwijzingen uit `CLAUDE.md` verwijderd.

### Fase A — Toestel-kant (client)
- [x] `manifest.json` (repo-root): standalone PWA-manifest (iOS 16.4+ web push vereist dit).
- [x] `index.html <head>`: `<link rel="manifest" href="manifest.json">` (apple-meta-tags blijven).
- [x] `firebase-messaging-sw.js` (repo-root): SW met `importScripts(...-compat.js)` +
      `onBackgroundMessage` → `showNotification`. Data-only berichten.
- [x] `index.html`: import `firebase-messaging.js`, SW registreren, `getMessaging`.
- [x] Opt-in knop "🔔 Meldingen aan" (footer) + `enableNotifications()` → `requestPermission()` →
      `getToken({ vapidKey, serviceWorkerRegistration })` → token opslaan. **In window-export.**
- [x] Token opslaan onder `members/{uid}/fcmTokens/{token}`.

### Fase B — Herinneringstijd instelbaar (Beheer → Instellingen)
- [x] Rij "Herinnering om" in `renderAdminSettings` + `editNotifyTime()` → `settings/notifyTime`.
      **In window-export.**

### Fase C — Security rules (gebruiker plakt in Console)
- [x] `firebase-rules-v16.json`: `members/$memberUid/fcmTokens` schrijfbaar door `auth.uid === $memberUid`.

### Fase D — Server-kant (GitHub Actions)
- [x] `.github/workflows/klusjes-herinnering.yml`: cron `*/30 * * * *` + `workflow_dispatch`.
- [x] `scripts/package.json` (enkel `firebase-admin`).
- [x] `scripts/notify.js`: admin-init, per-gezin tijd-check (`notifyTime` vs Brussel-nu, `lastNotified`
      dedup), open-klusjes per kind, FCM data-only push, token-opkuis.
- [x] **Pure "open klusjes"-functie** = port van `dayIndex`/`taskRing`/`taskAssignee`/`tasksForKidDay`
      (+ `onDay`) en `shiftPendingDay`/`shiftEffectiveNext`/`shiftForDay` uit `index.html`.

### Fase E — Verificatie (nep-Firebase in Node)
- [x] Pure open-klusjes-functie tegen een fixture; vergelijken met app-render.
- [x] Tijd-guard + dedup + "uit" testen.
- [x] `node --check` op het module-script; client opt-in mock-test.

### Fase F — Versie, docs, afronden
- [x] `VERSION` → `'klusjes-pwa v17'`.
- [x] `CHANGELOG.md`: v17-entry.
- [x] `CLAUDE.md`: sectie "Meldingen" (logica-duplicatie + sync-afspraak, nieuwe velden/bestanden).
- [x] Committen + pushen naar de branch (**niet** `main`).

### Fase G — Handmatige stappen voor de gebruiker (geen code)
1. Firebase Console → Cloud Messaging → **Web Push certificates**: VAPID-sleutelpaar; publieke
   sleutel in `index.html` (mag openbaar).
2. Console → Projectinstellingen → **Service accounts → Generate new private key** → JSON als
   GitHub-secret **`FIREBASE_SERVICE_ACCOUNT`**. Apart, minimaal-gescoopt service-account. Nooit in de repo.
3. Rules (Fase C) in de Console plakken.
4. Per kind-toestel: PWA op beginscherm, in de app **"Meldingen aan"** tikken + toestaan.

## Risico's
- **Logica-duplicatie** (app ↔ `notify.js`): bij een wijziging aan de klusjes-/beurt-berekening
  moet `notify.js` mee. Verbatim-kopie + bron-verwijzing + afspraak in `CLAUDE.md`.
- **iOS web push**: enkel geïnstalleerde PWA, per toestel toestemming, kan resetten.
- **GitHub-cron**: best-effort; "vanaf-tijd, één keer per dag" vangt late/gemiste runs op.
