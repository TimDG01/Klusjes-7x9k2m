# Tests

Headless tests die de **echte `index.html`** in Chromium laden, maar de drie
Firebase-CDN-modules onderscheppen en vervangen door een in-memory nep-SDK. Er gaat dus
**geen netwerkverkeer** naar Firebase en er wordt **nooit echte gezinsdata** aangeraakt —
ook de `?test`-sandbox in de database is hiervoor niet nodig.

## Draaien

```bash
cd test
npm install      # eenmalig (installeert Playwright; node_modules staat in .gitignore)
npm test         # draait elk *.test.js-bestand
```

Eén bestand apart draaien kan ook: `node kid-check-scope.test.js`.

De browser wordt automatisch gezocht: staat er een voorgeïnstalleerde Chromium onder
`PLAYWRIGHT_BROWSERS_PATH` (of `/opt/pw-browsers`), dan wordt die gebruikt; anders pakt
Playwright zijn eigen download.

## Bestanden

| bestand | rol |
|---|---|
| `fake-firebase.js` | de nep-SDK (database + auth + app + messaging) en `openApp()`, die een pagina opent met de nep-SDK ervoor |
| `assert.js` | minimalistisch `check()`/`section()`/`done()`-rapport, geen testframework |
| `run-all.js` | draait alle `*.test.js` na elkaar |
| `*.test.js` | de tests zelf |

## Een test schrijven

```js
const { launchBrowser, openApp } = require('./fake-firebase.js');
const { section, check, done } = require('./assert.js');

const browser = await launchBrowser();
const { page, dialogs } = await openApp(browser, { seed: <hele databaseboom>, user: '<uid>' });
```

`seed` is letterlijk de databaseboom (`{ families: {...}, userIndex: {...} }`), `user` de
uid die al ingelogd is (alsof `browserLocalPersistence` de sessie herstelde). `dialogs`
verzamelt elke `alert()`/`confirm()`-tekst, zodat je kunt controleren dát een gebruiker
uitleg kreeg. In de pagina kun je via `window.__store.root` de database uitlezen en met
`window.__flushDb()` de listeners laten vuren na een rechtstreekse wijziging.

Twee optionele velden: `waitFor` (de selector waarop `openApp` wacht, standaard `.task` —
een seed zonder zichtbare klusjesrijen heeft er een andere nodig, bv. `.card`) en `query`,
dat een querystring aan de URL hangt. `query: 'test'` opent de **sandboxmodus**; `BASE_ROOT`
prefixt dan elk pad met `test/`, dus de seed moet onder een `test`-sleutel genest staan:
`{ test: { families: {...}, userIndex: {...} } }`. Zie `testmodus-datum.test.js`.

### Valkuilen bij het seeden

Elk van deze drie heeft al eens een verkeerde test opgeleverd (en bijna een verkeerde
diagnose):

1. **Laat `settings/shifts` niet weg.** Ontbreekt die node, dan schrijft de app er
   `DEFAULT_SHIFTS` in ("Stofzuigen", ma+vr) en verschijnt er op sommige weekdagen een
   tweede rij — waardoor de dag nooit af is en de test flaky wordt naargelang de dag waarop
   je hem draait. Seed de node expliciet; `weekdays: [7]` (een onbestaande weekdag) bestaat
   wel maar levert nooit een beurt op.
2. **`weekdays: []` kun je niet seeden.** RTDB — en dus ook de nep-SDK — bewaart een lege
   array niet, waardoor het veld *afwezig* is en "elke dag" betekent. Bouw een lege dag via
   `members` (de taak aan een ánder kind geven).
3. **Een voltooiingsvlag zonder de bijbehorende vinkjes verdwijnt weer.** `render()` haalt op
   vandaag een onverdiende vlag terecht weg; seed dus ook `days/{key}/checks/{uid}`.

## Screenshots (`npm run shot`)

Groene tests zeggen niets over hoe iets *leest*. `screenshot.js` opent dezelfde
`index.html` met dezelfde nep-SDK en legt een scenario vast in **licht én donker** thema:

```
npm run shot                    # alle scenario's, beide thema's
node screenshot.js eigen        # één scenario
node screenshot.js eigen donker # één scenario, één thema
node screenshot.js --uit=/tmp/x # andere uitvoermap
```

De PNG's komen in `test/screenshots/`, dat **gitignored** is: het script hoort in de repo, de
beelden niet — zo kan er nooit een verouderde screenshot in git achterblijven. Het is een
hulpmiddel, geen test: `run-all.js` pikt enkel `*.test.js` op, dus dit draait nooit mee in de
suite.

Een scenario toevoegen = één entry in `SCENARIOS` met `{ seed, user, query?, waitFor?,
stappen? }`. `stappen(page)` loopt ná het laden en vóór de opname, zodat je eerst nog kunt
klikken of (in `?test`) de klok kunt verzetten — zie `testbar-verzet`.

## Waarom de nep-SDK is zoals hij is

Drie dingen zijn er de harde manier uit geleerd; ze staan als commentaar in
`fake-firebase.js` en mogen niet "vereenvoudigd" worden:

1. `val()` geeft een node met dichte `0..n-1`-sleutels terug als **array**, zoals de echte
   RTDB. Anders faalt elke `Array.isArray(weekdays)`-check stilzwijgend en valt de app
   terug op "elke dag".
2. Listeners vuren **asynchroon en gecoalesceerd**, en alleen bij een échte wijziging.
   Synchroon notificeren binnen een write geeft herintredende renders met verouderde
   caches — iets wat de echte (altijd async) SDK nooit kan veroorzaken.
3. Auth houdt state **per app-instantie** bij: kindaanmaak gebruikt bewust een tweede
   instantie, zodat de ouder niet uitgelogd wordt.
