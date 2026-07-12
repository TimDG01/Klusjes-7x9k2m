# Bouwplan Klusjes-PWA v16 — multi-gezin, Firebase Auth, flexibele rotatie

> **Status (laatst bijgewerkt na fase 7):** Fase **1 t/m 7 zijn gebouwd, getest en
> gepusht** — ouder-login met persistente sessie, gezin aanmaken/aansluiten via code, álle
> app-data genest per gezin onder `families/{familyId}/`, gezinsleden + kind-accounts
> beheren, kind-login met afgeschermde weergave, stofzuigen veralgemeend tot herbruikbare
> **beurt-taken** (`settings/shifts`) die een kind zelf kan afvinken, de A/B-buckets
> vervangen door een per-taak **ring+pointer rotatiemodel** (§2.3; lost ook 3+ kinderen op,
> met automatische migratie van oude bucketdata), en het **client-side beheerwachtwoord
> geschrapt** — beheer hangt nu aan de ouder-rol (`isParent()`). De rules-review na fase 3
> is gebeurd (geen blokkers — zie §5.3) en fase 6 (6a+6b) is nagelezen (geen blokkers).
> **Volgende stap: fase 8** (migratiehulp voor de oude JSON-export — Opus/high, onomkeerbaar,
> aparte reviewronde). Daarna fase 9 (VERSION → v16 + opschonen). Elke fase heeft onderaan
> §4 een eigen "Status: ✅"-blok. Zeg "ga verder met fase 8" (of "vanaf fase X") om te
> hervatten.
>
> **Modeladvies staat per fase-kop in §4** (bouw én, waar relevant, een aparte
> reviewronde). **Vaste regel: vóór je een fase start, meld expliciet welk
> model/niveau aanbevolen wordt voor die fase** — ook in een verse sessie, ook als
> de gebruiker het niet vraagt. Kort overzicht: fase 6 en 8 → Opus/high (+ Opus/high
> reviewronde erna, onomkeerbaar of algoritmisch lastig werk); fase 7 en 9 →
> Sonnet of Fable, medium (mechanisch, laag risico).
> **Branch:** `claude/chores-pwa-v16-plan-11kzki` was de planfase; **alle bouw-commits
> (fase 1–5) staan op `claude/phase-1-execution-fcxdv1`** — dáár verder werken. `main`
> blijft live v15 (v16 gaat pas live bij merge). Werkboom is schoon en volledig gepusht.
> **Nieuw Firebase-project:** `klusjesv2` (config in fase 1); Auth (e-mail/wachtwoord)
> staat aan, de rules uit `firebase-rules-v16.json` staan erop.
> **Testen:** headless Playwright tegen een inline fake-Firebase (geen netwerk) —
> `test-fase1..5.js` in de scratchpad, allemaal groen; een klikbare demo (nepdata) is als
> Artifact gepubliceerd. De scratchpad-testbestanden staan buiten de repo; een verse
> sessie kan ze opnieuw genereren volgens het CLAUDE.md-testpatroon.
>
> **Rules/data-model mismatch — OPGELOST in fase 3.** Vanaf fase 3 is `DB_ROOT`
> dynamisch `families/{familyId}/` (na login opgezocht via `userIndex/{uid}`), dus alle
> bestaande paden (`settings/`, `days/`, `streaks/`) nestelen automatisch onder het
> gezin — precies waar de live rules een ingelogde ouder lees/schrijftoegang geven. De
> eerdere "Geen verbinding"-situatie voor een echte ingelogde ouder is daarmee weg.
> **Nog wél open (bewust, per §2.2):** de dag-status staat nog plat
> (`days/{key}/{kid}-{taskId}`) i.p.v. genest per uid (`days/{key}/checks/{uid}/…`).
> Dat is nu onschuldig omdat alleen de ouder schrijft (de rules laten een ouder alle
> dag-schrijven toe); de per-uid-herstructurering is nodig zodra kinderen zelf afvinken
> en is naar fase 6 geschoven (kind-login is fase 5 — zie de kanttekening in het
> fase-3-blok). De reeds live rules anticiperen die structuur al (`checks`/`snap`/`shift`
> per uid), maar blokkeren de huidige platte ouder-schrijven niet.
>
> **Review-fixes na fase 2** (tweede-model-review op fase 1+2): (1) een foutmelding die
> ná `await signOut()` gezet werd kon door de `onAuthStateChanged(null)`-reset worden
> overschreven — de volgorde observer↔resolve is geen SDK-contract; opgelost met
> `pendingAuthError`/`pendingAuthMode` die de observer overneemt i.p.v. blind te wissen,
> en de fakes in de tests vuren observers nu bewust ná de resolve (worst case — zo is de
> regressie ook écht getest). (2) Gestrande accounts (aangemaakt maar nooit aan een gezin
> gekoppeld) liepen bij een nieuwe poging vast op "e-mail al in gebruik": de gezinsnaam
> wordt nu vóór de accountaanmaak gevraagd, en `ensureAccount` valt bij een bestaand
> e-mailadres terug op inloggen met dezelfde gegevens; `alreadyInFamily` (leest de eigen
> `userIndex`) stuurt een account dat al een gezin heeft gewoon door naar de app.
> (3) `setPersistence` in try/catch — een rejectie brak anders de hele module af (blanco
> scherm). (4) `teardownFamily`: uitloggen koppelt de vier gezinslisteners + daglistener
> af en reset caches/gates/`adminUnlocked`, zodat her-inloggen vers start (nu al correct,
> vanaf fase 3 onmisbaar omdat `DB_ROOT` dan per gezin verschilt). (5) De uitlog-knop
> verschijnt niet meer op het auth-scherm zelf tijdens create/join.

---

## 0. Kernbevindingen uit de bestaande code (v15)

Alles staat in één `index.html` (1651 regels): inline CSS + één `<script type="module">`.
Geen build/test-tooling. UI = volledige `render()` naar `#app.innerHTML` bij elke
state-wijziging; `onclick`-handlers moeten expliciet in de `Object.assign(window, {…})`
onderaan (regel 1639) staan, anders werken ze niet.

### 0.1 Firebase-SDK — WAT ER ECHT STAAT
De app gebruikt de **modulaire ESM-SDK v10.12.2**, geïmporteerd van gstatic (regels 149-150):

```js
import { initializeApp } from ".../firebase-app.js";
import { getDatabase, ref, onValue, set, update, remove, push } from ".../firebase-database.js";
```

**Géén compat-SDK, géén `<script>`-tags.** → In v16 breiden we consistent uit met de
modulaire auth-module:

```js
import { initializeApp, deleteApp } from ".../firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence,
         signInWithEmailAndPassword, createUserWithEmailAndPassword,
         onAuthStateChanged, signOut, updatePassword } from ".../firebase-auth.js";
```

### 0.2 De data-scoping hook die ALLES makkelijk maakt (regels 183-188)
```js
const DB_ROOT = new URLSearchParams(location.search).has('test') ? 'test/' : '';
const dbRef = path => ref(db, DB_ROOT + path);
const rootUpdate = obj => update(ref(db), … prefix elke sleutel met DB_ROOT …);
```
**Elke** DB-toegang loopt al door `dbRef(path)` / `rootUpdate(obj)`. Dit is precies het
inhaakpunt voor multi-gezin: in v16 wordt `DB_ROOT` dynamisch `families/{familyId}/`
(na login bekend via `/userIndex/{uid}`). Zolang alle bestaande paden (`days/…`,
`settings/…`, `streaks/…`) door `dbRef` blijven lopen, verhuizen ze **vanzelf** onder het
gezin — de listeners hoeven inhoudelijk niet te veranderen. Dit spaart enorm veel werk.
Regel uit CLAUDE.md die hier geldt: nieuwe refs ALTIJD via `dbRef`/`rootUpdate`, nooit
bare `ref(db, …)`.

### 0.3 De twee rotaties werken FUNDAMENTEEL verschillend (kern van fase 6)

| | Rol A/B | Stofzuigbeurt |
|---|---|---|
| Waar bepaald | `getRoles(idx)` regel 430 | `/settings/vacuum/next` regel 515 |
| Opgeslagen? | **Nee — puur uit datum** (`idx % 2`) | **Ja — pointer `{kid, floorIdx}`** |
| Wanneer schuift het door | elke dag automatisch (parity flip) | alleen bij afvinken (`advanceCombo`, regel 525) |
| Fallback | n.v.t. | `getVacuum` kalenderformule (regel 448) voor DB's zonder pointer |
| Deelnemers | hard 2 (`lies`/`lenn`) | hard 2 (flip `lies`↔`lenn`) |

`idx = dayIndex(current)` = dagen sinds `START` (26 juni 2026, regel 166). `START` blijft
in v16 het anker voor alle dag-index-wiskunde.

**Consequentie voor v16:** "wie is aan de beurt" moet per roterende taak *deterministisch
en optioneel opgeslagen* worden. De A/B-flip (datum-afgeleid) en de stofzuig-pointer
(opgeslagen) moeten allebei exact voortgezet worden bij migratie (fase 6). Aanbevolen
uniform model: zie §2.3.

