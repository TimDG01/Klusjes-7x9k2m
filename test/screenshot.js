// Screenshots van de echte index.html tegen de nep-Firebase-SDK — geen netwerk, geen echte
// gezinsdata. Bedoeld voor de "kijk er ook naar"-stap uit CLAUDE.md: groene tests zeggen
// niets over hoe iets leest, en of het in licht ÉN donker thema klopt.
//
// Dit is een HULPMIDDEL, geen test: `npm test` (run-all.js) pikt enkel *.test.js op, dus dit
// bestand draait nooit mee in de suite.
//
// Gebruik:
//   node screenshot.js                  → alle scenario's, licht + donker
//   node screenshot.js eigen            → één scenario, licht + donker
//   node screenshot.js eigen donker     → één scenario, één thema
//   node screenshot.js --uit=/tmp/shots → andere uitvoermap
//
// De PNG's komen in test/screenshots/ (gitignored — beelden horen niet in de repo, het
// script dat ze maakt wél; zo staat er nooit een verouderde screenshot in git).
//
// Een scenario toevoegen: zet een entry in SCENARIOS met { seed, user, query?, waitFor?,
// stappen? }. `stappen(page)` loopt ná het laden en vóór de opname, zodat je eerst nog kunt
// klikken of de klok kunt verzetten.
const fs = require('fs');
const path = require('path');
const { launchBrowser, openApp } = require('./fake-firebase.js');

const FID = 'f1', PARENT = 'p1', KID = 'k1', KID2 = 'k2';

const dayKey = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const shift = n => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
const dk = n => dayKey(shift(n));
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Eén gezin, per scenario aan te vullen. `shifts` wordt altijd expliciet gezet: ontbreekt die
// node, dan zaait de app DEFAULT_SHIFTS erin en verschijnt er op ma/vr een extra rij (zie de
// seed-valkuilen in README.md). weekdays:[7] bestaat niet, dus die beurt komt nooit op.
function gezin({ eigen = null, days = {}, diamonds = {}, vrij = null, kids = 2, rewards = null } = {}){
  const members = {
    [PARENT]: { rol: 'ouder', weergavenaam: 'Ouder', kleur: '#185FA5', actief: true },
    [KID]: { rol: 'kind', weergavenaam: 'Lien', gebruikersnaam: 'lien', kleur: '#B5006E', actief: true }
  };
  const tasks = { t1: { label: 'Afwas', recurring: true, order: 0, members: [KID] } };
  if (kids > 1){
    members[KID2] = { rol: 'kind', weergavenaam: 'Jonas', gebruikersnaam: 'jonas', kleur: '#1D9E75', actief: true };
    tasks.t2 = { label: 'Tafel dekken', recurring: true, order: 1, members: [KID2] };
    tasks.t3 = { label: 'Kattenbak', recurring: true, order: 2, members: [KID] };
  }
  return {
    meta: { naam: 'Testgezin', code: 'ABC123' },
    members,
    settings: {
      streakStart: dk(-20), tasks,
      shifts: { s0: { name: 'Nooit', weekdays: [7], lines: ['x'], members: [KID] } },
      ...(vrij ? { vrijeDagen: vrij } : {}),
      ...(rewards ? { rewards } : {})
    },
    streaks: {
      [KID]: { days, diamonds, ...(eigen ? { eigenTaken: eigen } : {}) },
      ...(kids > 1 ? { [KID2]: { days: {}, diamonds: {} } } : {})
    }
  };
}

// Buiten ?test staat de boom in de wortel; in ?test prefixt BASE_ROOT álles met 'test/'.
function boom(fam, sandbox){
  const kern = {
    families: { [FID]: fam },
    userIndex: { [PARENT]: FID, [KID]: FID, [KID2]: FID },
    familyCodes: { ABC123: FID }
  };
  return sandbox ? { test: kern } : kern;
}

// Vier dagen op rij afgewerkt, zodat de streak-strook en de 💎-chip iets te tonen hebben.
const REEKS = { days: Object.fromEntries([-4, -3, -2, -1].map(n => [dk(n), true])),
                diamonds: Object.fromEntries([-4, -3, -2, -1].map(n => [dk(n), 1])) };

