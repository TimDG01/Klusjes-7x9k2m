// v19.9 — purchaseNotifyPlan (scripts/notify.js): welke aankopen moeten nog gemeld worden
// aan de ouders, en naar welke tokens? Pure functie, dus gewoon Node — geen browser nodig.
// v20 — plus de 🏖️ vrije dagen in familySendPlan en runShiftMaintenance (sectie 9-10).
const { purchaseNotifyPlan, familySendPlan, runShiftMaintenance, dayKey } = require('../scripts/notify.js');
const { section, check, done } = require('./assert.js');

function familyData({ members, streaks }){
  return { members, streaks };
}

section('1. Geen aankopen: leeg plan');
{
  const fam = familyData({
    members: { p1: { rol: 'ouder', weergavenaam: 'Ouder', fcmTokens: { a: 'tok1' } } },
    streaks: { k1: { purchases: {} } }
  });
  const { parentTokens, plan } = purchaseNotifyPlan(fam);
  check('ouder-token gevonden', parentTokens.length, 1);
  check('geen items in het plan', plan.length, 0);
}

section('2. Eén onafgehandelde aankoop: één item, met de juiste gegevens');
{
  const fam = familyData({
    members: {
      p1: { rol: 'ouder', weergavenaam: 'Ouder', fcmTokens: { a: 'tok1' } },
      k1: { rol: 'kind', weergavenaam: 'Lien' }
    },
    streaks: { k1: { purchases: { x1: { rewardId: 'r1', naam: 'Filmavond', diamanten: 5, dag: '2026-7-26' } } } }
  });
  const { plan } = purchaseNotifyPlan(fam);
  check('één item', plan.length, 1);
  check('juiste kid', plan[0].kidUid, 'k1');
  check('juiste naam kind', plan[0].kidName, 'Lien');
  check('juiste beloningsnaam', plan[0].naam, 'Filmavond');
  check('juiste prijs', plan[0].prijs, 5);
  check('juiste purchaseId', plan[0].purchaseId, 'x1');
}

section('3. Al gemeld (gemeld:true) telt niet meer mee — idempotent');
{
  const fam = familyData({
    members: { p1: { rol: 'ouder', weergavenaam: 'Ouder', fcmTokens: { a: 'tok1' } } },
    streaks: { k1: { purchases: {
      x1: { naam: 'Filmavond', diamanten: 5, gemeld: true },
      x2: { naam: 'Pretpark', diamanten: 40 }
    } } }
  });
  const { plan } = purchaseNotifyPlan(fam);
  check('enkel de niet-gemelde blijft over', plan.length, 1);
  check('en dat is de juiste', plan[0].purchaseId, 'x2');
}

section('4. Kinderen tellen niet mee als ontvanger, enkel ouders');
{
  const fam = familyData({
    members: {
      p1: { rol: 'ouder', weergavenaam: 'Ouder', fcmTokens: { a: 'tok1' } },
      k1: { rol: 'kind', weergavenaam: 'Lien', fcmTokens: { b: 'tok2' } }
    },
    streaks: { k1: { purchases: {} } }
  });
  const { parentTokens } = purchaseNotifyPlan(fam);
  check('enkel het ouder-token', parentTokens.length, 1);
  check('het is echt van de ouder', parentTokens[0].uid, 'p1');
}

section('5. Meerdere ouders, elk met een eigen token, komen allebei mee');
{
  const fam = familyData({
    members: {
      p1: { rol: 'ouder', weergavenaam: 'Mama', fcmTokens: { a: 'tok1' } },
      p2: { rol: 'ouder', weergavenaam: 'Papa', fcmTokens: { b: 'tok2' } }
    },
    streaks: {}
  });
  const { parentTokens } = purchaseNotifyPlan(fam);
  check('twee ouder-tokens', parentTokens.length, 2);
}

section('6. Meerdere kinderen met aankopen komen allebei in het plan');
{
  const fam = familyData({
    members: {
      p1: { rol: 'ouder', weergavenaam: 'Ouder' },
      k1: { rol: 'kind', weergavenaam: 'Lien' },
      k2: { rol: 'kind', weergavenaam: 'Finn' }
    },
    streaks: {
      k1: { purchases: { x1: { naam: 'Filmavond', diamanten: 5 } } },
      k2: { purchases: { x2: { naam: 'Zwembad', diamanten: 8 } } }
    }
  });
  const { plan } = purchaseNotifyPlan(fam);
  check('twee items, één per kind', plan.length, 2);
  check('de kids komen allebei voor', plan.some(p => p.kidUid === 'k1') && plan.some(p => p.kidUid === 'k2'), true);
}