### 0.4 Alle hardcoded `lies`/`lenn`-plekken (moet allemaal weg in fase 6)
CSS-vars (18-19, 28), `KID_NAMES` (192), `tasksCache` init (404), `streaksCache` init (410),
`getRoles` (433-434), `getVacuum` (460), `effectiveNext` validatie (518), `advanceCombo`
flip (529), `vacuumForDay` legacy-check (565), tasks-listener (738), streaks-listener
(775-776, 784), `render()` kids-array (856-857), `openBadges` validatie (1306),
`renderBadges` kids-array (1313-1314), `renderAdmin` vaste-taken-secties (1441-1442).
→ 20+ plekken. Alles moet dynamisch worden op basis van de gezinsleden-lijst (uid's).

### 0.5 Bestaande data-model (v15) dat MOET blijven werken
```
/days/{yyyy-M-d}/{kid}-{taskId}: bool          // per-dag afvinkstatus
/days/{yyyy-M-d}/vac: {kid, floor}             // bevroren stofzuig-historiek
/days/{yyyy-M-d}/snap/{kid}-{taskId}: {…}       // bevroren eenmalige taak
/settings/tasks/{A|B|lies|lenn}/{taskId}: {label, recurring, order, weekdays?}
/settings/vacuum: {weekdays[], floors?[], next?, override?, lastDone?}
/settings/streakStart: 'yyyy-M-d'
/streaks/{kid}/days/{yyyy-M-d}: true
/streaks/{kid}/badges/b{n}: 'yyyy-M-d'          // ordinale sleutel, waarde = verdiendag
```
Streak/joker/badge-logica (`simulateStreak` 649, `writeCompletionFlag` 716, `badgeSVG` 358,
de 13 `BADGES`/`MOTIFS`) blijft **inhoudelijk ongewijzigd** — alleen de kid-sleutel
verandert van `lies`/`lenn` naar de account-uid, en het pad krijgt de familie-prefix.

---

## 1. Belangrijkste architectuurbeslissingen (met aanbeveling)

Deze bepalen hoeveel refactor fase 3/6 kosten. Aanbeveling per punt; markeer als
**BESLISPUNT** waar ik jouw akkoord wil vóór de bouw.

### 2.1 Kid-sleutel: account-uid, niet meer een slug — **aanbevolen**
Overal waar nu `'lies'`/`'lenn'` staat, komt de Firebase-**uid** van het kind. Dat maakt
security-rules ("een kind mag enkel zijn eigen data schrijven") natuurlijk afdwingbaar
(`$uid === auth.uid`). Migratie (fase 6) hertekent de oude slugs → nieuwe uids.

### 2.2 Dag-status nesten per uid — **BESLIST: ja (nesten per uid)**
v15 gebruikt platte samengestelde sleutels: `days/{key}/{kid}-{taskId}: bool`. RTDB-rules
kunnen zo'n samengestelde sleutel niet splitsen om "alleen eigen vinkjes" af te dwingen
(geen dynamische regex op `auth.uid` in `$key`). → **Gekozen:** herstructureer naar
`days/{key}/checks/{uid}/{taskId}: bool`, `days/{key}/snap/{uid}/{taskId}: {…}`,
`days/{key}/vac: {uid, floor}`. Dan is de rule triviaal: `days/{key}/checks/{uid}`
schrijfbaar ⇔ `$uid === auth.uid` (kind) of ouder. Kost: aanpassing van `toggleTask` (1094),
`render()` id-opbouw (872), `daySnapsFor` (615), `vacuumForDay` (539), `renderCard` (960).
Migratie zet oude platte sleutels om. Dit is de grootste refactor in het plan; verrekend
in fase 6/8.

### 2.3 Rotatiemodel — uniform, deterministisch, optioneel per taak — **aanbevolen**
Rotatie wordt een eigenschap van een taak (opdracht §4b). Voorstel voor het taakrecord:
```
{ label, recurring, order, weekdays?,        // ongewijzigd t.o.v. v15
  rotation?: {                                // AFWEZIG = vaste taak (geen rotatie)
    members: [uid, uid, …],                   // volgorde = rotatievolgorde (subset of allen)
    interval: 'daily' | 'weekly',             // stap-eenheid
    anchorIdx: <dayIndex>,                     // dag-index waarop pointer==0 gold
    pointer: <int>                             // huidige stand; wie = members[(pointer)%len]
  }
}
```
"Wie is nu aan de beurt" = `members[ (pointer + stepsSince(anchorIdx, interval)) % len ]`.
Zo dekt één formule alle gevallen:
- **2 leden, interval daily** → gedraagt zich exact als de huidige A/B-flip.
- **3+ leden** → schuift door iedereen.
- **1 lid** → altijd dezelfde (geen echte rotatie).
- **0 leden / `rotation` afwezig** → gewoon een vaste taak.

Opgeslagen `pointer`+`anchorIdx` maakt het deterministisch én laat een ouder de stand
handmatig bijstellen (⏮/⏭, zoals nu bij stofzuigen). **Behoud bij migratie:** zet
`anchorIdx`/`pointer` zó dat vandaag exact `getRoles(todayIdx)` reproduceert (zie fase 6).

**BESLIST (rotatie-doorschuiven):** een gewone roterende taak schuift **kalendergedreven op
`interval`** door (elke dag/week vanzelf, zoals nu bij A/B) — behoudt exact het huidige
gedrag en is het simpelst te migreren. Plus dezelfde handmatige ⏮/⏭-override voor
uitzonderingen. De beurt-taak (§2.4) houdt daarnaast zijn eigen voltooiingsgedreven pointer.

### 2.4 Beurt-taken: veralgemeend stofzuig-mechaniek — **BESLIST**
Stofzuigen wordt in v16 **niet** meer hardgecodeerd. In plaats daarvan komt er een tweede,
herbruikbaar taaktype dat het huidige stofzuig-mechaniek veralgemeent, zodat je zelf zulke
beurt-taken kunt aanmaken. Een **beurt-taak** heeft:
```
settings/shifts/{shiftId}: {
  name,                          // bv. "Stofzuigen"
  weekdays: [1,2,…],             // op welke dagen ze telt (bv. maandag+dinsdag)
  lines:   ['Gelijkvloers', …],  // één of meer "lijnen" (de oude verdiepingen), bijplaatsbaar
  members: [uid, uid, …],        // welke kinderen meedraaien
  next:     { memberIdx, lineIdx },   // huidige stand — voltooiingsgedreven, zoals nu vacuum/next
  override?, lastDone?           // exact het huidige override/lastDone-gedrag
}
```
De app roteert per beurt kind + lijn (`memberIdx`/`lineIdx`), schuift alleen door bij
afvinken, en behoudt álle bestaande fijn-afgestelde gedragingen: een gemiste beurt schuift
door naar dezelfde persoon, de vooruit-projectie, ⏮/📥/⏭, en de bevroren `days/{key}/vac`-
historiek. Concreet = de v15-stofzuigfuncties (`getVacuum` 448, `effectiveNext` 515,
`advanceCombo` 525, `pendingVacuumDay` 490, `vacuumForDay` 539, de move-knoppen 1062-1092)
worden geparametriseerd per `shiftId` i.p.v. het ene globale `settings/vacuum`, en
`kid`→`uid`, `floor`→`line`. **"Stofzuigen" is dan gewoon de eerste beurt-taak** — bij
migratie 1-op-1 uit `settings/vacuum` overgezet (§ fase 8), met behoud van de pointer.

> Zo dekt v16 exact wat je beschreef: "ik voeg stofzuigen toe, het moet maandag+dinsdag,
> ik voeg extra lijnen toe, en die lijnen roteren per kind per dag." Meerdere beurt-taken
> naast elkaar zijn mogelijk (bv. stofzuigen én afwas-beurt). De `advanceCombo`-flip (nu
> binair `lies`↔`lenn`, regel 529) wordt "volgende `memberIdx` in de ring", zodat het ook
> met 1, 3 of meer deelnemers klopt.

### 2.6 `?test`-sandbox
In v16 is data al per-gezin gescheiden, dus de oude `?test`-prefix is grotendeels
overbodig. Aanbeveling: laten vallen óf vervangen door een expliciet "testgezin".
Lage prioriteit; parkeren tot fase 9.

---

## 3. Doel-datamodel v16 (concreet)

```
/families/{familyId}/
  ├── meta/            { naam, gezinscode, aangemaakt }
  ├── members/{uid}/   { rol:'ouder'|'kind', weergavenaam, gebruikersnaam?(kind),
  │                      kleur|avatar, actief:bool }
  ├── settings/
  │     ├── tasks/{taskId}/…    { label, recurring, order, weekdays?, rotation? }  (§2.3)
  │     ├── shifts/{shiftId}/…  { name, weekdays[], lines[], members[], next, override?, lastDone? }  (§2.4)
  │     └── streakStart         'yyyy-M-d'
  ├── days/{yyyy-M-d}/
  │     ├── checks/{uid}/{taskId}: bool        (§2.2: genest per uid)
  │     ├── snap/{uid}/{taskId}: {…}
  │     └── shift/{shiftId}: { uid, line }      (bevroren beurt-historiek, was days/*/vac)
  └── streaks/{uid}/
        ├── days/{yyyy-M-d}: true
        └── badges/b{n}: 'yyyy-M-d'

/familyCodes/{CODE6}: familyId          // lookup bij aansluiten
/userIndex/{uid}: familyId              // na login direct het juiste gezin vinden
```
> Opmerking: opdracht §4 noemt `chores/…` als verzamelnaam. Ik stel voor de bestaande
> substructuur (`settings`/`days`/`streaks`) te behouden ónder het gezinsnode i.p.v. te
> hernoemen — dat houdt de v15-listeners vrijwel ongewijzigd. Als je liever letterlijk
> `chores/` wil, is dat een extra rename-stap; zeg het en ik pas het plan aan.

**Principe — álles genest per gezin.** Alle echte data (`meta`, `members`, `settings/tasks`,
`settings/shifts`, `settings/streakStart`, `days`, `streaks`) leeft onder één subtree
`families/{familyId}/…` met de `familyId` vooraan; de `DB_ROOT`-prefix regelt dit voor elke
DB-toegang automatisch. De **enige** twee top-level nodes zijn de lookup-tabellen
`/familyCodes/{code}` en `/userIndex/{uid}`, en dat móét: het zijn de wegwijzers die je nodig
hebt vóórdat je je `familyId` kent (na login heb je enkel `auth.uid` → lees
`/userIndex/{uid}`; bij aansluiten enkel de code → lees `/familyCodes/{code}`). Ze worden
benaderd met een bare, niet-geprefixte `ref(db, …)` — de bewuste uitzondering op de
`dbRef`-regel.

**BESLIST — streaks genest ín het gezin** (`families/{fid}/streaks/{uid}`), niet apart
top-level. Redenen: (1) een top-level `/streaks/{uid}` zou álle gezinnen dooreen mengen —
genest is de data van nature gescoped tot dit gezin; (2) de v15-één-listener
(`onValue(dbRef('streaks'))` + niet-fatale foutafhandeling) blijft ongewijzigd werken via
de `DB_ROOT`-prefix; (3) rules blijven simpel: lezen op `families/{fid}/streaks` = elk
gezinslid (past bij de gedeelde 🏆-galerij), schrijven op `…/streaks/{uid}` ⇔
`$uid===auth.uid` of ouder — geen kruislingse `/userIndex`-check nodig; (4) badge-historiek
hoort bij het gezin. De Firebase-"vermijd diepe nesting"-regel geldt hier niet: we lezen
nooit de hele `families/{fid}`-node, alleen gerichte subpaden, dus op het leespunt is het
effectief plat.

### Accountmodel (bovenaan de code als NL-comment, opdracht "Randvoorwaarden")
- **Ouder** = echt e-mail + wachtwoord-account.
- **Kind** = gebruikersnaam + pincode; de app zet dit om naar synthetisch e-mailadres
  `{genormaliseerde-naam}@kids.klusjesv2.app` en gebruikt de pincode als wachtwoord.
  Firebase weigert dubbele e-mailadressen → gebruikersnamen zijn gratis globaal uniek.
  Pincode ≥ 6 cijfers (Firebase-minimum); comment erbij dat dit een lichte drempel is
  tegen mede-broers/zussen, geen sterke beveiliging.
- Iedereen blijft ingelogd via `browserLocalPersistence` tot expliciet uitloggen.

---

## 4. De fasen (klein, afgerond, elk apart committen + pushen naar de branch)

> Na ELKE fase: commit met duidelijke NL-boodschap + `git push -u origin
> claude/chores-pwa-v16-plan-11kzki`. Nooit naar `main`. Elke fase eindigt met een korte
> "wat is af / volgende stap"-samenvatting.

### Fase 1 — Firebase-config vervangen + Auth-basis (ouder-login, persistente sessie)
> **Gebruikt: Fable 5.** Achteraf bekeken een goede fit — mechanisch, laag risico.

**Doel:** app draait op `klusjesv2`, ouder kan inloggen en blijft ingelogd; bestaande
functionaliteit blijft werken voor een ingelogde ouder.
- Vervang `firebaseConfig` (regels 152-160) door de klusjesv2-config (zie onder). Geen
  `measurementId` (Analytics niet nodig).
- Importeer `firebase-auth.js`; `getAuth`; `await setPersistence(auth, browserLocalPersistence)`.
- Bouw een **startscherm** (nieuw `screen`-type `'auth'`) met knop "Inloggen als ouder"
  → e-mail + wachtwoord (`signInWithEmailAndPassword`). Foutafhandeling in NL.
- `onAuthStateChanged`: ingelogd → app tonen, uitgelogd → startscherm. Uitlog-knop.
- De DB-listeners pas starten zodra auth + familyId bekend zijn (nu starten ze bij load,
  regels 731-817 — verplaats naar een `initFamily(familyId)` die na login draait).
- **Config klusjesv2:**
  ```js
  apiKey:"AIzaSyBMLoS2ybJV-G0cYOIP_PHcc3BAbdAXI2c",
  authDomain:"klusjesv2.firebaseapp.com",
  databaseURL:"https://klusjesv2-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:"klusjesv2", storageBucket:"klusjesv2.firebasestorage.app",
  messagingSenderId:"1066695207859", appId:"1:1066695207859:web:3a5a9dfdde234b02acb9c6"
  ```
- **Test:** fake-Auth + fake-DB via `page.route()` (zoals CLAUDE.md beschrijft voor DB;
  breid uit met een fake `firebase-auth.js`). Verifieer: login, persistente sessie
  (herladen blijft ingelogd), uitloggen.
- **Commit:** `Fase 1: klusjesv2-config + ouder-login met persistente sessie`.

**Status: ✅ gebouwd & getest.** `firebaseConfig` staat op `klusjesv2`; `auth`-module
geïmporteerd met `browserLocalPersistence`. Nieuw scherm `screen==='auth'` (login-kaart
met e-mail/wachtwoord, NL-foutmeldingen, "Bezig…"-status) via `renderAuth`/`submitLogin`.
`onAuthStateChanged` bepaalt het scherm en start `initFamily()` (alle bestaande
tasks/vacuum/streaks/streakStart/dag-listeners, ongewijzigd in inhoud, enkel verplaatst
uit module-top-level) precies één keer na de eerste succesvolle login — een latere
token-refresh triggert `initFamily` niet opnieuw (`familyInited`-guard). Uitlog-knop
zit in `versionLine()` (dus zichtbaar op elk scherm) en roept `signOut(auth)` aan.
Playwright-tests (fake `firebase-app.js`/`firebase-database.js`/`firebase-auth.js` via
`page.route()`) bevestigen: startscherm → fout-wachtwoord-melding → geslaagde login
toont de dagkaarten → Beheer/Badges blijven werken → herladen blijft ingelogd →
uitloggen keert terug naar het loginscherm. Zie de mismatch-waarschuwing hierboven bij
**Status** voor wat dit betekent voor manuele device-acceptatie tegen de echte
`klusjesv2`-database.

### Fase 2 — Registratie: nieuw gezin aanmaken + gezinscode
> **Gebruikt: Fable 5**, met een aparte reviewronde (Opus) die twee echte bugs
> vond (signOut-race, gestrande accounts) — zie de review-fixes hierboven.
> Achteraf: voor deze fase (schrijft naar accounts/auth-state) is een reviewronde
> wél de moeite waard, ook al is de bouw zelf mechanisch.

**Doel:** een ouder kan een gezin oprichten en krijgt een unieke 6-teken code.
- Startscherm-knop "Nieuw gezin aanmaken": `createUserWithEmailAndPassword` →
  gezinsnaam-prompt → genereer `familyId` (`push`-key) + 6-teken code (hoofdletters+cijfers,
  botsingscontrole tegen `/familyCodes`).
- Atomische schrijf (één `update(ref(db), {…})`): `families/{fid}/meta` (incl. `gezinscode`),
  `families/{fid}/members/{uid}={rol:'ouder',…}`, `familyCodes/{code}=fid`, `userIndex/{uid}=fid`.
- **Zaai de defaults hier, bij het aanmaken** (niet lui-bij-openen): schrijf meteen
  `settings/tasks` (= `DEFAULT_TASKS`) en `settings/shifts` (de eerste beurt-taak) mee in de
  create. Reden: de security-rules maken `settings` ouder-only, dus als een *kind* als eerste
  een nog-niet-gezaaid gezin opent, mag het niet zaaien en blijft de app op "Laden…" hangen.
  (In v15 zaait de listener lui — dat patroon vervalt hier.) **[bevinding uit de rules-review]**
- Knop "Bij bestaand gezin aansluiten als ouder": registreren + code invoeren → lees
  `familyCodes/{code}` → schrijf eigen `members/{uid}` mét een `viaCode`-veld = de ingevoerde
  gezinscode (de rules verifiëren dat server-side tegen `meta/gezinscode`) + `userIndex/{uid}`.
  ⚠️ Zie §5 en `firebase-rules-v16.json`: self-insert lukt enkel met de juiste code én als je
  nog geen lid bent.
- **Test:** nieuw gezin → code verschijnt; tweede ouder sluit aan met die code.
- **Commit:** `Fase 2: nieuw gezin aanmaken + mede-ouder aansluiten via gezinscode`.

**Status: ✅ gebouwd & getest.** Auth-scherm uitgebreid met `authMode` ('login' |
'create' | 'join') en twee nieuwe links onder het inlogformulier. `submitCreateFamily`:
`createUserWithEmailAndPassword` → `prompt()` voor de gezinsnaam → `familyId` via een
lege `push()` (reserveert enkel een key, schrijft niets) → `generateUniqueFamilyCode`
(botsingscontrole met `get()` tegen `/familyCodes`, 20 pogingen) → één root-level
`update(ref(db), {…})` die `families/{fid}/meta|members|settings/tasks|settings/shifts`
handmatig met `DB_ROOT` prefixt en `familyCodes/{code}` + `userIndex/{uid}` bewust
ongeprefixt laat (de bare uitzondering uit §3) — dus geen `rootUpdate()`, die zou alles
prefixen. De code verschijnt via `alert()` na de write. `submitJoinFamily`: zelfde
account-aanmaak, dan `get()` op `/familyCodes/{code}` (mag pas na inloggen, want de
rule vereist `auth != null`); onbestaande code → uitloggen + foutmelding, zodat een
hernieuwde poging niet vastloopt op "e-mailadres al in gebruik"; bestaande code →
`members/{uid}` met `viaCode` erbij (de rule verifieert dat server-side tegen
`meta/gezinscode`) + `userIndex/{uid}`, weer in één `update()`. `onAuthStateChanged`
navigeert alleen automatisch naar het dagscherm bij `authMode==='login'` — bij
create/join houdt de eigen functie de regie tot de gezins-write klaar is, zodat het
scherm niet voortijdig wegspringt terwijl de code nog gegenereerd wordt.
`settings/shifts` is meteen gezaaid met een eerste "Stofzuigen"-beurt-taak in de vorm
uit §2.4 (nog leeg qua `members` — kinderen komen pas in fase 4), zodat een kind dat als
eerste een nieuw gezin opent nooit op een ongezaaide `settings`-tak stuit (zie de
rules-bevinding hierboven). Playwright-tests (fake `createUserWithEmailAndPassword` +
`get()` toegevoegd aan de fase-1-testharness, databackend nu via `localStorage`
gedeeld tussen paginas om twee "ouders" te simuleren, sessie via `sessionStorage`
per pagina geïsoleerd) bevestigen: gezin aanmaken toont een 6-tekens-code, een tweede
ouder sluit aan met die code (ook in kleine letters — de app dwingt hoofdletters af) en
komt op het dagscherm, en een foute code toont een foutmelding zónder het scherm te
laten doorstromen naar de app.

### Fase 3 — Datastructuur + userIndex + security rules (EERSTE versie) → **STOP**
> **Gebruikt: Fable 5** voor de bouw, **Opus/high** voor de verplichte rules-review
> op het STOP-punt (§5.3) — die vond het bootstrap/settings-schrijfgat dat de
> planfase-Playground-test miste. Bevestigt de vuistregel: bouw mag snel, de
> beveiligingsregels-review niet.

**Doel:** alle app-data leeft onder `families/{familyId}/`; rules-JSON opgeleverd.
- Maak `DB_ROOT` dynamisch: na login `familyId` uit `/userIndex/{uid}` → `DB_ROOT =
  'families/'+familyId+'/'`. `dbRef`/`rootUpdate` ongewijzigd → alle paden verhuizen mee.
- Herstructureer dag-status per uid (§2.2 optie A) als je die beslissing volgt (kan ook
  naar fase 6 als het te veel wordt; dan rules alvast op de doelstructuur schrijven).
- Schrijf `firebase-rules-v16.json` (apart bestand, plak-klaar voor de Console) met per
  regel een **NL-comment**:
  - alleen geauthenticeerd;
  - lezen/schrijven binnen eigen gezin (via `/userIndex/{auth.uid}`);
  - `meta`/`members`/taakdefinities: alleen rol `ouder`;
  - kind: alleen eigen `days/.../checks/{uid}` + `streaks/{uid}`;
  - `/familyCodes`: gerichte lookup;
  - `/userIndex/{uid}`: alleen door die uid zelf.
  - Dek expliciet de bootstrap-gevallen: nieuw gezin aanmaken (§5-gotcha 1) en
    mede-ouder self-insert (gotcha 2).
- **Na oplevering van het rules-bestand: STOP. Ga NIET door naar fase 4.** Geef letterlijk:

  > "Fase 3 is klaar: de security rules staan in `firebase-rules-v16.json`. Wissel nu naar
  > een sterker model voor de review: typ `/model opus`, plak daarna het rules-bestand en
  > vraag om een controle op: (1) kan een kind schrijven waar het niet mag, (2) kan een
  > niet-member gezinsdata lezen, (3) kan /familyCodes of /userIndex misbruikt worden,
  > (4) werkt het aanmaken van een nieuw gezin correct. Kom daarna terug met `/model sonnet`
  > om verder te gaan met fase 4."

  Wacht op bevestiging vóór fase 4.
- **Commit:** `Fase 3: gezins-gescoopte datastructuur + userIndex + security rules v1`.

**Status: ✅ gebouwd & getest — STOP-punt bereikt.** `DB_ROOT` is gesplitst in een vaste
`BASE_ROOT` (`''`, of `'test/'` bij `?test`) en een dynamische `DB_ROOT` die na login
`BASE_ROOT + 'families/{familyId}/'` wordt. De gezins-resolutie (`resolveFamilyAndInit`)
zoekt `userIndex/{uid}` op en roept `startFamily(fid)` aan, dat `DB_ROOT` zet en
`initFamily()` start — alle bestaande `dbRef`/`rootUpdate`-paden verhuizen zo vanzelf
onder het gezin, de listeners bleven inhoudelijk ongewijzigd. Create/join zetten hun
gezin zelf op (ze kennen de `familyId` al); een gewone login gaat via de resolutie. De
twee wegwijzers `userIndex`/`familyCodes` lopen via `baseRef` (BASE_ROOT-prefix, geen
gezins-scope). Een ingelogd account **zonder** gezin (bv. een afgebroken create/join)
wordt netjes uitgelogd met uitleg i.p.v. de app op een onbekende scope te laten draaien.
`teardownFamily` reset nu ook `DB_ROOT`/`familyId`/`familyResolving`.

**Bevinding tijdens de rules-verificatie (belangrijk, gefixt):** de fase-2 create schreef
`settings/tasks|vacuum|shifts` in dezelfde atomische update als `members`. De
`settings`-regel is echter ouder-only op basis van `root` (de stáát vóór de schrijf), en
tijdens het aanmaken is de schrijver in `root` nog géén ouder-lid → die schrijf zou op de
échte backend geweigerd worden. De Playground-test uit de planfase schreef enkel
`members`, niet `settings`, dus het bleef onopgemerkt. **Fix (app-kant, geen rule
verzwakt):** de create is opgesplitst in (1) bootstrap `meta`+`members`+`familyCodes`+
`userIndex`, en daarná (2) de `settings` — pas dan is de aanmaker een vastgelegd
ouder-lid en slaagt de bestaande ouder-only regel. Zo bleef de tightste rule staan (geen
bootstrap-uitzondering op `settings`, wat schrijven naar niet-bestaande gezinnen zou
toelaten). Het rules-bestand kreeg hierover een verklarende NL-comment; de regels zelf
zijn ongewijzigd t.o.v. de al-geplaatste versie.

**Kanttekening — dag-status nog niet per uid.** Per §2.2 blijft `days/{key}/{kid}-{taskId}`
voorlopig plat; de per-uid-nesting (`checks/{uid}`) is naar fase 6 geschoven. Dit werkt
nu omdat enkel de ouder schrijft. **Let op bij fase 5 (kind-login):** een kind dat zelf
afvinkt heeft die nesting nodig, anders weigeren de rules de platte dag-schrijf van het
kind (dag-niveau is ouder-only). Trek de §2.2-herstructurering dus naar voren (fase 5 of
begin fase 6) vóór kinderen echt zelf afvinken.

**Tests:** Playwright-suite `test-fase3.js` bewijst: aanmaken nestelt data onder
`families/{fid}/` (geen platte paden), afvinken schrijft onder `families/{fid}/days`,
herladen herstelt de sessie via `userIndex`, een tweede ouder sluit aan en zit in
hetzelfde gezin, en een gestrand account krijgt de nette uitleg. Fase 1 en 2 blijven
groen (de fase-1-test seedt nu een gezin, want "ingelogd" vereist er sinds fase 3 één).

**Rules-review (het STOP-punt):** `firebase-rules-v16.json` staat al op `klusjesv2` en is
tijdens de planfase via de Playground getoetst (§5.1). Fase 3 voegde géén regel toe of
weg — enkel de create-flow is aangepast en er is een verklarende comment bij `settings`
gezet. De hierboven beschreven create-bevinding is precies punt (4) van de gevraagde
review; laat een sterk model ook (1) kind-schrijfrechten, (2) niet-member-leesrechten en
(3) `familyCodes`/`userIndex`-misbruik nog eens nalopen vóór fase 4.

### Fase 4 — Scherm "Gezinsleden beheren" + kind-accounts (tweede app-instantie!)
> **Gebruikt: Fable 5.** De kritieke eis (ouder blijft ingelogd tijdens kind-aanmaak)
> was scherp genoeg beschreven in het plan dat een snel model het correct bouwde;
> de test dekte het expliciet af in plaats van op review te vertrouwen.

**Doel:** ouder maakt/beheert kinderen; login-account wordt onderliggend aangemaakt.
- Apart scherm (nieuw `screen`-type, eigen knop/icoon), LOS van "Beheer taken".
- Lijst van bestaande kinderen bovenaan; gezinscode met kopieerknop.
- **Kind toevoegen:** gebruikersnaam + pincode(≥6 cijfers) + kleur/avatar.
  ⚠️ **Cruciaal:** maak het kind-account via een **tweede, tijdelijke app-instantie**
  (`initializeApp(config, 'secondary')` → `getAuth(secondaryApp)`), anders logt het de
  ouder uit. Volgorde die de rules respecteert:
  1. secundaire app: `createUserWithEmailAndPassword(username@kids…, pin)` → nu ingelogd
     als kind in de secundaire app;
  2. secundaire app (als kind): schrijf `userIndex/{kidUid}=fid` (mag: eigen uid);
  3. primaire app (als ouder): schrijf `families/{fid}/members/{kidUid}={rol:'kind',…}`
     (mag: ouder);
  4. `signOut(secondaryAuth)` + `deleteApp(secondaryApp)`.
  Vang `auth/email-already-in-use` → NL "Deze naam is al in gebruik, kies een andere".
- **Pincode resetten** (ouder kiest nieuwe): kan niet zomaar via de ouder-sessie; opties
  documenteren (secundaire-app re-auth met oude pin, of Admin-SDK/Cloud Function — buiten
  scope single-file). Praktische v16-oplossing: reset vereist de oude pin, óf markeer als
  bekende beperking. **BESLISPUNT** bij de bouw.
- **Hernoemen / deactiveren / verwijderen** (met bevestiging): weergavenaam &
  `actief`-vlag in `members`; historiek/streaks blijven bewaard (soft-delete aanbevolen
  boven hard-delete, want het uid-account zelf kun je client-side niet verwijderen).
- **Test:** kind toevoegen terwijl ouder ingelogd blijft (kritische assertie);
  dubbele naam → nette NL-fout.
- **Commit:** `Fase 4: gezinsleden beheren + kind-accounts via tweede app-instantie`.

**Status: ✅ gebouwd & getest.** Nieuw scherm `screen==='members'` (footer-knop "👨‍👩‍👧
Gezin", zelfde wachtwoord-drempel als Beheer via een `pwTarget`-parameter — verdwijnt in
fase 7): gezinsnaam + gezinscode met 📋-kopieerknop, kinderlijst met per kind 🎨 kleur
(cyclet door `KID_COLORS`), ✏️ hernoemen, 🔑 pincode wijzigen, ⏸/▶ pauzeren (soft-delete,
`actief`-vlag) en 🗑 verwijderen (member-record weg na zware confirm; historiek/streaks
en het login-account blijven), en de ouderlijst ("jij"-marker, eigen naam hernoembaar).
Twee nieuwe listeners in `initFamily` (eigen gates `metaLoaded`/`membersLoaded`,
CLAUDE.md-patroon; geen seeding — de bootstrap schreef ze al). **Kind toevoegen** volgt
exact de rules-volgorde uit het plan: tijdelijke tweede app-instantie
(`initializeApp(config,'secondary-…')`), daar `createUserWithEmailAndPassword` met het
synthetische adres `{genormaliseerde-naam}@kids.klusjesv2.app` + pincode (≥6 cijfers,
gevalideerd), dan als kind (secundaire app) `userIndex/{kidUid}`, dan als ouder
(primaire app) `members/{kidUid}`, en tot slot `signOut`+`deleteApp` in een `finally`.
Bestaat het adres al, dan probeert de flow secundair in te loggen met de opgegeven pin
en hecht het een eerder gestrand account alsnog aan (zelfde herstel-idee als
`ensureAccount`); hoort het account al bij een ánder gezin → "Deze naam is al in
gebruik". **BESLISPUNT pincode-reset → beslist:** wijzigen kan alleen mét de huidige pin
(secundaire app: inloggen met oude pin → `updatePassword`); een vergeten pin is een
bekende beperking (client-side is andermans wachtwoord niet te resetten zonder
Admin-SDK/Cloud Function) en staat zo ook op het scherm vermeld. Playwright
(`test-fase4.js`, fake-auth nu met state per app-instantie zoals de echte SDK):
gezinscode zichtbaar en correct, kind toevoegen mét de kritische assertie dat de ouder
ingelogd blijft, genormaliseerde gebruikersnaam + `userIndex`-wegwijzer kloppen, dubbele
naam → nette NL-fout, pin wijzigen (foute oude pin → fout; juiste → echt gewijzigd),
hernoemen, pauzeren/activeren en verwijderen. Fase 1–3 blijven groen.

### Fase 5 — Kind-login (naam + pincode) + afgeschermde kindweergave
> **Gebruikt: Fable 5.** Deze fase trok ongepland een stuk fase 6 naar voren
> (per-uid-nesting + dynamische kind-kaarten, wegens rules-bevinding B) — dat
> verhoogde het risico t.o.v. de oorspronkelijke inschatting. Ging goed, maar met
> de kennis van nu was hier Sonnet/medium of een korte reviewronde verstandiger
> geweest gezien de omvang van de refactor.

**Doel:** kind logt kindvriendelijk in en ziet enkel eigen klusjes/streaks/badges.
- Startscherm-knop "Inloggen als kind": grote knoppen, `inputmode="numeric"` voor de pin.
  Zet naam om naar `{naam}@kids.klusjesv2.app`, `signInWithEmailAndPassword`.
- Na login: rol uit `members/{uid}`. Kind → alleen eigen kaart; **beheerknoppen verbergen
  ÉN routes blokkeren** (geen `screen==='admin'`/`'members'` voor kinderen). Harde
  afdwinging zit al in de rules (fase 3).
- **Eenmalige taak úítvinken is ouder-only** (de rules laten een kind een eenmalige taak wél
  afvinken/verwijderen, maar de definitie herstellen niet). In de kind-UI dus het uitvinken
  van een bevroren eenmalige taak verbergen/deactiveren (bv. "vraag een ouder"). Gewone
  terugkerende taken en beurt-taken kan een kind gewoon aan- én uitvinken. **[bevinding uit
  de rules-review]**
- Ook de voltooiings-vlag op het lees-pad (`writeCompletionFlag`) enkel voor de **eigen** uid
  schrijven wanneer een kind is ingelogd — anders weigert de streaks-rule de sibling-write.
- Discrete uitlog-optie voor het kind.
- **Test:** kind-login toont enkel eigen data; beheerroutes onbereikbaar.
- **Commit:** `Fase 5: kind-login met pincode + afgeschermde kindweergave`.

**Status: ✅ gebouwd & getest — mét vooruitgeschoven fase-6-kern.** De rules-review
(bevinding B, §5.3) maakte twee stukken fase 6 tot randvoorwaarde; die zijn hier
meegenomen:
- **Dagstatus per uid (§2.2):** `days/{key}/checks/{uid}/{taskId}` +
  `days/{key}/snap/{uid}/{taskId}`. `toggleTask(uid, taskId)` en een aparte
  `toggleVacuum(uid)`; de one-off freeze/restore blijft één atomische multi-path
  update op de nieuwe paden. Geen migratie nodig — klusjesv2 is een verse database
  (fase 8 zet de oude export om).
- **Dynamische kinderen (deel van fase 6):** de kaarten komen uit `members`
  (actieve kind-leden, gesorteerd op uid — stabiel bij hernoemen), kleuren uit het
  ledenrecord (`kleur` + transparante tint, CSS-vars --lies/--lenn verwijderd),
  rolverdeling via `roleFor(positie, dagindex)` (met twee kinderen exact de oude
  A/B-flip; het volwaardige §2.3-model met anker/pointer blijft fase 6), vaste
  taak-buckets per uid, streaks/badges per uid, stofzuigrotatie als ring over de
  actieve kinderen (`advanceCombo` werkt met 1/2/3+ deelnemers), en admin/badges
  volledig uid-gebaseerd. `KID_NAMES` en alle hardcoded lies/lenn zijn weg uit de
  app-logica.
- **Kind-login:** knop "🧒 Inloggen als kind" → eenvoudig formulier (grote velden,
  `inputmode="numeric"` voor de pin) → `signInWithEmailAndPassword` op het
  synthetische adres; zelfde `userIndex`-resolutie als de ouder-login.
- **Afgeschermde kindweergave:** enkel de eigen kaart (en dus ook enkel de eigen
  voltooiingsvlag — de streaks-rule weigert sibling-writes), geen Gezin/Beheer-knoppen
  én routes programmatiek dicht (`openAdmin`/`openMembers`-guards + render-guard),
  🏆 toont alleen de eigen badges, een bevroren eenmalige taak uitvinken geeft een
  nette "vraag een ouder"-uitleg (rules: definitie herstellen is ouder-only), en de
  stofzuigrij is voor een kind read-only met uitleg (het afvinken schrijft de
  ouder-only paden `settings/vacuum` + `days/{key}/vac`; kan het kind zelf zodra
  fase 6 het shifts-model invoert). Een gepauzeerd kind (`actief:false`) krijgt een
  vriendelijk pauze-scherm met uitlog-knop.
- **Testles (fake-realisme):** de fake-DB notificeerde synchroon binnen een write,
  waardoor re-entrante renders met achterlopende caches een oneindige
  completion-flag-lus gaven die met de echte (altijd asynchrone) SDK niet kan
  bestaan. De fakes notificeren nu async + gecoalesced. Alle suites (fase 1–5)
  groen; `test-fase5.js` dekt: kind-login, alleen-eigen-kaart, geblokkeerde routes,
  geneste checks + eigen streak-vlag (en niets voor anderen), bevroren one-off niet
  uitvinkbaar door kind, badges-filter, pauze-scherm.

### Fase 6 — Roterende taken dynamisch + optioneel; hardcoded lies/lenn eruit
> **Modeladvies: Opus, niveau high.** Algoritmisch het lastigste stuk dat nog rest —
> rotatie-wiskunde (anker/pointer, §2.3) en het veralgemenen van stofzuigen naar
> `settings/shifts` mét behoud van ál het fijn-afgestelde gedrag (projectie, ⏮/📥/⏭,
> doorschuiven). Doe na de bouw een aparte reviewronde, ook Opus/high: rotatie met
> 1/2/3 kinderen, en of een kind zijn beurt nu echt mag afvinken volgens de rules.
> (§2.1 kid-sleutel-op-uid, §2.2 dag-status-per-uid en de dynamische kind-kaarten zijn al
> in fase 5 gedaan — zie het fase-5-statusblok. Wat híer nog rest is dus kleiner dan de
> oorspronkelijke tekst hieronder suggereert: vooral het `rotation`-model op taken en
> `settings/shifts` voor stofzuigen.)

**Doel:** §4b volledig; nul verwijzingen naar `lies`/`lenn` of "exact twee kinderen".
- Vervang de vaste kids-array (856-857, 1313-1314) door de leden-lijst uit `members`
  (rol `kind`, `actief`). CSS: genereer kid-kleuren uit `members/{uid}/kleur` i.p.v. de
  vaste `--lies`/`--lenn`-vars.
- Implementeer het rotatiemodel uit §2.3 (`rotation` op het taakrecord). `getRoles` (430)
  wordt een generieke `taskAssignee(task, dayIdx)`; A/B-buckets verdwijnen als concept —
  taken staan gewoon in `settings/tasks/{taskId}` met optionele `rotation`.
- Admin: per taak kunnen kiezen vast/roterend, deelnemers (subset, volgorde), interval;
  huidige stand toonbaar + ⏮/⏭ bijstelbaar (hergebruik het patroon van
  `advanceVacuumTurn`/`rewindVacuumTurn`, 1555-1565).
- **Beurt-taken (§2.4):** veralgemeen het stofzuig-mechaniek naar `settings/shifts/{shiftId}`.
  De v15-functies (`getVacuum` 448, `effectiveNext` 515, `advanceCombo` 525,
  `pendingVacuumDay` 490, `vacuumForDay` 539, `pull/prepone/postponeVacuum` 1062-1092,
  `advance/rewindVacuumTurn` 1555-1565) worden geparametriseerd per `shiftId`; `kid`→`uid`,
  `floor`→`line`. `advanceCombo`-flip (529) wordt "volgende `memberIdx` in de ring" i.p.v.
  binair, zodat 1/2/3+ deelnemers allemaal werken. Admin: beurt-taak aanmaken met naam,
  weekdagen, lijnen (bijplaatsbaar) en deelnemers.
- Werk `simulateStreak`/`kidScheduledCount`/`writeCompletionFlag`/`kidBadgeList` bij naar
  uid-sleutels (inhoud ongewijzigd). Let op: `kidScheduledCount` (634) telt beurt-taken
  bewust NIET mee (doorgeschoven beurt mag oude reeks niet breken) — behouden.
- **Test:** gewone rotatie met 1, 2, 3 deelnemers (2 = identiek aan oud A/B-gedrag);
  beurt-taak met 2 lijnen + 2 kinderen = identiek aan oud stofzuiggedrag; streak/badge
  blijft werken.
- **Commit:** `Fase 6: dynamische, optionele roterende taken; lies/lenn hardcoding verwijderd`.

**Fase 6 opgesplitst in 6a (beurt-taken) + 6b (rotatiemodel).**

**Fase 6a — beurt-taken (§2.4): ✅ gebouwd & getest.** Stofzuigen is niet meer
hardgecodeerd; het is één van mogelijk meerdere beurt-taken onder
`settings/shifts/{shiftId}: { name, weekdays[], lines[], members[]?, next?, override?,
lastDone?, order? }`, met bevroren historiek in `days/{key}/shift/{shiftId}: {uid,line}`
en per-kind afvinken in `days/{key}/checks/{uid}/shift-{shiftId}`. Alle stofzuigfuncties
zijn geparametriseerd per shift (`shiftPendingDay`/`shiftEffectiveNext`/`shiftAdvance`/
`shiftForDay`/`shiftsForKid` + `toggleShift`/`shiftPull`/`shiftPrepone`/`shiftPostpone`).
De pointer bewaart de **uid** (niet een `memberIdx`) — robuuster dan het plan-voorstel
als de ledenlijst wijzigt; `lines` vervangt `floors`. Lege `members` = alle actieve
kinderen; de ring filtert steeds op nog-actieve kind-leden. **Belangrijkste ontgrendeling:
een kind mag nu zijn eigen beurt afvinken** (de rules laten `checks/{uid}`,
`days/{key}/shift` en `settings/shifts/{id}/next|override|lastDone` door leden schrijven);
de verplaats-knoppen (⏮/📥/⏭) blijven ouder-only. Admin: `renderAdminShifts` met per
beurt-taak naam/weekdagen/lijnen(CRUD)/deelnemers(aan-uit)/volgende beurt (⏮/⏭), plus
beurt-taak aanmaken/verwijderen.

> **Bewuste afwijking van de plan-tekst (met akkoord "schone herbouw"):** de legacy-
> kalenderformule (`getVacuum`, de `'legacy'`-rendermode) is **uit het live render-pad**
> gehaald. Op klusjesv2 is elke shift vers met een geldige start, dus die tak vuurde hier
> nooit; ze wordt niet meer meegesleept in het shift-render-pad. De fase-8-migratie
> berekent zelf de begin-pointer uit de oude `settings/vacuum`-data (los van dit pad).
> Dit schrapt een hele klasse randgevallen uit deze refactor.

**Tests (`test-fase6a.js`):** beurt-taak verschijnt op de openstaande dag bij het juiste
kind; **een ingelogd kind vinkt zijn eigen beurt af** (historiek bevroren, kind-vinkje +
pointer-doorschuiven geschreven — de kernontgrendeling); de rotatie schuift door naar het
andere kind + volgende lijn; admin maakt en verwijdert een beurt-taak. Fase 1–5 blijven
groen (fase 5 kreeg één datum-robuustheidsfix: eenmalige taak nu in de vaste kind-sectie
i.p.v. "Rol B", zodat de dagindex-pariteit de test niet meer beïnvloedt).

**Fase 6b — rotatiemodel (§2.3): ✅ gebouwd & getest.** De A/B-buckets zijn als concept
verdwenen. Taken staan nu **plat** onder `settings/tasks/{taskId}: { label, recurring,
order, weekdays?, members?, interval?, anchorIdx?, pointer? }`. De rolverdeling draait niet
meer op `roleFor(positie, dagindex)` maar op een per-taak **ring + pointer**:
- `taskRing(t)` = de deelnemersvolgorde. `members` leeg/afwezig = alle actieve kinderen;
  anders exact de opgegeven subset (gefilterd op nog-actieve kind-leden). **Eén deelnemer =
  vaste taak** (`isFixedTask`, toont het 👤-merkje — vervangt de oude kid-vaste buckets).
- `taskAssignee(t, dayIdx)` = `ring[((pointer + steps) % n + n) % n]`, met
  `steps = interval==='weekly' ? floor((dayIdx-anchorIdx)/7) : (dayIdx-anchorIdx)`. Dagelijks
  (default) + wekelijks interval; `anchorIdx`/`pointer` verschuifbaar. **Voor 2 kinderen met
  pointer 0 vs 1 is dit exact het oude A/B-gedrag** (getest: taak wisselt dagelijks van kind);
  3+ kinderen roteren nu netjes rond i.p.v. dat er twee "rol A" delen.
- `tasksForKidDay(uid, idx, dow)` vervangt de oude rol-lookup in de renderloop en in
  `kidScheduledCount`. `toggleTask(uid, taskId)` schrijft naar het platte pad; de one-off
  freeze/restore bewaart nu de hele rotatie (`copyRotation`: weekdays/members/interval/
  anchorIdx/pointer) in de snap en zet ze bij uitvinken terug.
- **Admin:** één "Taken"-sectie (`renderAdminTasks`) i.p.v. vier bucket-secties. Per taak:
  deelnemer-chips aan/uit (`toggleTaskMember`), interval-toggle (`toggleTaskInterval`),
  pointer ⏮/⏭ (`advanceTaskPointer`/`rewindTaskPointer`), label bewerken, terugkerend/
  eenmalig, verwijderen. Alle handlers nemen nu `(taskId)` i.p.v. `(bucket, taskId)`.
- **Backward-compat migratie:** een bestaande database met oude A/B/uid-buckets wordt bij
  het laden herkend (`looksLikeBuckets`) en in het geheugen omgezet (`migrateTaskBuckets`:
  A→pointer 0, B→pointer 1, uid-bucket→`members:[uid]`), en **één keer** platgeschreven
  door de eerste ingelogde ouder (`maybeMigrateTasks`, getriggerd door zowel de taken- als
  de leden-listener — wie als tweede laadt vuurt de write). Geen aparte migratiestap nodig.

**Tests (`test-fase6b.js`):** (1) een taak wisselt dagelijks tussen de twee kinderen
(reproduceert A/B); (2) een taak vastzetten op één kind via deelnemerkeuze blijft elke dag
bij dat kind; (3) oude A/B/uid-bucketdata wordt correct gemigreerd (A→p0, B→p1, kind→vast)
en rendert nog. Fase 1–5 + 6a blijven groen (test-fase5 aangepast: de "Taken"-sectie
i.p.v. de verdwenen "Vaste taken"-sectie).

### Fase 7 — Beheerwachtwoord verwijderen, beheer via ouder-rol
> **Modeladvies: Sonnet (of Fable), niveau medium.** Grotendeels verwijderen +
> toegang aan `isChild()`/ouder-rol hangen — mechanisch en laag risico, geen
> aparte reviewronde nodig; de gewone testsuite volstaat.

**Doel:** geen client-side wachtwoord meer.
- Verwijder `ADMIN_PASSWORD` (164), `adminUnlocked` (402), `showPasswordPrompt`/
  `submitPassword`/`closePasswordPrompt` (1382-1425) en de bijhorende CSS/`window`-exports.
- `openAdmin` (1375): toegang ⇔ ingelogde rol `ouder` (kinderen zien de knop niet).
- **Test:** ouder ziet beheer zonder prompt; kind kan er niet bij.
- **Commit:** `Fase 7: hardcoded beheerwachtwoord verwijderd; beheer via ouder-rol`.

**Status: ✅ gebouwd & getest.** Het client-side beheerwachtwoord is helemaal weg:
`ADMIN_PASSWORD`, `adminUnlocked`, `pwTarget`, `showPasswordPrompt`/`submitPassword`/
`closePasswordPrompt`, de `.pw-*` CSS en de `window`-exports zijn geschrapt (en de
`adminUnlocked`-reset uit `teardownFamily`). `openAdmin`/`openMembers` gaten nu op een
**positieve rolcheck** `isParent()` (nieuw naast `isChild()` — `rol === 'ouder'`): alleen
een ingelogde ouder komt binnen, een kind wordt geweigerd zowel via de verborgen knoppen
als programmatiek. Geen wachtwoordvenster meer — de ouder landt meteen op Beheer/Gezin.
Dit was een UI-drempel, geen echte beveiliging (de Firebase-rules doen het echte werk
sinds fase 3); vervangen door de rol is netter én sluit aan op het multi-gezin-model.

**Tests (`test-fase7.js`):** ouder opent Beheer én Gezin zonder dat er ooit een
`#pwmodal` verschijnt; een ingelogd kind ziet de knoppen niet en `window.openAdmin()`/
`openMembers()` doen niets. Fase 1–6b bleven groen (hun tests lieten de nu verdwenen
wachtwoordstap vallen).

### Fase 8 — Migratiehulp voor de oude JSON-export (incl. rotatiestand)
> **Modeladvies: Opus, niveau high.** Eénmalig en onomkeerbaar — het meest
> foutgevoelige werk van heel het plan (uid-hersleuteling, rotatiestand exact
> behouden, streaks/badges/historiek intact). Doe na de bouw een aparte
> reviewronde, ook Opus/high, en verifieer op een testgezin (of `?test`-sandbox)
> vóórdat dit ooit op echte data draait.

**Doel:** oude `klusjes-9b7b8`-export omzetten naar de nieuwe structuur, historiek intact.
- Verborgen ouder-only scherm: plak/upload de geëxporteerde JSON.
- **Kid-koppeling:** UI om oude `lies`/`lenn` te mappen op de in fase 4 aangemaakte
  kind-uids.
- **Omzetting:**
  - `days/*`: hersleutel `{kid}-{taskId}` → `checks/{uid}/{taskId}` (§2.2), incl. `snap/*`
    → `snap/{uid}/{taskId}` en `vac:{kid,floor}` → `shift/{stofzuigShiftId}:{uid,line}`.
  - `settings/tasks`: A-bucket-taken → roterende taak `members:[liesUid, lennUid]`;
    B-bucket-taken → `members:[lennUid, liesUid]` (omgekeerde fase); `lies`/`lenn`-buckets
    → vaste taken van dat kind. Interval `daily`.
  - **Rotatiestand behouden (hard eis):** zet `anchorIdx`/`pointer` zó dat de toewijzing
    vandaag exact `getRoles(todayIdx)` reproduceert (A→Lies op even dag, enz.). Rotatie
    mag NIET terugspringen naar het begin.
  - **Stofzuigen → eerste beurt-taak:** maak één `settings/shifts/{id}` "Stofzuigen" uit
    het oude `settings/vacuum`: `weekdays`→`weekdays`, `floors`→`lines`, deelnemers
    `[liesUid, lennUid]`. Neem `next/override/lastDone` letterlijk over met `kid`→`memberIdx`
    (uid-positie in `members`) en `floorIdx`→`lineIdx`. Zo blijft exact dezelfde persoon +
    lijn aan de beurt.
  - `streaks/{lies|lenn}` → `streaks/{uid}` (days + `b{n}`-badges ongewijzigd);
    `settings/streakStart` overnemen.
- **Test:** na migratie is dezelfde persoon aan de beurt voor zowel rol als stofzuigen;
  streaks/badges/historiek van Lies & Lenn staan er nog.
- **Commit:** `Fase 8: migratiehulp voor oude JSON-export met behoud van rotatiestand`.

### Fase 9 — Versie naar v16 + opkuis
> **Modeladvies: Sonnet (of Fable), niveau low–medium.** Versiestring, dode code,
> laatste manuele acceptatie — triviaal, geen reviewronde nodig.

- `VERSION` (178) → `'klusjes-pwa v16'`. NL-accountmodel-comment bovenaan (§3). Dode
  code/`?test`-beslissing (§2.6) opruimen. Laatste manuele acceptatie.
- **Commit:** `Fase 9: versie v16 + opkuis`.

---

## 5. Security-rules — de lastige gevallen om expliciet te dekken (fase 3)

De opdracht vraagt in fase 3 een tweede-model-review op vier punten; deze gotcha's zijn
precies waar rules meestal lekken:

1. **Nieuw gezin aanmaken (bootstrap):** de aanmaker is nog géén member als hij
   `members/{uid}` schrijft. De rule voor `families/{fid}` moet een first-write toestaan
   waarbij de schrijver zichzelf als eerste ouder-member zet (bv. `!data.exists() &&
   newData.child('members/'+auth.uid+'/rol').val()==='ouder'`).
2. **Mede-ouder self-insert:** een aansluitende ouder is nog geen member maar moet
   `members/{auth.uid}` mogen schrijven mits een geldige gezinscode. Rule moet self-insert
   toestaan (`$uid === auth.uid`) en tegelijk verhinderen dat je een ander gezin binnenwipt
   zonder code.
3. **`/userIndex/{uid}` alleen door de uid zelf** — botst met "ouder maakt kind aan". Opgelost
   doordat de **secundaire app (ingelogd als kind)** zijn eigen `userIndex` schrijft, niet de
   ouder (zie fase 4). Rules moeten dus `userIndex/{uid}` op `$uid===auth.uid` houden — geen
   uitzondering voor ouders nodig.
4. **`/familyCodes` alleen gerichte lookup:** leesbaar op `/familyCodes/{code}` maar niet als
   volledige lijst opsombaar; schrijven enkel als je het gezin aanmaakt/bezit.
5. **Kind schrijft alleen eigen vinkjes/streaks:** vergt de per-uid-neststructuur (§2.2 A),
   anders niet strak afdwingbaar.

Lever de rules met NL-commentaar per blok zodat het tweede model gericht kan controleren.

### 5.1 Status: rules geschreven → `firebase-rules-v16.json` — ✅ geplaatst & getest
De gecorrigeerde rules staan al in `firebase-rules-v16.json` (met NL-commentaar per blok).
**Op `klusjesv2` geplaatst en geverifieerd via de Rules Playground:** de vier kern-testjes
(niet-lid kan niet lezen · kind schrijft enkel eigen vinkje · self-insert gegate op code ·
nieuw gezin aanmaken lukt) gaven allemaal het verwachte resultaat. De twee optionele
eenmalige-taak-testjes zijn (nog) niet gedraaid — niet kritisch.
Alle vijf de gotcha's hierboven zijn erin verwerkt; de vier oorspronkelijke gaten (read via
zelf-schrijfbare userIndex, ongegate self-insert als ouder, meta-bootstrap, kind dat eigen
eenmalige-taak/beurt afvinkt) zijn gedicht. Twee gevolgen voor de app-bouw (hierboven al bij
fase 2 en fase 5 genoteerd): **(1)** defaults zaaien bij het aanmaken van het gezin, niet lui;
**(2)** eenmalige taak úítvinken is ouder-only.

