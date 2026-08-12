// Bewaakt het contract tussen scripts/notify.js en scripts/notify-appsscript.gs.
//
// Sinds de herinneringen vanuit Google Apps Script draaien, haalt dat script `notify.js`
// op als TEKST en voert het uit met een CommonJS-shim — precies om te vermijden dat de
// klusjes-/beurt-wiskunde een derde keer gekopieerd wordt. Die opzet steunt op vier
// eigenschappen van notify.js die je per ongeluk kapot maakt:
//
//   1. het is CommonJS (eindigt op `module.exports = {…}`), geen ESM;
//   2. er staat geen `require(...)` op het hoogste niveau — enkel binnenin main();
//   3. main() start alleen via de `require.main === module`-test, dus nooit bij het laden;
//   4. de planners die de bootstrap aanroept, bestaan en heten zo.
//
// Breekt één daarvan, dan blijft `npm test` groen maar krijgt niemand thuis nog een
// melding — de fout zou pas opvallen als de kinderen hun klusjes vergeten. Vandaar deze
// test: hij laadt notify.js exact zoals Apps Script dat doet.
const fs = require('fs');
const path = require('path');
const { section, check, done } = require('./assert.js');

const bron = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'notify.js'), 'utf8');

// Letterlijk dezelfde shim als laadKern_() in scripts/notify-appsscript.gs.
let requireAanroepen = 0;
function laadKern(src) {
  var module = { exports: {} };
  var exports = module.exports;
  var require = function () {
    requireAanroepen++;
    throw new Error('require is niet beschikbaar in Apps Script');
  };
  require.main = null;
  eval(src);
  return module.exports;
}

section('1. notify.js laadt via de Apps-Script-shim');
let kern = null;
let laadFout = null;
try {
  kern = laadKern(bron);
} catch (e) {
  laadFout = e && e.message ? e.message : String(e);
}
check('laden zonder fout', laadFout, null);
check('module.exports is gevuld', !!kern && typeof kern === 'object', true);

section('2. main() start NIET bij het laden');
// Zou main() toch draaien, dan vraagt hij meteen require('firebase-admin') op.
check('require werd niet aangeroepen', requireAanroepen, 0);

section('3. De planners die de bootstrap aanroept, bestaan');
for (const naam of ['brusselsNow', 'dayKey', 'runShiftMaintenance', 'purchaseNotifyPlan', 'familySendPlan']) {
  check(`${naam} is een functie`, kern && typeof kern[naam], 'function');
}

section('4. De gezondheidstest van haalBron_ herkent het bestand');
// haalBron_ weigert een GitHub-foutpagina als noodkopie op basis van deze twee markers.
check('bevat module.exports', bron.indexOf('module.exports') !== -1, true);
check('bevat familySendPlan', bron.indexOf('familySendPlan') !== -1, true);

section('5. De kern werkt ook echt door de shim heen');
{
  const now = kern.brusselsNow(new Date(2026, 7, 6, 19, 30));
  const todayKey = kern.dayKey(now.today);
  const fam = {
    members: {
      k1: { rol: 'kind', actief: true, weergavenaam: 'Lien', fcmTokens: { a: 'tok1' } },
      p1: { rol: 'ouder', weergavenaam: 'Ouder', fcmTokens: { b: 'tok2' } }
    },
    settings: { notifyTime: '19:00', tasks: { t1: { label: 'Tafel dekken', recurring: true, order: 1 } }, shifts: {} },
    days: {},
    streaks: { k1: { purchases: { x1: { naam: 'Filmavond', diamanten: 5 } } } }
  };
  const { due, plan } = kern.familySendPlan(fam, now, todayKey, false);
  check('herinnering is verschuldigd om 19:30', due, true);
  check('één kind in het plan', plan.length, 1);
  check('met het openstaande klusje in de tekst', plan[0].body, 'Nog te doen: Tafel dekken');

  const aankoop = kern.purchaseNotifyPlan(fam);
  check('één ouder-token gevonden', aankoop.parentTokens.length, 1);
  check('één te melden aankoop', aankoop.plan.length, 1);
}

done();
