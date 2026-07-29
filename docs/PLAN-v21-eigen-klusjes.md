# PLAN v21 — 📝 Eigen klusjes (kind-eigen, zonder gevolgen)

*Bouwlog. Afgerond en uitgebracht als `klusjes-pwa v21`. Dit bestand legt vast **waarom** de
keuzes zo gemaakt zijn; `CLAUDE.md` is de werkende samenvatting.*

## De vraag

> "Ik zou graag de kinderen de mogelijkheid willen geven om zelf klusjes toe te voegen voor
> hun eigen die niet meetellen voor de streaks noch de diamanten. Als ze zelf dingen willen
> bijhouden voor hun zelf dat het kan zonder gevolgen voor hun streak."

Tot v20 kon een kind enkel afvinken wat een ouder in Beheer had ingesteld. De vraag is een
persoonlijk lijstje: zichtbaar op de eigen kaart, afvinkbaar, en **volledig gevolgloos** voor
de voltooiing van de dag, de reeks 🔥, de badges 🏆 en de diamanten 💎.

## Fase 1 — waar bewaren we ze?

Drie opties afgewogen:

1. **In `settings/tasks` met een `eigen`-vlag.** Maximaal hergebruik (weekdagen, eenmalig
   bevriezen/herstellen, `taskRow`), maar: `settings` is node-breed ouder-only
   (`firebase-rules-v16.json`), dus dit vraagt een **derde** kind-uitzondering in de rules
   bovenop de twee die er al staan — en dus een herplak-stap in de Console. Erger: zo'n taak
   zit dan wél in `taskList()`, en dus in `tasksForKidDay`, `kidScheduledCount`,
   `simulateStreak` en `scripts/notify.js`. Elk van die plekken zou een filter nodig hebben,
   en één vergeten filter betekent een gebroken reeks. Afgewezen.
2. **Een nieuw top-level pad** (`eigenTaken/{uid}/…`). Vraagt een nieuwe Console-regel plus
   de `/test`-spiegel; een ontbrekende regel geeft "Geen verbinding". Afgewezen.
3. **✅ Onder `streaks/{uid}/eigenTaken/{id}`.** De rule `streaks/$childId` is al
   ouder-of-zelf-schrijfbaar en **cascadeert** naar nieuwe subsleutels — exact hetzelfde
   argument waarmee v19.7 (kinderen kopen zelf) zonder rules-wijziging kon. De
   streaks-listener laadt die tak al in zijn geheel, is **zonder laad-gate en niet-fataal**,
   en dekt de **hele historiek**. Geen rules-wijziging, geen nieuwe listener, geen extra
   leesverkeer.

De naam `streaks` dekt de inhoud niet perfect — maar `diamonds` en `purchases` wonen daar al
om precies dezelfde reden. Consistentie won van etymologie.

**Het echte voordeel is negatief geformuleerd:** omdat een eigen klusje nooit in `taskList()`
zit, is het overal uitgesloten *door structuur* in plaats van door filters. `kidScheduledCount`,
`simulateStreak`, `writeCompletionFlag`, de voortgangsbalk, `showCelebration`,
`renderAdminTasks`, `firebase-rules-v16.json` en `scripts/notify.js` bleven **letterlijk
ongewijzigd**. Dat is de hele reden voor deze plaatsing.

## Fase 2 — de vorm van een record

```
streaks/{uid}/eigenTaken/{id}: { label, order, onDay?, gedaanOp? }
```

- **`onDay` afwezig = elke dag**, aanwezig = gepind op één dag. Schema-additief, en dezelfde
  betekenis als bij een gewone taak.
- **`gedaanOp: { dayKey: true }` zit op de definitie, niet in `days/{key}/checks`.** Dat was
  de enige niet-vanzelfsprekende keuze. De dag-listener houdt maar **één** dag vast, terwijl
  deze cache de hele historiek bevat — en dat is precies wat het meeschuiven hieronder
  mogelijk maakt zonder een extra listener. Dag-gesleuteld = idempotent van vorm, hetzelfde
  argument als bij `streaks/{uid}/diamonds/{dayKey}`.