### 5.2 Rules testen in de Firebase Rules Playground
De Console → Realtime Database → tab **Regels** heeft een **Playground** (simulator). Die
draait tegen de **echte data** in de DB, dus zet er eerst even een klein testgezin in via de
tab **Data** (het Console-data-scherm negeert de rules — admin — dus dit lukt altijd; achteraf
weer verwijderen). Uid's mogen verzonnen strings zijn; in de Playground vul je bij "Auth" een
custom uid in die overeenkomt met het testgezin.

**Testdata om (tijdelijk) te plakken onder de root:**
```json
{
  "userIndex": { "papa1": "fam1", "kind1": "fam1" },
  "familyCodes": { "ABC123": "fam1" },
  "families": { "fam1": {
    "meta": { "naam": "Testgezin", "gezinscode": "ABC123", "aangemaakt": "2026-7-10" },
    "members": {
      "papa1": { "rol": "ouder", "weergavenaam": "Papa" },
      "kind1": { "rol": "kind", "weergavenaam": "Lies", "gebruikersnaam": "lies" }
    },
    "settings": {
      "tasks": {
        "t1": { "label": "Afwas", "recurring": true, "order": 0 },
        "t2": { "label": "Eenmalig", "recurring": false, "order": 1 }
      }
    }
  }}
}
```

