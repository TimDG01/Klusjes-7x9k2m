# Bouwplan v19 — Beloningen: 💎 diamanten verdienen en inwisselen

> **✅ AFGEROND — dit is nu een historisch bouwlog.** Alle fases zijn voltooid en staan
> op `main` (laatst: v19.9, zie `docs/CHANGELOG.md`). Voor de **huidige** werking van
> diamanten/beloningen: lees `CLAUDE.md` (sectie "💎 Diamanten & beloningen") — niet dit
> bestand, want het aanvragen-flow uit fase 4b hieronder is in v19.7 vervangen door direct
> kopen. Dit blijft hier staan als *waarom*-achtergrond bij de oorspronkelijke keuzes.

## Doel (idee van de gebruiker)
Streaks en badges belonen nu alleen binnen de app. Daar komt een echte beloning bij: de
ouder maakt zelf beloningen aan (avondeten kiezen, filmavond, uitstap) met **afbeelding,
omschrijving en een prijs in diamanten**; het kind spaart diamanten en wisselt ze in.

- **💎 Diamanten = 1 per volledig afgewerkte dag + 3 extra per badge.**
- **Kind vraagt aan, ouder keurt goed** — pas bij goedkeuring gaan de diamanten af.
- **Beloningen zijn altijd herhaalbaar.**
- **Iedereen start op 0** (geen diamanten met terugwerkende kracht).

Leidend principe, net als bij v18.9: **additief**. Streaks, badges en de klusjeslogica
blijven exact zoals ze zijn; hier komt een laag bovenop.

## Gekozen aanpak

### Diamanten worden weggeschreven, dag per dag (niet berekend)
Bewust **niet** afgeleid uit de voltooiingsvlaggen:
1. **Start op 0** — afleiden zou elk kind meteen diamanten geven voor álle dagen die het al
   afwerkte. Alleen schrijven bij een *nieuwe* voltooiing lost dat vanzelf op.
2. **`settings/streakStart` is instelbaar** (Beheer) — een afgeleid saldo zou mee verspringen
   als een ouder die datum verzet.
3. **Oude vlaggen bewegen nog** — `render()` vult een vergeten dag van weken geleden alsnog
   in ("kind vergat te tikken"). Bij afleiden kwam daar plots een diamant uit het niets bij.

*(Rekenlast is hier níét het argument: ~365 getallen optellen uit een node die toch al in
het geheugen zit is verwaarloosbaar — `simulateStreak` doet bij elke render al een
dag-per-dag wandeling over dezelfde periode.)*

**Vorm: een dag-gesleutelde, alleen-groeiende regel — geen ophoogbare teller.**
`streaks/{uid}/diamonds/{dayKey}: 1` (of `4` op een badgedag). Een teller (`saldo += 1`) zou
vroeg of laat dubbel tellen: `render()` wordt door meerdere async listeners én op meerdere
toestellen tegelijk aangeroepen. Dezelfde dagsleutel twee keer schrijven verandert niets —
**"maximaal 1 per dag" is een eigenschap van de vorm**, geen regel die bewaakt moet worden.

Geschreven in `writeCompletionFlag` (`index.html:1089`), dat al precies één keer per dag
vuurt (guard `complete && !flagged` in `render()`, `:1477`). Eén sleutel erbij in de
**bestaande atomische `rootUpdate`**:
```js
const badgeDag = sim.earnDays.includes(key) ? 1 : 0;   // NIET newRanks
upd[`streaks/${kidKey}/diamonds/${key}`] = DIAMANTEN_PER_DAG + badgeDag * DIAMANTEN_PER_BADGE;
```
Bewust `sim.earnDays.includes(key)` en **niet** `newRanks.length`: `newRanks` is leeg zodra
de badge al bestaat, dus na een uitvink-en-hervink-rondje zou de dag zijn 3 badgediamanten
kwijtraken terwijl het kind de badge (die permanent is) gewoon houdt.

### Aan- en uitvinken levert niets op
De diamant **loopt mee met de voltooiingsvlag**. `render()` (`:1477-1484`) haalt die vlag van
**vandaag** alweer weg zodra er iets uitgevinkt wordt (op voorbije dagen nooit). Die tak
wordt uitgebreid tot één `rootUpdate` die **ook** `diamonds/{dag}` wist:

