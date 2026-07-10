# Bouwplan Klusjes-PWA v16 — multi-gezin, Firebase Auth, flexibele rotatie

> **Status:** planfase afgerond. Nog géén code geschreven. Bouw gebeurt in latere
> sessie(s). Zeg "ga verder vanaf fase X" om te hervatten.
> **Branch:** `claude/chores-pwa-v16-plan-11kzki` — al het werk hier, `main` blijft live v15.
> **Nieuw Firebase-project:** `klusjesv2` (config staat in fase 1 hieronder).

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

### 2.2 Dag-status nesten per uid — **BESLISPUNT (aanbevolen: ja)**
v15 gebruikt platte samengestelde sleutels: `days/{key}/{kid}-{taskId}: bool`. RTDB-rules
kunnen zo'n samengestelde sleutel niet splitsen om "alleen eigen vinkjes" af te dwingen
(geen dynamische regex op `auth.uid` in `$key`). Twee opties:

- **A (aanbevolen):** herstructureer naar `days/{key}/checks/{uid}/{taskId}: bool`,
  `days/{key}/snap/{uid}/{taskId}: {…}`, `days/{key}/vac: {uid, floor}`. Dan is de rule
  triviaal: `days/{key}/checks/{uid}` schrijfbaar ⇔ `$uid === auth.uid` (kind) of ouder.
  Kost: aanpassing van `toggleTask` (1094), `render()` id-opbouw (872), `daySnapsFor` (615),
  `vacuumForDay` (539), `renderCard` (960). Migratie zet oude platte sleutels om.
- **B:** platte sleutels houden; rules dwingen dan enkel gezins-lidmaatschap +
  ouder-rol af, en een kind kan technisch een vinkje van een ander kind zetten
  (lage impact binnen één gezin, maar schendt de harde eis in de opdracht).

De opdracht eist expliciet rule-afgedwongen "eigen afvinkingen". → **Kies A.** Dit is de
grootste refactor in het plan; verrekend in fase 6/8.

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

> **BESLISPUNT (rotatie-doorschuiven):** schuift de A/B-achtige rotatie in v16 nog steeds
> *kalendergedreven* door (elke dag vanzelf, zoals nu), of *voltooiingsgedreven* (zoals de
> stofzuigbeurt)? De opdracht wil beide gevallen aankunnen. Aanbeveling: **kalendergedreven
> op basis van `interval`** (behoudt exact het huidige A/B-gedrag; simpelst te migreren),
> met dezelfde handmatige ⏮/⏭-override als bij stofzuigen voor uitzonderingen. Stofzuigen
> zelf blijft zijn eigen voltooiingsgedreven pointer houden (of wordt één speciale
> roterende taak — zie §2.4).

### 2.4 Stofzuigen: apart concept houden of opgaan in roterende taken? — **BESLISPUNT**
v15 behandelt stofzuigen als een derde, apart concept (eigen pointer, verdiepingen,
projectie, ⏮/📥/⏭, bevroren `vac`-snapshot). Twee opties voor v16:
- **A (aanbevolen, minste risico):** stofzuigen blijft z'n eigen mechaniek, alleen
  `lies`/`lenn` → uids + familie-prefix. Roterende gewone taken zijn een nieuw, tweede
  systeem ernaast. Minder elegant, maar de fijn-afgestelde stofzuig-edge-cases
  (projectie, clamp-naar-vandaag, override-herstel bij uitvinken) blijven intact.
- **B:** stofzuigen wordt "gewoon" een roterende taak met verdiepingen als extra veld.
  Eleganter maar groot risico dat de subtiele stofzuig-gedragingen sneuvelen.
→ Aanbeveling **A** voor v16; B eventueel later.

### 2.5 `?test`-sandbox
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
  │     ├── tasks/{bucketOfTaskId}/…   { label, recurring, order, weekdays?, rotation? }
  │     ├── vacuum/                     { weekdays[], floors?[], next?, override?, lastDone? }
  │     └── streakStart                 'yyyy-M-d'
  ├── days/{yyyy-M-d}/
  │     ├── checks/{uid}/{taskId}: bool        (§2.2 optie A)
  │     ├── snap/{uid}/{taskId}: {…}
  │     └── vac: { uid, floor }
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

### Fase 2 — Registratie: nieuw gezin aanmaken + gezinscode
**Doel:** een ouder kan een gezin oprichten en krijgt een unieke 6-teken code.
- Startscherm-knop "Nieuw gezin aanmaken": `createUserWithEmailAndPassword` →
  gezinsnaam-prompt → genereer `familyId` (`push`-key) + 6-teken code (hoofdletters+cijfers,
  botsingscontrole tegen `/familyCodes`).
- Atomische schrijf (één `update(ref(db), {…})`): `families/{fid}/meta`,
  `families/{fid}/members/{uid}={rol:'ouder',…}`, `familyCodes/{code}=fid`,
  `userIndex/{uid}=fid`.
- Knop "Bij bestaand gezin aansluiten als ouder": registreren + code invoeren → lees
  `familyCodes/{code}` → schrijf eigen `members/{uid}` + `userIndex/{uid}`.
  ⚠️ Dit raakt security-rules (self-insert als member) — zie §5-gotcha; rules komen in fase 3.