**De vier testjes** (type · locatie · ingelogd-uid · [data] → verwacht):

| # | Bewijst | Type | Locatie | Uid | Data | Verwacht |
|---|---|---|---|---|---|---|
| 1 | niet-lid kan gezin niet lezen | Lezen | `/families/fam1` | `vreemde9` | — | ❌ geweigerd |
| 2a | kind vinkt eigen taak af | Schrijven | `/families/fam1/days/2026-7-10/checks/kind1/t1` | `kind1` | `true` | ✅ toegestaan |
| 2b | kind kan geen ánder kind afvinken | Schrijven | `/families/fam1/days/2026-7-10/checks/papa1/t1` | `kind1` | `true` | ❌ geweigerd |
| 3a | vreemde wordt niet zomaar ouder | Schrijven | `/families/fam1/members/vreemde9` | `vreemde9` | `{"rol":"ouder"}` | ❌ geweigerd |
| 3b | mede-ouder mét juiste code lukt | Schrijven | `/families/fam1/members/nieuw2` | `nieuw2` | `{"rol":"ouder","viaCode":"ABC123"}` | ✅ toegestaan |
| 4 | nieuw gezin aanmaken lukt | Schrijven | `/families/fam2/members/baas1` | `baas1` | `{"rol":"ouder"}` | ✅ toegestaan |

