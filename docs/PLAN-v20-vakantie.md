# Bouwplan v20 — 🏖️ Vrije dagen (vakantiemodus)

> **✅ AFGEROND** — deze versie is af; dit blijft staan als *waarom*-achtergrond.
> Voor de huidige werking: `CLAUDE.md` (sectie "🏖️ Vrije dagen").

## Doel (vraag van de gebruiker)
> *"We gaan binnenkort op verlof en dan moet niemand zijn klusjes doen, maar de streaks
> zouden wel moeten blijven staan en ook hun diamanten. Een soort frees — ik dacht dat je
> als ouder per dag een vinkje kan zetten."*

Vandaag kent de app enkel "wel/niet ingepland". Een dag waarop er taken stonden en niets
afgevinkt is, verbruikt eerst de joker en breekt daarna de reeks — precies wat er tijdens
twee weken verlof zou gebeuren.

Keuzes die de gebruiker maakte bij het plannen:
- klusjes op een vrije dag **verbergen** (banner), niet grijs laten staan;
- **geen** nieuwe diamanten op een vrije dag (bestaande blijven uiteraard staan);
- **per kind** aan te duiden, niet enkel gezinsbreed;
- te bedienen via **zowel een knop per dag als een periode van–tot** in Beheer.

Leidend principe, net als bij v18.9 en v19: **additief**. Afwezig veld = het gedrag van
vóór v20, dus bestaande gezinnen merken niets.

## Gekozen aanpak

### De reeks-logica kon dit al
`simulateStreak` had al een tak *"geen taken ingepland → telt niet, breekt niet"*. De hele
feature hangt aan één extra voorwaarde in die tak:

```js
} else if (kidScheduledCount(kidKey, dd) === 0 || isVrijeDag(kidKey, key)){
```

Twee eigenschappen volgen daar gratis uit:
1. De tak staat **ná** de vlag-tak, dus een dag die al voltooid wás en achteraf vrij wordt
   gezet, blijft gewoon meetellen (en houdt zijn badge en diamant).
2. `simulateStreak` is een puur lees-pad dat élke render opnieuw vooruit wandelt, dus een
   vakantie die je **achteraf** invult **herstelt** een reeks die intussen brak. Dat is geen
   toevalstreffer maar het directe gevolg van "nooit een reeks opslaan".

### Opslag: `settings/vrijeDagen/{dayKey}/{uid}: true`
Overwogen en verworpen: `days/{dayKey}/vrij`. Dat is waar de rest van de per-dag-data staat
en de rules zijn er al ouder-only, maar de **dag-listener laadt maar één dag tegelijk** en
`simulateStreak` loopt de héle geschiedenis af. Eén klein gezinsbreed knooppunt onder
`settings` is het enige dat die wandeling kan lezen — met dezelfde no-gate/niet-fatale
listener als `kidCheckScope` en `notifyTime`.

Dag-gesleuteld en per uid genest: **idempotent van vorm** (twee keer hetzelfde schrijven
verandert niets), en een lege dag verdwijnt vanzelf uit de RTDB.

**Geen rules-wijziging nodig** — `settings` is node-breed ouder-only schrijfbaar en
gezinsbreed leesbaar; dat cascadeert naar de nieuwe sleutel. Kinderen kunnen zichzelf dus
géén vrije dag geven, en dat is server-side afgedwongen, niet enkel verborgen UI.

### Dagscherm: één regel in `render()` draagt de rest
```js
k.vrij = isVrijeDag(k.key, cDay);
if (k.vrij){ k.tasks = []; k.snaps = []; k.shifts = []; }
```
De id-lijst van dat kind is daarmee leeg, en alle bestaande bewaking doet de rest:
- `complete` vereist `ids.length > 0` → **geen voltooiingsvlag, dus ook geen diamant**
  (de diamant hangt aan `writeCompletionFlag`, die niet draait);
- de "haal de vlag weer weg"-tak eist óók `ids.length > 0` → een **al verdiende vlag +
  diamant blijft staan** wanneer een dag achteraf vrij gezet wordt;
- het kind valt uit `allTasks`, dus de voortgangsbalk klopt vanzelf;
- geen vieringspopup, want die hangt aan dezelfde id-lijst.

Staat iederéén vrij, dan zegt "Voortgang 0/0" niets en komt er in de plaats één
vakantiebalk. De **streak-strook blijft wél op de kaart staan**: dat 🔥 en 💎 zichtbaar
blijven doorlopen is net de geruststelling die de gebruiker vroeg.

### Beurt-taken: de vakantie mag de rotatie niet stukmaken
Met `SHIFT_GRACE = 0` valt een beurt die op de geplande dag niet afgevinkt wordt de dag
erna automatisch uit elkaar tot een losgemaakte 🔁-taak, en schuift de rotatie door. Tijdens
twee weken verlof zou dat een stapel losse taken opleveren en de beurt bij het verkeerde
kind doen belanden.

Opgelost op één plek: `shiftNextScheduledDayFrom` slaat een dag over die vrij is voor het
kind dat aan de beurt is. Zowel `shiftPendingDay` (waar de beurt getoond wordt) als
`shiftAutoDetachIfLapsed`/`shiftDetachPlan` (waar losgemaakt wordt) lopen door die functie,
dus de beurt **schuift op naar de eerste dag ná de vakantie** — zelfde kind, zelfde lijn.

Een `override` die een ouder handmatig op een vrije dag zet, blijft staan: dat is een
expliciete keuze van een ouder en wint van het schema.

### Bediening: twee ingangen
1. **🏖️-knop rechts in de kaartkop** (ouder-only), voor één losse dag — het "vinkje per dag"
   uit de vraag.
2. **Beheer → 🏖️ Vakantie**: een periode van–tot in twee `prompt()`s (stijl van de rest van
   Beheer), meteen voor alle actieve kinderen, in **één `rootUpdate`**. Aaneengesloten dagen
   met dezelfde kind-set worden voor de weergave gegroepeerd tot een periode
   (`vakantiePeriodes()`), met per periode kind-chips en een prullenbak. Voorbije periodes
   blijven staan — ze dragen de historiek van de reeks.

Grens van 92 dagen per periode: een typfout in het jaartal mag geen duizenden sleutels
schrijven.

### Server (`scripts/notify.js`)
De klusjeswiskunde staat daar bewust dubbel. Meegespiegeld: `isVrijeDag`, dezelfde `continue`
in `shiftNextScheduledDayFrom` (anders maakt de cron 's nachts tóch beurten los tijdens het
verlof) en een `return []` bovenaan `openChoresFor` (geen push-herinnering op een vrije dag).

## Wat er getest is
`test/vakantie.test.js` (echte `index.html` in Chromium tegen de nep-SDK) en sectie 9-10 van
`test/notify.test.js`. Elke gedragsregel heeft een **contrast-assert** ernaast — bv. dezelfde
reeks breekt wél zonder de vrije dagen, en dezelfde vergeten beurt wordt wél losgemaakt
zonder de vakantie. Zonder die tegenhanger bewijst een groene test niets.
