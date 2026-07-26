// v19.9 — purchaseNotifyPlan (scripts/notify.js): welke aankopen moeten nog gemeld worden
// aan de ouders, en naar welke tokens? Pure functie, dus gewoon Node — geen browser nodig.
const { purchaseNotifyPlan } = require('../scripts/notify.js');
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

done();