Extra optioneel: kind vinkt eenmalige taak af = verwijderen van `/families/fam1/settings/tasks/t2`
(type Verwijderen, uid `kind1`) → ✅; hetzelfde met de terugkerende `t1` → ❌. Ruim daarna de
testdata weer op.

### 5.3 Tweede rules-review (na fase 3, sterk model) — ✅ geen blokkers

Volledige review van `firebase-rules-v16.json` tegen de fase-3-implementatie (élke
`dbRef`/`baseRef`-schrijf en -lees van de app geïnventariseerd en getoetst), op de vier
gevraagde punten:

1. **Kan een kind schrijven waar het niet mag? Nee.** Zichzelf promoveren kan niet
   (self-insert vereist `!members/{uid}.exists()` — een kind ís al lid); andermans
   member-record, `meta`, `settings` (behalve de bedoelde eenmalige-taak-delete en de
   shift-rotatiestand), andermans `checks`/`snap`/`streaks`: allemaal ouder-only of
   eigen-uid-only. De platte dag-sleutels (`days/{key}/{kid}-{taskId}`) vallen onder de
   dag-node (ouder-only) — een kind kan die niet schrijven, wat nu net de fase-5-
   randvoorwaarde bevestigt (zie bevinding B hieronder).
2. **Kan een niet-lid gezinsdata lezen? Nee.** De enige `.read` binnen `families` staat
   op `$familyId` en eist echte membership via `root`; `families` zelf en `familyCodes`
   zijn niet opsombaar (geen `.read` op de lijstnodes); `userIndex` is strikt self-only.
   Ook cross-gezin (lid van A leest B) is dicht.
