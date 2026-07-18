# v17 — Avondmelding (push) voor openstaande klusjes  ✅ afgerond & live

> Historisch build-log (zoals `PLAN-v16.md`). De feature is gebouwd, getest en op `main`
> gezet; ze werkt end-to-end op een echt toestel. Actuele werkafspraken staan in `CLAUDE.md`
> (sectie **Push notifications**); wat er per versie shipte in `CHANGELOG.md`.

## Wat het doet
Een kind met openstaande klusjes krijgt een **push op de gsm, ook als de app dicht is** — met
zijn naam en een korte lijst van de niet-gedane klusjes. Per gezin instelbaar tijdstip
(standaard 19:00, of "uit"), één melding per dag.

## Architectuur (zonder Blaze/betaalkaart)
- **Toestel-kant** (`index.html` + companion files): `manifest.json` + `icon-192/512.png`
  (installeerbare PWA), `firebase-messaging-sw.js` (service worker, toont de melding via
  `onBackgroundMessage`, data-only berichten, relatieve paden wegens Pages-subpad), en een
  "🔔 Meldingen aan"-knop (`enableNotifications`) die per toestel toestemming vraagt en het
  FCM-token opslaat onder `members/{uid}/fcmTokens/{sanitizedKey}: token`.
- **Instelbaar**: Beheer → Instellingen → "Dagelijkse herinnering" (`editNotifyTime` →
  `settings/notifyTime`, `"HH:MM"` op heel/half uur of `"uit"`). `settings/lastNotified`
  (`"yyyy-M-d"`) is de server-dedup-vlag.
- **Server-kant**: GitHub Action (`.github/workflows/klusjes-herinnering.yml`, elk half uur
  + `workflow_dispatch` met een `force`-testknop) draait `scripts/notify.js` (Firebase Admin
  SDK). Per gezin, als Brussel-tijd ≥ `notifyTime` en vandaag nog niet gestuurd, een FCM-push
  naar elk actief kind met ≥1 open klusje. Dode tokens worden opgeruimd.
- **Rules**: een kind mag zijn eigen `members/{uid}/fcmTokens` schrijven (rest van `members`
  blijft ouder-only) — staat in `firebase-rules-v16.json`.

## ⚠️ Logica-duplicatie — in sync houden
`notify.js` herberekent zelf welke klusjes vandaag openstaan (de DB bewaart definities +
rotatiestand + `checks`, geen kant-en-klaar lijstje). De helpers daar (`dayIndex`,
`taskRing`/`taskAssignee`/`tasksForKidDay` + `onDay`, `shiftPendingDay`/`shiftEffectiveNext`/
`shiftForDay`) zijn **verbatim** uit `index.html`. Wijzigt die berekening in de app → pas
`notify.js` mee aan. (Een Node-cross-check test bevestigt dat beide hetzelfde geven.)

## Eenmalige setup (gedaan) — voor als het ooit opnieuw moet
1. Firebase Console → Cloud Messaging → Web Push certificates: VAPID-sleutelpaar; publieke
   sleutel staat in `index.html` (`VAPID_PUBLIC_KEY`).
2. Firebase Console → Service accounts → private key → GitHub-secret `FIREBASE_SERVICE_ACCOUNT`.
3. `firebase-rules-v16.json` in de Console plakken (Realtime Database → Rules → Publish).
4. Per kind-toestel: PWA op beginscherm (iOS-vereiste), in de app "🔔 Meldingen aan" tikken.

## Aandachtspunten
- **iOS**: web push werkt enkel in de geïnstalleerde PWA; toestemming kan resetten bij
  heropinstalleren.
- **GitHub-cron** is best-effort; het "vanaf-tijd, één keer per dag"-model vangt late/gemiste
  runs op. Scheduled runs vuren enkel vanaf de default branch (`main`).
