# Bouwplan v18 — Beurt-rotatie loopt altijd door + genadevenster + word-een-taak

> **Werkbestand over sessies heen.** Vink af wat af is en commit dit mee. Actuele
> werkafspraken: `CLAUDE.md`; wijzigingen per versie: `CHANGELOG.md`. **NOOIT op `main`**
> tot getest — alles op branch `claude/sharp-dijkstra-7x5ww6`.

## Doel (idee van de gebruiker)
1. **De beurt-rol loopt altijd door — niets blokkeert ze.** Mist iemand zijn beurt, dan krijgt
   de volgende persoon op de volgende geplande dag toch gewoon zijn beurt.
2. **Genadevenster van 2 dagen.** Een niet-afgevinkte beurt blijft nog **vandaag + 2 dagen**
   zichtbaar als openstaande beurt (verschuifbaar/afvinkbaar). Er wordt dus rekening gehouden
   met vandaag, gisteren én eergisteren.
3. **Daarna wordt het een gewone (verschuifbare) taak.** Blijft de beurt na het venster
   onafgewerkt, dan verandert ze in een losse **eenmalige beurt-taak** (blijft ⏮/⏭-verschuifbaar,
   `owedShiftRow`) die bij dat kind blijft staan en meetelt voor de dag/reeks.

## Gekozen aanpak (laagste risico, hergebruikt bestaande machinerie)
**Niet** de pointer vervangen door een volledige kalender-rotatie (dat zou een data-migratie
van de live beurt-taak vereisen). In plaats daarvan: **pointer-model behouden + automatisch
losmaken (auto-detach) na het genadevenster**, precies wat de ⏭-knop nu al manueel doet
(`shiftPostpone`: maak een `fromShift`-owed taak + schuif de pointer door). Zo draait de
rotatie door zodra de gemiste beurt is losgemaakt.

Betrouwbaarheid van "niets blokkeert de rotatie" wordt gegarandeerd door de auto-detach op
**twee plaatsen** te draaien (idempotent, dus dubbel draaien is veilig):
- **Client (render-pad):** meteen, wanneer een ouder (of een kind met `magVerschuiven` voor
  zijn eigen beurt) de app opent — zoals de voltooiingsvlag nu al op het render-pad schrijft.
- **Server (`scripts/notify.js`, elke 30 min, admin-rechten):** de garantie — ook als niemand
  de app opent, schuift de cron de rotatie door. Vereist dat het script bij **elke** run de
  beurt-onderhoud doet (los van het meld-uur).

Voordeel: geen data-modelwijziging, geen migratie van de bestaande stofzuig-beurt, en de
rotatie kan nooit permanent vastlopen.

## Concrete onderdelen

### 1. Genadevenster zichtbaar houden (read-path)
- `shiftPendingDay` (v17.3 klemt een gemiste beurt al naar vandaag) **begrenzen tot het
  venster**: enkel op vandaag tonen zolang de geplande dag ≤ 2 dagen geleden is. Ouder dan dat
  → niet meer als pointer-beurt tonen (dan hoort ze losgemaakt te zijn, zie 2).

### 2. Auto-detach na het venster (write, idempotent)
- Nieuwe functie `shiftAutoDetachIfLapsed(sh)`: als de openstaande beurt een geplande dag heeft
  die **> 2 dagen** voorbij is en niet afgevinkt → voer de detach uit (hergebruik de
  `shiftPostpone`-logica: `settings/tasks/{push}` = `{ label, recurring:false, members:[uid],
  onDay:<geplande dag>, fromShift:<id>, fromShiftDay:<geplande dagkey>, order }` + pointer
  `next = shiftAdvance(...,1)`, `override:null`).
- **Idempotentie:** nieuw veld `fromShiftDay` op de owed taak markeert de bron-dag. Vóór het
  aanmaken checken of er al een `fromShift`-taak met die `fromShiftDay` bestaat → zo niet
  dubbel (client + server, of twee renders). 