3. **Kan `/familyCodes` of `/userIndex` misbruikt worden? Geen toegang te winnen.**
   Een nep-code-entry laten wijzen naar andermans gezin kan alleen als je diens
   familyId al kent (niet leesbaar; push-keys onvoorspelbaar), en zelfs dan faalt de
   join erop dat `viaCode` tegen de échte `meta/gezinscode` wordt gecheckt, niet tegen
   de code-entry. Je eigen `userIndex` vervalsen geeft geen leesrecht (read hangt aan
   membership) — de app toont dan enkel zelf "Geen verbinding". Restpunten: zie C/D.
4. **Werkt gezin aanmaken correct? Ja, dankzij de split-create uit fase 3.** Bij een
   multi-path update is `root` de staat vóór de héle update, dus bootstrap (meta:
   `!data.exists()`; members: eerste-lid-self-insert; familyCodes: `!data.exists()`;
   userIndex: self) slaagt, en de settings-schrijf erná slaagt omdat de aanmaker dan
   een vastgelegd ouder-lid is. Eén atomische create mét settings zou falen — precies
   het gat dat fase 3 vond en fixte. Join idem: diepere `$memberUid`-allow overstemt de
   node-level ouder-only regel (RTDB-allow-cascade), gegate op de juiste code.

**Bevindingen (geen blokkers, wel bewust te dragen):**
- **A (info).** Elke ingelogde gebruiker kan op een nog niet bestaand familyId een
  meta+members bootstrappen — dat ís "gezin aanmaken" en is onschadelijk: bestaande
  gezinnen zijn niet kaapbaar (meta bestaat → ouder-only; members bestaat → code-gate)
  en andermans toekomstige push-key raden is onhaalbaar (~120 bits).