- **Een gepind klusje schuift mee naar vandaag zolang het niet afgevinkt is**
  (`eigenEffIdx`, zelfde zelf-herstel als `onDayEffIdx`): een vergeten eigen to-do mag niet
  uit het zicht verdwijnen. Bij afvinken herschrijft `toggleEigenTaak` de `onDay` naar de dag
  van afvinken, **atomisch samen met het vinkje** — zonder dat sprong de rij terug naar de
  oorspronkelijke pin en dook ze daar weer onafgevinkt op.

## Fase 3 — de aansluiting op het dagscherm

Twee regels doen het werk in `render()`:

```js
k.eigen = eigenTakenForDay(k.key, idx);   // NA de k.vrij-tak
const ids = k.tasks.map(t => t.id).concat(k.snaps.map(s => s.id));   // ← eigen zit hier NIET in
```

`ids` is de ene lijst waaruit *alles* volgt: de voltooiingsvlag, de badge, de diamant, de
voortgangsbalk en de viering. Door `k.eigen` er buiten te houden is de hele eis
("geen gevolgen") één afwezigheid in plaats van vijf uitzonderingen.

`k.eigen` staat bewust **ná** de `k.vrij`-tak (die `tasks`/`snaps`/`shifts` leegmaakt): op een
🏖️ vrije dag blijven de eigen klusjes staan. Vakantie schrapt de *klusjes*, niet wat het kind
voor zichzelf bijhoudt.

## Fase 4 — twee bewuste afwijkingen

- **`checkBlockReason()` wordt hier niet aangeroepen.** Die gezinsinstelling
  (`settings/kidCheckScope`) bestaat om te verhinderen dat een kind zijn reeks of diamanten
  manipuleert door in het verleden te vinken. Een eigen klusje heeft die gevolgen niet, dus
  het mag altijd, op elke dag.
- **Geen viering, geen fanfare** — enkel `playChime()` als gewone tik-feedback.
  `showCelebration` bleef ongemoeid.

## Fase 5 — UI: alles op de kaart

Een blokje onderaan de kaart (hairline erboven), met een grijze `eigen`-chip per rij i.p.v. de
gekleurde `.vac-tag`: het moet lezen als "hoort niet bij de echte klusjes". De kopregel
"Eigen klusjes — telt niet mee voor 🔥 of 💎" verschijnt alleen als er rijen zijn; een leeg
blok is enkel de `+ Eigen klusje`-knop, zodat een kaart zonder eigen klusjes rustig blijft
(op scherm nagekeken in licht én donker).

**Geen beheer-scherm en geen hernoemen** — expliciete keuze van de gebruiker. Het volledige
beheer is de + knop en een 🗑 per rij; vergist het kind zich in het label, dan wist het de rij
en typt opnieuw. Een vierde scherm en drie knopjes per rij (naast de streak-strook, de
💎-chip, de 🏖️-knop en de ⏮/⏭ op beurten) kostten meer dan ze opbrachten. Kinderen krijgen
dus nog steeds geen toegang tot ⚙️ Beheer.

Ouder én kind zien de rijen en mogen beide wissen; `mayEditEigen(uid)` staat in de drie
handlers zélf, niet enkel rond de knoppen.

## Verificatie

`test/eigen-taken.test.js` (49 checks) zet de kern vast: geen vlag/diamant bij een afgevinkt
eigen klusje, een openstaand eigen klusje blokkeert de voltooiing níet, de voortgangsbalk
blijft `0/1`, en een dag met enkel een eigen klusje blijft een "lege dag" waar de reeks over
heen stapt (7 blijft 7). Plus sectie 11 in `test/notify.test.js`: de herinnering vermeldt een
eigen klusje niet en vuurt niet als alleen een eigen klusje open staat.

Twee valkuilen die tijdens het schrijven van die test naar boven kwamen en die het bewaren
waard zijn:
- **`weekdays: []` kan niet in een seed.** RTDB — en dus ook de nep-SDK — bewaart een lege
  array niet, waardoor het veld *afwezig* is en dus "elke dag" betekent. Een dag zonder
  ingeplande klusjes bouw je via de deelnemer (`members: [andereKid]`), niet via lege weekdagen.
- Een voltooiingsvlag seeden voor een dag waarvan het echte klusje **niet** afgevinkt is,
  wordt door de bestaande v19-tak in `render()` terecht weer weggehaald. De seed moet de
  `days/{key}/checks/{uid}` erbij zetten.
