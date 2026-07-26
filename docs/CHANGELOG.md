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

## v19.7 — juli 2026
- **Kinderen kopen nu zelf, zonder eerst te vragen.** Wie genoeg diamanten heeft tikt "Koop"
  (met een bevestiging) en de beloning staat meteen op zijn naam; de diamanten gaan er direct af.
- **Twee lijstjes per kind** in de shop: *Gekocht — nog te krijgen* en *Al gekregen*. Het kind
  ziet dus zelf of het al geleverd is.
- **De ouder ziet die aankopen ook** en duidt met ✓ aan wanneer de beloning echt gegeven is
  (↩ om dat terug te draaien). Met 🗑 kan een aankoop teruggedraaid worden — de diamanten
  komen dan terug, handig bij een mistik van een kind.
- Het oude aanvragen-en-goedkeuren is vervallen. Al goedgekeurde inwisselingen van vóór deze
  versie blijven gewoon meetellen voor het saldo.
- Geen rules-wijziging nodig.

## v19.6 — juli 2026
- **"🛒 Shop" in plaats van "🎁 Beloningen"** voor de ingang naar het beloningsscherm (de
  footerknop en de titel). Het is voor de kinderen immers een winkeltje: sparen en uitgeven.
  Het cadeautje 🎁 blijft voorbehouden aan een losse beloning zonder eigen icoon of foto, en
  in Beheer heet de sectie nog steeds "Beloningen" — daar beheer je de catalogus.

## v19.5 — juli 2026
- **Beheer toonde altijd 🎁 bij een beloning**, ook nadat je een icoon of foto had gekozen —
  daardoor leek het alsof je keuze niet aankwam. De rij toont nu het gekozen icoon, of een
  klein voorbeeldje van je eigen foto. Op het beloningsscherm van de kinderen klopte het al;
  daar is niets veranderd.

## v19.4 — juli 2026
- **Beheer-secties zien er nu uit als openvouwen** in plaats van als vijf knoppen: de koppen
  staan als een lijst met dunne scheidingslijnen, het driehoekje draait open en de titel
  kleurt blauw zodra een sectie openstaat. De inhoud verschijnt tussen de lijnen, zodat je
  ziet dat ze bij die kop hoort.

## v19.3 — juli 2026
- **Beheer opgeruimd.** De vijf onderdelen (Taken, Beurt-taken, Beloningen, Instellingen,
  Reeksen & badges) staan nu standaard **ingeklapt**, elk met een korte samenvatting
  (aantal taken, ingesteld meld-uur, …). Je landt dus op een kort menu en klapt open wat je
  nodig hebt. Het iconenraster bij een beloning zit achter een eigen knop, zodat die 51
  knoppen niet meer in de weg staan.

## v19.2 — juli 2026
- **19 extra iconen** voor beloningen, nu 51 in totaal: een avontuur-/spelreeks (⛏️ mijnwerken,
  🗡️ zwaard, 🧟 zombie, 🏹 boogschieten, 💰 schat, 🏰 kasteel, 🚀 raket, 🤖 robot) en meer
  variatie daarnaast (🦄 eenhoorn, 🐴 paardrijden, 💃 dansen, 🎤 karaoke, 💅 nagels, 🧁 cupcake,
  🌸 bloemen, 🛼 rolschaatsen, 🧩 puzzel, 🦋 vlinder, ⭐ ster). Bewust één gemeenschappelijke
  lijst, niet opgesplitst per geslacht.

## v19.1 — juli 2026
- **Ruim 30 kant-en-klare iconen** voor beloningen (filmavond 🎬, wandeltocht 🥾, pretpark 🎡,
  pizza 🍕, …). Kies er één in Beheer bij de beloning; een eigen foto blijft mogelijk en
  krijgt dan voorrang. Zonder icoon én zonder foto blijft het 🎁.