- **B (randvoorwaarde fase 5, verscherpt).** Vóór kinderen zelf afvinken moet niet
  alleen de dag-status per uid genest worden (§2.2 → `checks/{uid}`), maar moet ook
  stofzuigen naar `settings/shifts` verhuisd zijn: het afvinken van een beurt schrijft
  `settings/vacuum/next|override|lastDone` en `days/{key}/vac`, en die paden zijn
  ouder-only (de member-uitzonderingen bestaan alleen op `shifts/...` en `days/.../shift`).
  Eérst fase 6-mechanieken (of dat deel naar voren halen), dán kind-login activeren.
- **C (laag).** `familyCodes`-entries zijn door niemand te verwijderen of te wijzigen
  (`!data.exists()`), ook niet door de eigenaar — squatting van losse codes kan (zonder
  effect, zie punt 3), opruimen kan later met een eigenaar-regel. Geen datalek.
- **D (laag, afweging).** Een 6-tekens code (32 tekens, ~1,07 mld combinaties) is via
  de REST-API in dagen te brute-forcen zonder rate limiting; de beloning is enkel
  "mogen aansluiten als ouder". Voor een gezinsapp acceptabel; App Check of langere
  codes zijn latere verbeteringen.
- **E (laag).** Er is nergens `.validate` — een kind kan bv. zijn eigen
  `streaks/{uid}/badges` vervalsen via directe writes, en records kunnen vormloos zijn.
  Inherent aan client-only zonder Cloud Functions; hooguit gamification-vals spelen
  binnen het eigen gezin.