section('7. Ontbrekende velden vallen netjes terug (geen crash)');
{
  const fam = familyData({
    members: { k1: { rol: 'kind' } },   // geen weergavenaam
    streaks: { k1: { purchases: { x1: {} } } }   // geen naam/diamanten
  });
  const { plan } = purchaseNotifyPlan(fam);
  check('valt terug op "Een kind"', plan[0].kidName, 'Een kind');
  check('valt terug op "iets"', plan[0].naam, 'iets');
  check('prijs valt terug op 0', plan[0].prijs, 0);
}

section('8. Geen ouder-tokens: het plan blijft toch gewoon gevuld (aanroeper beslist)');
{
  const fam = familyData({
    members: { k1: { rol: 'kind', weergavenaam: 'Lien' } },
    streaks: { k1: { purchases: { x1: { naam: 'Filmavond', diamanten: 5 } } } }
  });
  const { parentTokens, plan } = purchaseNotifyPlan(fam);
  check('geen ouder-tokens', parentTokens.length, 0);
  check('maar het item staat er wel — main() markeert het toch als gemeld', plan.length, 1);
}

// ---- v20: 🏖️ vrije dagen (vakantie) ----
const vandaag = new Date();
const dk = n => { const d = new Date(); d.setDate(d.getDate() + n); return dayKey(d); };
const nu = { today: vandaag, minutes: 20 * 60 };   // ná de standaard 19:00
const gezin = extraSettings => ({
  members: {
    p1: { rol: 'ouder', weergavenaam: 'Ouder' },
    k1: { rol: 'kind', weergavenaam: 'Lien', fcmTokens: { a: 'tok1' } }
  },
  settings: { tasks: { t1: { label: 'Afwas', recurring: true, order: 0, members: ['k1'] } }, ...extraSettings }
});

section('9. Geen herinnering op een vrije dag');
{
  const zonder = familySendPlan(gezin({}), nu, dk(0), false);
  check('regressie: normaal krijgt het kind een herinnering', zonder.plan.length, 1);
  const met = familySendPlan(gezin({ vrijeDagen: { [dk(0)]: { k1: true } } }), nu, dk(0), false);
  check('op een vrije dag niet', met.plan.length, 0);
  const ander = familySendPlan(gezin({ vrijeDagen: { [dk(0)]: { k2: true } } }), nu, dk(0), false);
  check('de vrije dag van een ánder kind verandert niets', ander.plan.length, 1);
}

section('10. De cron maakt geen beurten los tijdens de vakantie');
{
  const beurt = vrijeDagen => ({
    members: { k1: { rol: 'kind', weergavenaam: 'Lien' } },
    settings: {
      tasks: {},
      shifts: { s1: { name: 'Stofzuigen', weekdays: [0,1,2,3,4,5,6], lines: ['boven'], members: ['k1'], next: { uid: 'k1', lineIdx: 0 }, lastDone: dk(-5) } },
      ...(vrijeDagen ? { vrijeDagen } : {})
    }
  });
  const zonder = runShiftMaintenance(beurt(null), nu);
  check('regressie: een vergeten beurt wordt wél losgemaakt', Object.keys(zonder).length > 0, true);

  const vrij = {};
  for (let i = -4; i <= 0; i++) vrij[dk(i)] = { k1: true };
  const fam = beurt(vrij);
  const met = runShiftMaintenance(fam, nu);
  check('tijdens de vakantie niet', Object.keys(met).length, 0);
  check('  en de rotatie blijft staan', fam.settings.shifts.s1.lastDone, dk(-5));
}

// ---- v21: 📝 eigen klusjes komen nooit in een herinnering ----
// Ze staan onder streaks/{uid}/eigenTaken en de ctx van familySendPlan leest enkel
// settings/tasks + settings/shifts — er valt dus niets weg te filteren. Deze sectie zet
// dat vast, zodat een latere refactor die streaks in de ctx trekt hier stukloopt.
section('11. Geen herinnering voor een eigen klusje');
{
  const eigen = { k1: { eigenTaken: { e1: { label: 'Boek lezen', order: 1 } } } };

  const met = familySendPlan({ ...gezin({}), streaks: eigen }, nu, dk(0), false);
  check('het echte klusje geeft nog gewoon een herinnering', met.plan.length, 1);
  check('  en het eigen klusje staat niet in de tekst', met.plan[0].body, 'Nog te doen: Afwas');

  // echte klusje af, eigen klusje open → niets te melden
  const fam = { ...gezin({}), days: { [dk(0)]: { checks: { k1: { t1: true } } } }, streaks: eigen };
  check('alles echt af + een openstaand eigen klusje = geen herinnering',
    familySendPlan(fam, nu, dk(0), false).plan.length, 0);
}

done();