| handeling | gevolg |
|---|---|
| dag wordt voltooid | diamant verschijnt meteen |
| daarna iets uitvinken (vandaag) | diamant verdwijnt weer |
| opnieuw voltooien | dezelfde dagsleutel → weer 1, nooit 2 |
| de dag is voorbij | vlag én diamant staan vast (de wis-tak draait alleen op vandaag) |
| terugbladeren en een **oude** dag alsnog aanvinken | **géén** diamant (wel gewoon de reeks-vlag) |

**Diamanten worden alleen voor vandaag geschreven.** `writeCompletionFlag` draait ook voor
een voorbije dag die alsnog compleet raakt — dat is de bewuste "kind vergat te tikken"-
reparatie voor de reeksen, en die blijft. De diamant hangt daar bewust *niet* aan: anders
levert terugbladeren naar een oude dag gratis diamanten op (gemeld tijdens het testen van
fase 4b).

Onmiddellijke feedback én aan-/uitvinken levert netto niets op. Randgeval: wissen gebeurt
**alleen als het saldo daardoor niet negatief wordt** (een net uitgegeven diamant kan niet
meer teruggenomen worden).

**Waarom hier géén servercontrole.** Het voor de hand liggende idee — de cron
(`scripts/notify.js`) de dag laten nakijken — lost dit niet op: het script leest exact
dezelfde vinkjes en kan evenmin zien of de afwas écht gedaan is. Het zou de beloning
bovendien afhankelijk maken van een trigger die (zie **Externe triggers** in `CLAUDE.md`)
notoir onbetrouwbaar is, en het kind zijn diamant pas de dag nadien tonen. Tegen "aanvinken
zonder het te doen" bestaat geen technische oplossing; dat is de ouder — en daarvoor is
v18.9 (`kidCheckScope`) er al.

### Datamodel — vijf paden
`saldo = som(diamonds) − som(goedgekeurde inwisselingen)`, twee optellingen over nodes die
al geladen zijn.

| pad | inhoud | wie schrijft |
|---|---|---|
| `streaks/{uid}/diamonds/{dayKey}` | `1` of `4` — het verdiengrootboek | kind zelf / ouder |
| `settings/rewards/{id}` | `{ naam, omschrijving, diamanten, order }` | ouder |
| `settings/rewardImages/{id}` | `'data:image/jpeg;base64,…'` (apart pad, lui geladen) | ouder |
| `settings/rewardClaims/{id}` | `{ uid, rewardId, naam, diamanten, dag }` | ouder (goedkeuring) |
| `streaks/{uid}/rewardRequests/{id}` | `{ rewardId, diamanten, dag }` | het kind zelf |

**Historiek blijft correct als een beloning verdwijnt.** Een claim **bevriest** `naam` +
`diamanten` bij goedkeuren — zelfde idee als de `snap` bij een eenmalige taak. De historiek
verwijst nooit terug naar `settings/rewards/{id}`, dus een latere prijswijziging, hernoeming
of verwijdering laat oude regels ongemoeid. `deleteReward` wist de beloning **en** haar
afbeelding in één `rootUpdate`, zodat er geen weesafbeeldingen van tientallen kB blijven
staan.

**Eén openstaande aanvraag per kind** — vermijdt reserveringswiskunde en is voor een kind
begrijpelijker. Bij goedkeuring wordt de betaalbaarheid **opnieuw** gecontroleerd en gaan
aanvraag-wissen + claim-schrijven in **één `rootUpdate`**.

**Handmatig bijsturen**: een ouder kan diamanten toekennen/aftrekken via
`streaks/{uid}/diamonds/bonus-{tijdstempel}: ±n` — zelfde alleen-groeiende vorm.

### ✅ Geen rules-wijziging (geverifieerd)
- `settings` heeft een node-brede ouder-only `.write` (`firebase-rules-v16.json:90`) die
  **cascadeert** naar nieuwe subsleutels → `rewards`, `rewardImages`, `rewardClaims`.
- `streaks/$childId` is schrijfbaar door de ouder **of het kind zelf** (`:163`) → cascadeert
  naar `diamonds` en `rewardRequests`.
- Lezen mag elk gezinslid (`.read` op `families/$familyId`, `:51`).

Checklist-stap 9 is dus **niet** van toepassing — niets in de Firebase Console plakken. Een
kind kan zijn saldo niet vervalsen: de claims staan op een ouder-only pad.