- **Test:** nieuw gezin → code verschijnt; tweede ouder sluit aan met die code.
- **Commit:** `Fase 2: nieuw gezin aanmaken + mede-ouder aansluiten via gezinscode`.

### Fase 3 — Datastructuur + userIndex + security rules (EERSTE versie) → **STOP**
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

### Fase 4 — Scherm "Gezinsleden beheren" + kind-accounts (tweede app-instantie!)
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

### Fase 5 — Kind-login (naam + pincode) + afgeschermde kindweergave
**Doel:** kind logt kindvriendelijk in en ziet enkel eigen klusjes/streaks/badges.
- Startscherm-knop "Inloggen als kind": grote knoppen, `inputmode="numeric"` voor de pin.
  Zet naam om naar `{naam}@kids.klusjesv2.app`, `signInWithEmailAndPassword`.
- Na login: rol uit `members/{uid}`. Kind → alleen eigen kaart; **beheerknoppen verbergen
  ÉN routes blokkeren** (geen `screen==='admin'`/`'members'` voor kinderen). Harde
  afdwinging zit al in de rules (fase 3).
- Discrete uitlog-optie voor het kind.
- **Test:** kind-login toont enkel eigen data; beheerroutes onbereikbaar.
- **Commit:** `Fase 5: kind-login met pincode + afgeschermde kindweergave`.

### Fase 6 — Roterende taken dynamisch + optioneel; hardcoded lies/lenn eruit
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
- Stofzuigen: `lies`/`lenn` → uids in `getVacuum`/`advanceCombo`/`effectiveNext`/
  `vacuumForDay` (§2.4 optie A: mechaniek behouden, alleen sleutels dynamisch). `advanceCombo`
  flip (529) wordt "volgende uid in de deelnemers-ring" i.p.v. binair.
- Werk `simulateStreak`/`kidScheduledCount`/`writeCompletionFlag`/`kidBadgeList` bij naar
  uid-sleutels (inhoud ongewijzigd).
- **Test:** rotatie met 1, 2, 3 deelnemers; 2 deelnemers = identiek aan oud A/B-gedrag;
  streak/badge blijft werken.
- **Commit:** `Fase 6: dynamische, optionele roterende taken; lies/lenn hardcoding verwijderd`.

### Fase 7 — Beheerwachtwoord verwijderen, beheer via ouder-rol
**Doel:** geen client-side wachtwoord meer.
- Verwijder `ADMIN_PASSWORD` (164), `adminUnlocked` (402), `showPasswordPrompt`/
  `submitPassword`/`closePasswordPrompt` (1382-1425) en de bijhorende CSS/`window`-exports.
- `openAdmin` (1375): toegang ⇔ ingelogde rol `ouder` (kinderen zien de knop niet).
- **Test:** ouder ziet beheer zonder prompt; kind kan er niet bij.
- **Commit:** `Fase 7: hardcoded beheerwachtwoord verwijderd; beheer via ouder-rol`.

### Fase 8 — Migratiehulp voor de oude JSON-export (incl. rotatiestand)
**Doel:** oude `klusjes-9b7b8`-export omzetten naar de nieuwe structuur, historiek intact.
- Verborgen ouder-only scherm: plak/upload de geëxporteerde JSON.
- **Kid-koppeling:** UI om oude `lies`/`lenn` te mappen op de in fase 4 aangemaakte
  kind-uids.
- **Omzetting:**
  - `days/*`: hersleutel `{kid}-{taskId}` → nieuwe structuur (§2.2 A: `checks/{uid}/{taskId}`),
    incl. `snap/*` en `vac.{kid}` → `vac.uid`.
  - `settings/tasks`: A-bucket-taken → roterende taak `members:[liesUid, lennUid]`;
    B-bucket-taken → `members:[lennUid, liesUid]` (omgekeerde fase); `lies`/`lenn`-buckets
    → vaste taken van dat kind. Interval `daily`.
  - **Rotatiestand behouden (hard eis):** zet `anchorIdx`/`pointer` zó dat de toewijzing
    vandaag exact `getRoles(todayIdx)` reproduceert (A→Lies op even dag, enz.). Rotatie
    mag NIET terugspringen naar het begin.
  - **Stofzuig-pointer behouden:** neem `settings/vacuum/next/override/lastDone` letterlijk
    over met `kid`→`uid` hersleuteld. Zo blijft dezelfde persoon aan de beurt.
  - `streaks/{lies|lenn}` → `streaks/{uid}` (days + `b{n}`-badges ongewijzigd);
    `settings/streakStart` overnemen.
- **Test:** na migratie is dezelfde persoon aan de beurt voor zowel rol als stofzuigen;
  streaks/badges/historiek van Lies & Lenn staan er nog.
- **Commit:** `Fase 8: migratiehulp voor oude JSON-export met behoud van rotatiestand`.

### Fase 9 — Versie naar v16 + opkuis
- `VERSION` (178) → `'klusjes-pwa v16'`. NL-accountmodel-comment bovenaan (§3). Dode
  code/`?test`-beslissing (§2.5) opruimen. Laatste manuele acceptatie.
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
