# Changelog — Klusjes-PWA

Wat er per versie veranderde, nieuwste bovenaan. De versie staat in de voettekst van de
app (`VERSION` in `index.html`) — zo zie je op een toestel welke build er draait.

**Versiebeleid:** kleine wijziging of bugfix → `v16.1`, `v16.2`, …; grote feature of
refactor → `v17`. Elke wijziging bumpt de versie in dezelfde commit en krijgt hier een
regel. Staat er "⚠️ rules": dan moet `firebase-rules-v16.json` opnieuw in de Firebase
Console geplakt worden.

<!-- Sjabloon voor de volgende versie:
## v17.1 — dd maand jjjj
- Korte omschrijving van de wijziging.
- ⚠️ rules: alleen vermelden als firebase-rules-v16.json wijzigde.
-->

## v17.2 — juli 2026
- Herinneringstijd instellen via een **keuzelijst** (op de gsm een native rol-picker) i.p.v.
  een tekstprompt. De lijst bevat enkel hele/halve uren + "uit".

## v17.1 — juli 2026
- Herinneringstijd: de instel-prompt aanvaardt nu enkel **hele of halve uren** (`:00`/`:30`),
  bv. 19:00 of 19:30. Het server-script draait toch maar elk half uur, dus fijnere tijden
  hadden geen effect — dit voorkomt verwarring over "tussenliggende" tijden. (Vervangen door
  de keuzelijst in v17.2.)

## v17 — juli 2026 (live)

**Push-meldingen — dagelijkse avondherinnering.** Een kind met openstaande klusjes krijgt
een melding op zijn toestel, ook als de app dicht is. (Volledig bouwplan: `PLAN-v17-meldingen.md`.)
- Toestel-kant: PWA-`manifest.json` + app-icoon, `firebase-messaging-sw.js` (service worker),
  een "🔔 Meldingen aan"-knop die per toestel toestemming vraagt en het FCM-token opslaat.
- Instelbaar per gezin: Beheer → Instellingen → "Dagelijkse herinnering" (`settings/notifyTime`,
  default 19:00, of "uit").
- Server-kant zonder betaalkaart: een GitHub Action (`.github/workflows/klusjes-herinnering.yml`)
  draait elk half uur en `scripts/notify.js` (Firebase Admin SDK) stuurt via FCM wie op zijn
  ingestelde tijd nog klusjes open heeft. Gratis op het Spark-plan.
- ⚠️ rules: `firebase-rules-v16.json` uitgebreid (een kind mag zijn eigen `members/{uid}/fcmTokens`
  schrijven) — opnieuw in de Console plakken.
- Handmatige stappen (eenmalig): VAPID-sleutel in `index.html`, service-account als GitHub-secret
  `FIREBASE_SERVICE_ACCOUNT`, rules plakken, en per kind-toestel "Meldingen aan" tikken.
  Zie `PLAN-v17-meldingen.md` → Fase G.

## v16 — juli 2026 (live)

De grote verbouwing (volledige achtergrond in `PLAN-v16.md`), plus de eerste
verbeterronde daarna — alles nog onder het label `klusjes-pwa v16`:

**Basis v16:**
- Multi-gezin: alle data per gezin onder `families/{familyId}/`, aansluiten via gezinscode.
- Firebase Auth: ouder-login (e-mail + wachtwoord) en kind-login (gebruikersnaam + pincode).
- Gezinsbeheer: kinderen toevoegen/hernoemen/kleur/pincode/pauzeren, gezinscode delen.
- A/B-buckets vervangen door een per-taak rotatiemodel (ring + pointer, dagelijks of
  wekelijks, vaste taak = één deelnemer).
- Stofzuigen veralgemeend tot **beurt-taken** (`settings/shifts`): meerdere mogelijk, met
  lijnen, deelnemers en een voltooiingsgedreven beurt die een kind zelf kan afvinken.
- Beheer achter de ouder-rol i.p.v. een client-side wachtwoord.
- Security rules in het repo (`firebase-rules-v16.json`); losse migratietool
  (`migratie.html`) voor de oude v15-data.

**Verbeterronde (14 juli 2026):**
- **Beurt doorschuiven gefixt:** ⏭ maakt de beurt los tot een verschuifbare eenmalige
  beurt voor dezelfde persoon en laat de rotatie meteen doordraaien naar de volgende
  (voorheen stond de hele rotatie stil tot die ene beurt gedaan was).
- Losgemaakte beurt blijft verschuifbaar (⏮/⏭), schuift bij negeren vanzelf mee naar
  vandaag, en staat niet in Beheer.
- 📥 "haal naar vandaag"-knop overal verwijderd — verschuiven volstaat.
- **Per-kind schakelaar "zelf beurten verschuiven"** (Beheer → Instellingen,
  `magVerschuiven` op het ledenrecord): een kind met de vlag mag zijn éigen beurt ⏮/⏭
  verschuiven; server-side afgedwongen. ⚠️ rules (reeds geplakt).
- `CLAUDE.md` herschreven naar v16 + versiebeleid en werk-checklist toegevoegd; dit
  changelog-bestand toegevoegd.