### Afbeeldingen — de enige echt nieuwe techniek
Firebase **Storage vereist Blaze** en dit project blijft bewust op Spark. Er is vandaag ook
**nergens** een `<img>`, `data:`-URI, `<canvas>` of `<input type="file">` in het bestand.
Zonder één dependency:
- `pickRewardImage(id)` maakt in code een `<input type="file" accept="image/*">` en klikt die
  aan (op iOS meteen camera/fotobibliotheek).
- `FileReader` → `Image` → **`<canvas>`**: vierkant bijsnijden naar 320×320, dan
  `toDataURL('image/jpeg', 0.72)` → ± 20–40 kB base64. Groter dan **60 kB** → één herkansing
  op kwaliteit 0.5; nog te groot → nette `alert()` en niets wegschrijven.
- **Renderen via een strikte witte lijst** (deze app heeft ooit een opgeslagen-XSS gehad):
  `safeImageSrc(v)` geeft de waarde alleen terug bij
  `/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/`, anders de 🎁-fallback. Naam en
  omschrijving gaan sowieso door `escapeHtml` (`:712`).

## Concrete onderdelen (`index.html`)
1. **Constanten + caches**: `DIAMANTEN_PER_DAG`, `DIAMANTEN_PER_BADGE`, `rewardsCache`,
   `rewardClaimsCache`, `rewardImagesCache` — resetten in `teardownFamily()` (`:1213`).
2. **Listeners** in `initFamily()`, **geen-laadgate/niet-fataal** zoals
   `streakStart`/`notifyTime` (`:1178`) — beloningen mogen de kernapp nooit platleggen.
   `settings/rewards` + `settings/rewardClaims` altijd aan; `settings/rewardImages` **lui**
   (pas bij de eerste `openRewards()`/Beheer, vlag `rewardImagesAttached`, unsub in
   `familyUnsubs`). De `/streaks`-listener (`:1157`) krijgt `diamonds` en `rewardRequests`
   erbij, plus in `streaksOf()`'s lege default (`:698`).
3. **Optellingen**: `kidDiamondsEarned`, `kidDiamondsSpent`, `kidDiamonds` (saldo),
   `openRequestOf`.
4. **`writeCompletionFlag` (`:1089`)** — één sleutel erbij in het bestaande `upd`-object.
5. **Nieuw scherm** `screen === 'rewards'`, patroon van `badges`: dispatch-tak (`:1388`),
   `openRewards(kidKey?)` naar model van `openBadges` (`:2008`), `rewardsFilter`. Footer:
   `🎁 Beloningen` naast `🏆 Badges` (`:1537`), **niet** rol-gegated. Raster hergebruikt
   `.badge-grid` (`:118`) / `.badge-card` (`:119`) / `.badge-card.locked` (`:124`).
6. **💎-chip** bij de streak-strip (`:1585`) die `openRewards(kidKey)` opent.
7. **Beheer**: `renderAdminRewards()` in `renderAdmin()` (`:2670`) met de v18.2-accordion
   (`adminOpen` + `toggleAdminRow('reward:'+id)`); CRUD via `prompt()`/`confirm()` en
   `push(dbRef('settings/rewards'), { …, order: Date.now() })` — idioom van `addShift`
   (`:3015`). In **Instellingen** één regel per kind: `adjustDiamonds(uid)`.
8. **`Object.assign(window, {...})`** (`:3158`): `openRewards`, `requestReward`,
   `approveRequest`, `refuseRequest`, `addReward`, `renameReward`, `editRewardText`,
   `editRewardCost`, `pickRewardImage`, `deleteReward`, `adjustDiamonds`.

## Bewust niet aangeraakt
- `simulateStreak`, de badge-lus, de streak-strip, de viering: ongewijzigd. De enige
  aanraking van bestaande logica is die ene extra sleutel in `writeCompletionFlag`.
- `scripts/notify.js`: beloningen raken de "openstaande klusjes"-berekening niet, dus de
  ⚠️-logicaduplicatie krijgt er **geen** last bij.
- `firebase-rules-v16.json`: geen wijziging.

## Fases (elke fase = groene tests + push; veilig stoppunt)
- [x] **Fase 0 — Bouwlog vastleggen.** Dit bestand aanmaken, committen, pushen. Geen code.
- [x] **Fase 1 — Datalaag.** Constanten, caches, de twee nieuwe listeners, `/streaks`
      uitbreiden met `diamonds` + `rewardRequests`, `streaksOf`-default,
      `teardownFamily`-reset, en de optelfuncties. **Nog geen UI** — de app ziet er identiek
      uit; de bestaande 40 tests blijven groen.
      *(Gedaan: `DIAMANTEN_PER_DAG/_BADGE`, `rewardsCache`/`rewardClaimsCache`/
      `rewardImagesCache`, listeners op `settings/rewards` + `settings/rewardClaims`,
      `kidDiamondsEarned/Spent`, `kidDiamonds` (klemt op 0), `openRequestOf`. 40/40 groen +
      een aparte controle dat de app schoon opstart met data op alle nieuwe paden.
      `VERSION` blijft bewust `v18.9`: er is nog geen enkele gedragswijziging.)*