## v19 — juli 2026
- **Nieuw: 💎 diamanten en beloningen.** Kinderen sparen diamanten en wisselen die in voor
  beloningen die jij zelf aanmaakt (filmavond, avondeten kiezen, een uitstap…).
  - **Verdienen**: 1 diamant per volledig afgewerkte dag, plus 3 extra bij elke badge.
    Enkel voor **vandaag** — terugbladeren en een oude dag aanvinken levert niets op. Iets
    weer uitvinken haalt de diamant van vandaag ook weer weg, dus aan- en uitvinken levert
    netto niets op. Iedereen **start op 0**: dagen die al afgewerkt waren tellen niet mee.
  - **Beheer → Beloningen**: beloningen toevoegen met naam, omschrijving, prijs in
    diamanten en een **foto** (die wordt in de app verkleind, dus ze blijft klein). Bij
    Instellingen kun je per kind diamanten handmatig bijsturen.
  - **🎁 Beloningen-scherm** (footer, en via de 💎-chip op de kaart van een kind): het
    saldo en alle beloningen; wat nog te duur is toont hoeveel er nog nodig is.
  - **Aanvragen en goedkeuren**: het kind tikt "Vraag dit", jij keurt goed of weigert. Pas
    bij goedkeuring gaan de diamanten af. Eén openstaande aanvraag per kind; beloningen
    zijn onbeperkt herhaalbaar. Ingewisselde beloningen blijven in de geschiedenis staan,
    ook als je de beloning later aanpast of verwijdert.
- Geen rules-wijziging nodig.

## v18.9 — juli 2026
- **Nieuw: "Kinderen mogen afvinken op"** (Beheer → Instellingen, ouder-only). Regelt of een
  kind ook op een àndere dag dan vandaag mag af- of uitvinken — zo kan een vergeten klusje van
  gisteren niet meer achteraf "goedgekeurd" worden. Vier standen:
  - **elke dag** — zoals voorheen (de **standaard**: gezinnen die niets instellen merken
    geen enkel verschil);
  - **niet in het verleden** — enkel vandaag en later;
  - **enkel vandaag** — ook vooruit afvinken geblokkeerd;
  - **nooit (enkel ouder)** — een kind vinkt helemaal niets meer af.
  Een ouder kan altijd elke dag aanpassen. Geldt voor gewone taken én beurten; een kind dat het
  toch probeert, krijgt een korte uitleg te zien.
- Geen rules-wijziging nodig.

## v18.8 — juli 2026
- **"📣 Stuur nu"-knop verwijderd** (Beheer → Instellingen): overbodig geworden nu een
  gsm-automatisering de herinnering betrouwbaar op het juiste moment kan triggeren. De
  server-logica (`settings/pushRequest`/`pushHandled`) is mee verwijderd uit
  `scripts/notify.js`; de gewone avondmelding (`settings/notifyTime`) werkt ongewijzigd.

## v18.7 — juli 2026
- **"📣 Stuur nu"-knop voor ouders** (Beheer → Instellingen): stuurt meteen een push-melding
  naar elk kind dat nu nog klusjes open heeft, zonder op het ingestelde uur te wachten. De
  knop zet een aanvraag klaar (`settings/pushRequest`); het server-script pikt ze bij zijn
  volgende run op (meestal binnen een kwartier) en markeert ze afgehandeld — één aanvraag =
  maximaal één melding. Respecteert "uit", telt niet als de avondmelding (die komt gewoon
  nog), en werkt voor elk gezin zonder extra setup. Geen rules-wijziging nodig.

## v18.6 — juli 2026
- **Nieuw app-icoon**: het witte vinkje op blauw is vervangen door een klembord met
  taakjes (twee afgevinkt, één te doen) op groen, in de kleurenstijl van de app
  (`icon-192.png`/`icon-512.png`, gekozen uit vier voorstellen). Let op: op een toestel
  waar de app al op het beginscherm staat verschijnt het nieuwe icoon pas na de
  bladwijzer verwijderen en opnieuw toevoegen (iOS cachet het icoon bij toevoegen).

## v18.5 — juli 2026
- **De oude 🔥 vlam- en 🏆 badge-emoji weer teruggezet** (op verzoek): de zelfgetekende
  SVG-varianten uit v18.4 (`FLAME_ICON`/`BADGE_ICON`) zijn vervangen door de vertrouwde emoji op
  de reeks-strook, de badge-chip, de Badges-knop en de galerij-titel. De rest van de gekleurde
  icoon-set blijft ongewijzigd.

## v18.4 — juli 2026
- **De rest van de UI-emoji vervangen door gekleurde eigen iconen** (voorstel-set): medaille
  (🏆 Badges — knop, reeks-strook én galerij-titel), tandwiel (⚙️ Beheer), bel met stip
  (🔔 Meldingen aan), potlood (✏️ alle bewerk-knoppen), kalender (📅 dag/week-toggle: rode
  kalender = wekelijks, blauwe met raster = dagelijks), vlam (🔥 reeks-teller) en hart (❤️
  joker beschikbaar, past nu bij het 💔 gebroken hart). Alleen ✓ (afvinken, al een wit haakje
  in het groene rondje) en enkele emoji in gewone tekst/alerts blijven. Hiermee is de hele
  zichtbare UI over op de samenhangende gekleurde icoon-set.