- **Client:** aanroepen vanuit `render()` (zoals de voltooiingsvlag), enkel wanneer de gebruiker
  het mag (ouder, of kind-met-vlag voor eigen beurt). Geen rules-wijziging nodig.
- **Server:** in `notify.js` bij elke run, met admin-rechten (dekt het geval dat niemand met
  rechten de app opent).

### 3. De losse taak
- Hergebruikt volledig `owedShiftRow` / `moveOwedShift` / `onDayEffIdx` (bestaat al sinds de
  ⏭-fix): verschuifbaar (⏮/⏭), zelf-herstellend naar vandaag, verborgen in Beheer, telt mee
  voor de dag (en dus de reeks op een dag met andere taken). `copyRotation` neemt `fromShiftDay`
  mee door freeze/restore.

### 4. `notify.js` in sync
- De aangepaste `shiftPendingDay` (venstergrens) mee overnemen.
- De auto-detach-onderhoudstap toevoegen (elke run, vóór/naast het sturen). De open-klusjes-
  berekening blijft verder gelijk; de losgemaakte taken verschijnen vanzelf als gewone taken.

### 5. Reeks
- De losgemaakte beurt is een gewone `recurring:false`-taak → telt mee in `kidScheduledCount`
  en de voltooiings-id-set. Op een dag met andere taken breekt een niet-gedane (losse) beurt de
  reeks. (De bekende nuance blijft: een dag met *enkel* een beurt en verder niets telt als vrije
  dag — het zelf-herstel naar vandaag verhindert een retroactieve breuk. Melden aan de gebruiker.)

### 6. Versie & docs
- `VERSION` → `klusjes-pwa v18`; `CHANGELOG` + `CLAUDE.md` (beurt-sectie herschrijven: rotatie
  blokkeert niet meer, genadevenster van 2 dagen, auto-detach client+server, `fromShiftDay`).
- v17.3 (blijf-op-vandaag zonder grens) wordt hierdoor **begrensd** tot het venster — bewust.

## Verificatie (nep-Firebase in Node, zoals de vorige rondes)
1. Gemiste beurt: dag 0–2 zichtbaar op vandaag als beurt; op dag 3 auto-detach → owed taak
   bestaat + pointer doorgeschoven naar de volgende persoon; de volgende geplande dag toont de
   **volgende persoon** (rotatie blokkeert niet). 
2. Idempotentie: auto-detach twee keer draaien maakt maar één owed taak (`fromShiftDay`-check).
3. Afvinken binnen het venster: geen detach, pointer schuift normaal door.
4. `app` == `notify.js` voor `shiftPendingDay`/open-klusjes (cross-check).
5. Reeks: losse beurt telt mee op een dag met andere taken.
6. `node --check` op beide scripts.

## Risico's
- **Write-on-render + server-write** samen: idempotentie via `fromShiftDay` is cruciaal.
- **Logica-duplicatie** (app ↔ `notify.js`) groeit — zelfde sync-discipline als bij de meldingen.
- Raakt een **live, werkende** feature: grondig testen vóór `main`.
- Reeks-nuance (beurt-only dag) blijft; expliciet met de gebruiker delen.

## Checklist
- [x] `shiftPendingDay` begrenzen tot het 2-dagen-venster (app + `notify.js`).
- [x] `shiftAutoDetachIfLapsed` + `fromShiftDay`-idempotentie (app render-pad).
- [x] Auto-detach-onderhoud in `notify.js` (elke run, admin — `runShiftMaintenance`).
- [x] `copyRotation` neemt `fromShiftDay` mee.
- [x] Verificatie-tests (1–6 hierboven) — 24/24 groen (`scratchpad/test-v18.js`), incl. app==notify.
- [x] `VERSION` v18 + `CHANGELOG` + `CLAUDE.md`.
- [x] Commit + push naar de branch (**niet** `main`); pas na test op toestel naar `main`.