- [x] **Fase 2 — Verdienen.** Extra sleutel in `writeCompletionFlag` (`earnDays`-formule) +
      de wis-tak in `render()` (diamant mee weg op vandaag, saldo ≥ 0).
      `test/rewards.test.js` met verificatie 1–3. Diamanten lopen op, nog zonder scherm.
      *(Gedaan: 17 nieuwe testgevallen, alles groen — verdienen + idempotentie, start op 0,
      badgedag = 4, aan-/uitvinken levert netto niets op, badgedag houdt zijn 4 na
      hervinken, voorbije dagen blijven onaangeroerd, een uitgegeven diamant kan niet
      teruggenomen worden, en `streakStart` verzetten verandert het grootboek niet.
      **Verificatie 4 (`adjustDiamonds`) schuift naar fase 3** — die knop wordt daar pas
      gebouwd. `VERSION` blijft `v18.9` tot fase 6: er is nog geen zichtbare wijziging.)*
- [x] **Fase 3 — Beheer.** `renderAdminRewards()` + CRUD (incl. afbeelding mee wissen) +
      `adjustDiamonds` + `window`-export. Tests: verificatie 9.
      *(Gedaan: accordion-sectie met naam/omschrijving/prijs bewerken en verwijderen,
      `+ Beloning toevoegen`, en in **Instellingen** een regel per kind om diamanten bij te
      sturen via een `bonus-…`-regel. 34 gevallen in `rewards.test.js`, suite 74 groen.
      Ook verificatie 4 (bijsturen) zit hier, verschoven uit fase 2.
      **Nevenvondst:** de nep-SDK's `push()` negeerde de meegegeven waarde, waardoor élke
      "voeg toe"-knop in een test stilzwijgend niets deed — gerepareerd in
      `test/fake-firebase.js`; dat maakt ook `addShift`/`addTaskAdmin` testbaar.)*
- [x] **Fase 4a — Beloningsscherm tonen.** `screen === 'rewards'`, `openRewards`,
      footer-knop 🎁, kaartenraster, 💎-chip op het dagscherm.
      *(Gedaan: de chip staat náást de streak-strip — een knop in een knop is ongeldige
      HTML — en opent de winkel van dat kind; de strip blijft naar de badges gaan. Kaarten
      hergebruiken `.badge-card`, met `.locked` + "nog N" voor wat nog niet betaalbaar is.
      Een kind ziet altijd alleen zichzelf, ook als `openRewards()` zonder filter wordt
      aangeroepen. 47 gevallen in `rewards.test.js`, suite 87 groen.)*
- [x] **Fase 4b — Aanvragen en goedkeuren.** `requestReward` (kind, één openstaande
      aanvraag), `approveRequest` (ouder: betaalbaarheid herchecken, aanvraag wissen +
      claim schrijven in één `rootUpdate`), `refuseRequest`, de aanvraagbalk bovenaan het
      scherm en een korte historiek. Tests: verificatie 5–8.
      *(Gedaan: "Vraag dit" verschijnt enkel op betaalbare kaarten en enkel als er geen
      aanvraag openstaat; goedkeuren bevriest naam + prijs in de claim, dus een latere
      prijswijziging herschrijft de historiek niet. Een kind kan niet goedkeuren, niet
      weigeren en niet voor een broer of zus aanvragen. 75 gevallen in `rewards.test.js`,
      suite 115 groen.
      **⚠️ Later vervangen in v19.7**: dit hele aanvragen-en-goedkeuren-flow is eruit
      gehaald en verving door direct kopen — zie `docs/CHANGELOG.md` v19.7. Deze fase blijft
      hier staan als historisch bouwlog, niet als de huidige werking.)*