const EIGEN_KLUSJES = {
  e1: { label: 'Boek lezen (20 min)', order: 1, gedaanOp: { [dk(0)]: true } },
  e2: { label: 'Gitaar oefenen', order: 2 },
  e3: { label: 'Zwemzak klaarzetten', order: 3, onDay: dk(0) }
};

const SCENARIOS = {
  // 📝 v21 — kaart met eigen klusjes (één afgevinkt) naast de gewone klusjes; het tweede
  // kind heeft er nog geen, zodat je ook de rustige lege variant ziet.
  eigen: {
    seed: boom(gezin({ eigen: EIGEN_KLUSJES, ...REEKS }), false),
    user: PARENT
  },
  // 🧪 v21.1 — de testbalk in ?test, op de echte datum.
  testbar: {
    seed: boom(gezin({ eigen: { e2: { label: 'Gitaar oefenen', order: 2 } }, kids: 1 }), true),
    user: PARENT,
    query: 'test'
  },
  // 🧪 v21.1 — dezelfde balk met de klok verzet: het veld hoort op te kleuren en het
  // dagscherm hoort op de gekozen dag te staan.
  'testbar-verzet': {
    seed: boom(gezin({ eigen: { e2: { label: 'Gitaar oefenen', order: 2 } }, kids: 1 }), true),
    user: PARENT,
    query: 'test',
    stappen: async page => {
      await page.evaluate(d => window.setTestToday(d), iso(shift(-9)));
      await page.waitForTimeout(400);
    }
  },
  // 💎 v21.3 — Beheer → Beloningen, opengeklapt: de catalogus met onderaan het bijsturen van
  // de saldo's (dat stond tot v21.2 bij Instellingen).
  'beheer-beloningen': {
    seed: boom(gezin({
      ...REEKS,
      rewards: {
        r1: { naam: 'Filmavond', omschrijving: 'zelf de film kiezen', diamanten: 10, order: 1, icoon: 'film' },
        r2: { naam: 'Uitslapen', omschrijving: '', diamanten: 4, order: 2 }
      }
    }), false),
    user: PARENT,
    waitFor: '.card',
    stappen: async page => {
      await page.evaluate(() => window.openAdmin());
      await page.waitForTimeout(250);
      await page.evaluate(() => window.toggleAdminRow('sec:beloningen'));
      await page.waitForTimeout(350);
    }
  },
  // 🏖️ v20 — vakantiedag: banner i.p.v. klusjes, met de reeks-strook die blijft staan.
  vakantie: {
    seed: boom(gezin({ eigen: EIGEN_KLUSJES, ...REEKS, vrij: { [dk(0)]: { [KID]: true } } }), false),
    user: PARENT
  }
};

const THEMAS = { licht: 'light', donker: 'dark' };

(async () => {
  const args = process.argv.slice(2);
  const uitArg = args.find(a => a.startsWith('--uit='));
  const los = args.filter(a => !a.startsWith('--'));
  const uit = uitArg ? uitArg.slice(6) : path.join(__dirname, 'screenshots');

  const namen = los.filter(a => SCENARIOS[a]);
  const themas = los.filter(a => THEMAS[a]);
  const onbekend = los.filter(a => !SCENARIOS[a] && !THEMAS[a]);
  if (onbekend.length){
    console.error(`Onbekend: ${onbekend.join(', ')}`);
    console.error(`Scenario's: ${Object.keys(SCENARIOS).join(', ')} — thema's: ${Object.keys(THEMAS).join(', ')}`);
    process.exit(1);
  }

  const teDoen = namen.length ? namen : Object.keys(SCENARIOS);
  const teThemas = themas.length ? themas : Object.keys(THEMAS);
  fs.mkdirSync(uit, { recursive: true });

  const browser = await launchBrowser();
  for (const naam of teDoen){
    const s = SCENARIOS[naam];
    for (const thema of teThemas){
      const { page } = await openApp(browser, {
        seed: s.seed, user: s.user, query: s.query || '', waitFor: s.waitFor || '.card'
      });
      await page.emulateMedia({ colorScheme: THEMAS[thema] });
      await page.setViewportSize({ width: 420, height: 900 });
      if (s.stappen) await s.stappen(page);
      await page.waitForTimeout(400);
      const bestand = path.join(uit, `${naam}-${thema}.png`);
      await page.screenshot({ path: bestand, fullPage: true });
      console.log('✅ ' + bestand);
      await page.close();
    }
  }
  await browser.close();
})();