---

## 6. Risico's & gotchas (checklist voor de bouw)

- **Elke nieuwe `onclick`-handler → toevoegen aan `Object.assign(window,{…})`** (1639),
  anders stil kapot (console-only). Bekendste v15-valkuil.
- **`escapeHtml()` om élke door de gebruiker ingevoerde tekst** (task-labels, weergavenamen,
  gezinsnaam) vóór `innerHTML`-interpolatie. Deze app heeft eerder een stored-XSS gehad.
- **Nieuw top-level pad = handmatige rule nodig** (`/familyCodes`, `/userIndex`, `/families`).
  Zonder rule → "Geen verbinding"/hang. Documenteer de manuele Console-stap.
- **Tweede app-instantie** correct afsluiten (`deleteApp`) om lekken/verwarde auth-state te
  vermijden.
- **`browserLocalPersistence` vóór elke sign-in zetten** (`await setPersistence`), anders
  valt de sessie terug op de default.
- **Pincode-reset** kan client-side niet zonder de oude pin (geen Admin-SDK in single-file) —
  bekende beperking, expliciet benoemen.
- **Migratie is eenmalig en onomkeerbaar** — laat de tool eerst een droog overzicht tonen
  (aantal dagen, taken, badges per kind) vóór de definitieve schrijf.
- **Listeners pas na `familyId`-resolutie starten** — nu draaien ze bij module-load (731+);
  verplaatsen naar `initFamily()`.
- **`START` (26 juni 2026) blijft het dag-index-anker** — niet verplaatsen; het draagt
  `dayIndex`, rotatie-parity en `simulateStreak`.

---

## 7. Wat NIET verandert (bewust behouden)
Live-sync via onValue-listeners; PWA-installatie (manifest/meta); streak-/joker-/
badge-logica en de 13 inline-SVG-medailles (`badgeSVG`, `BADGES`, `MOTIFS`); Web-Audio
chime/fanfare; celebration-popup; single-file-architectuur; volledig-NL UI; hosting op
GitHub Pages vanaf `main` (v16 gaat pas live bij merge — tot dan blijft `main` = v15).