- [x] **Fase 5 — Afbeeldingen.** Luie `settings/rewardImages`-listener, `pickRewardImage` +
      canvas-verkleining + groottegrens, `safeImageSrc`. Tests: verificatie 10.
      *(Gedaan: foto kiezen/vervangen/verwijderen in Beheer, in de app verkleind tot
      320×320 JPEG met een harde grens van 60 kB, getoond via een strikte witte lijst.
      Listener hangt pas aan bij het openen van Beheer of de winkel. 87 gevallen in
      `rewards.test.js`; apart geverifieerd dat de canvas-uitvoer die witte lijst passeert
      (~5 kB voor een testafbeelding).)*
- [x] **Fase 6 — Afwerken.** `VERSION` → `v19`, `docs/CHANGELOG.md`, `CLAUDE.md`, alle vakjes
      hierboven afvinken, volledige suite groen. **Niet** naar `main`.
      *(Gedaan, samen met fase 5. Nadien nog v19.1 t/m v19.9 bovenop: iconen (v19.1–19.2),
      Beheer ingeklapt (v19.3–19.4), icoon-weergave-fix (v19.5), 🛒 Shop-naam (v19.6), direct
      kopen i.p.v. aanvragen (v19.7), "al gekregen" ingeklapt (v19.8), aankoop-melding aan
      ouders (v19.9) — allemaal gedocumenteerd in `docs/CHANGELOG.md` en al op `main`.)*

## Status: afgerond
Alle fases van dit bouwplan zijn voltooid en staan op `main` (laatst: v19.9). Dit bestand
blijft als historisch bouwlog staan — voor de actuele werking van diamanten/beloningen is
`CLAUDE.md` (sectie "💎 Diamanten & beloningen") de bron van waarheid, niet dit plan.

## Verificatie
Nieuw bestand `test/rewards.test.js` dat **`test/fake-firebase.js` hergebruikt** (niet
herschrijven — checklist-stap 4). Draaien met `cd test && npm test`; de bestaande 40 gevallen
moeten groen blijven.

1. **Verdienen (het kernpunt)**: een dag die nieuw voltooid raakt schrijft `diamonds/{dag} = 1`;
   met badge `4`. Twee keer renderen op dezelfde dag verandert het saldo **niet**. Een dag die
   al vóór v19 voltooid was krijgt **niets** — een gezin met historiek start op **0**.
2. **Aan-/uitvinken levert niets op**: voltooien geeft 1, uitvinken op **vandaag** haalt hem
   weg, opnieuw voltooien geeft er weer precies één. Op een **voorbije** dag blijft hij staan.
   Ook: een uitgegeven diamant kan niet weggenomen worden (saldo ≥ 0), en een badgedag blijft
   na uitvinken-en-hervinken op 4 (de `earnDays`-formule, niet `newRanks`).
3. **`streakStart` verzetten** verandert het saldo niet (bewijst dat er niets afgeleid wordt).
4. **Bijsturen**: `adjustDiamonds` telt op én af; historiek blijft leesbaar.
5. **Saldo**: na een claim van 5 daalt het saldo met 5; een claim van een ander kind raakt dit
   kind niet.
6. **Aanvragen**: knop ontbreekt/weigert bij te weinig diamanten; een tweede aanvraag kan niet
   zolang er één openstaat; het kind schrijft enkel onder zijn **eigen** uid.
7. **Goedkeuren**: claim met bevroren `naam`+`diamanten`, aanvraag weg, saldo daalt — prijs
   later wijzigen verandert de claim niet. **Weigeren**: aanvraag weg, géén claim, saldo
   gelijk. Saldo intussen gedaald ⇒ goedkeuren weigert netjes.
8. **Herhaalbaar**: dezelfde beloning een tweede keer aanvragen en goedkeuren werkt.
9. **Beheer**: CRUD werkt voor een ouder; een kind ziet de sectie niet en `addReward()`
   rechtstreeks aanroepen doet niets. **Verwijderen**: historiek blijft leesbaar (bevroren
   naam + prijs), saldo ongewijzigd, afbeelding óók weg.
10. **Afbeelding**: een geldige data-URI rendert in een `<img>`; een waarde buiten de witte
    lijst valt terug op 🎁 en komt nooit in de DOM.
11. **Regressie**: streaks, badges, viering en afvinken (incl. v18.9) blijven groen — in het
    bijzonder dat `writeCompletionFlag` nog steeds precies één keer per dag vuurt.
12. **Handmatig** (niet te automatiseren): op de telefoon een echte foto kiezen via de
    githack-link met `?test` en controleren dat ze verkleind opgeslagen wordt en scherp genoeg
    oogt in het raster.