## v18.3 — juli 2026
- **Eerste gekleurde eigen iconen** i.p.v. emoji, op de plekken die gekozen zijn: de kleurschijf
  (kleur wisselen), het schild met stippen (pincode), het kopieer-icoon (gezinscode), het
  gezins-icoon (Gezin-knop), de blauwe herhaal-pijlen (beurt-taak, op de kaart én in Beheer),
  de teal persoon (vaste-taak-marker) en het gebroken hart (joker gebruikt). Nieuwe SVG-constanten
  in `index.html` met hun eigen kleuren (blijven helder op licht én donker). De overige emoji
  (🏆 🔔 ⚙️ ✏️ 📅 ✓ 🔥 ❤️) blijven voorlopig; de 🔁 in opgeslagen beurt-labels + de meldingstekst
  en de "terugkerend/eenmalig"-toggle blijven bewust emoji (data / andere betekenis).

## v18.2 — juli 2026
- **Beheer-scherm rustiger.** Taken en beurt-taken staan nu standaard ingeklapt met een korte
  samenvatting (wie/wanneer). Tik op een rij om ze open te klappen en te bewerken; een
  opengeklapte rij blijft open terwijl je wijzigt.

## v18.1 — juli 2026
- **Vergeten beurt wordt meteen een gewone taak.** Het genadevenster van 2 dagen (waarin een
  gemiste beurt nog als *beurt* op vandaag bleef staan) is teruggezet naar **0**: staat een
  beurt op haar geplande dag en wordt ze die dag niet gedaan, dan wordt ze de dag erna
  automatisch een gewone, **verschuifbare** taak bij dezelfde persoon (die het kind nadien zelf
  kan verzetten met ⏮/⏭ als die optie aan staat). Duidelijker dan het meeschuiven als beurt.
  De rotatie draait meteen door naar de volgende persoon (ongewijzigd). `SHIFT_GRACE = 0` in
  `index.html` én `scripts/notify.js`.

## v18 — juli 2026

**Beurt-rotatie loopt altijd door + genadevenster van 2 dagen.** De beurt-taak (bv.
stofzuigen) kan de rotatie niet meer blokkeren.
- Mist iemand zijn beurt, dan blijft die nog **vandaag + 2 dagen** (gisteren + eergisteren)
  als openstaande beurt op vandaag staan — zichtbaar, afvinkbaar en verschuifbaar (⏮/⏭).
  Zo houdt een gemiste beurt de dag onaf en telt ze mee voor de reeks (op een dag met andere
  taken).
- **Na het venster wordt de beurt automatisch een losse, verschuifbare taak** (`owedShiftRow`,
  ⏮/⏭) bij dezelfde persoon, en de rotatie schuift meteen door naar de volgende persoon op de
  volgende geplande dag. Niets loopt dus nog vast: de rol draait altijd verder. Dit gebeurt
  zowel in de app (bij een ouder die de app opent) als in het server-script (elke 30 min,
  als garantie ook wanneer niemand de app opent). Idempotent via een vaste taak-sleutel
  (`shift-{id}-{dag}`) + het nieuwe `fromShiftDay`-veld, zodat client en server elkaar nooit
  dubbelen.
- Vervangt het v17.3-gedrag (een gemiste beurt bleef onbeperkt op vandaag staan) door dit
  begrensde venster + auto-losmaken.
- **Nuance (bekend):** een dag met *enkel* een beurt en verder geen taken breekt de reeks niet
  hard — het zelf-herstel naar vandaag verhindert een retroactieve breuk; op een dag met andere
  taken breekt een niet-gedane (losse) beurt de reeks wél.
- Geen rules-wijziging nodig (ouder- en server-schrijf, en de kind-zelf-verschuif via
  `magVerschuiven` bestond al).

## v17.3 — juli 2026
- **Gemiste beurt-taak (bv. stofzuigen) verdwijnt niet meer.** Een niet-afgevinkte beurt
  bleef vroeger stil doorschuiven naar de volgende geplande dag (en telde zo niet mee); nu
  blijft ze op **vandaag** staan als openstaande beurt tot ze gedaan is. Zo houdt ze de dag
  onaf en telt een gemiste beurt mee voor de reeks (breekt ze, zoals een gewone gemiste taak,
  op een dag met andere taken). Dezelfde logica in `scripts/notify.js` mee aangepast, zodat
  de avondmelding een blijven-liggen beurt ook meldt.

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
