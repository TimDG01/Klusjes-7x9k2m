// v20 — 🏖️ Vrije dagen (vakantie). Draait de echte index.html tegen de nep-Firebase-SDK.
// Kern van het ontwerp: settings/vrijeDagen/{dayKey}/{uid} maakt van die dag een dag die
// niet in het schema bestaat — geen klusjes, geen diamant, geen beurt — terwijl de reeks
// er overheen stapt zonder te tellen én zonder te breken.
const { launchBrowser, openApp } = require('./fake-firebase.js');
const { section, check, done } = require('./assert.js');

const FID = 'f1', PARENT = 'p1', KID = 'k1', KID2 = 'k2';

const dayKey = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const shift = n => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
const dk = n => dayKey(shift(n));

// vrij[dagIndex] = [uids] → { '2026-8-3': { k1: true } }
function vrijeDagen(vrij){
  const out = {};
  Object.keys(vrij).forEach(n => {
    out[dk(Number(n))] = {};
    vrij[n].forEach(uid => { out[dk(Number(n))][uid] = true; });
  });
  return out;
}

// Gezin met één dagelijkse taak per kind; alles verder per test aan te vullen.
function seed({ vrij = null, kids = 1, streakStart = dk(0), days = {}, diamonds = {}, shifts = null } = {}){
  const members = {
    [PARENT]: { rol: 'ouder', weergavenaam: 'Ouder', kleur: '#185FA5', actief: true },
    [KID]: { rol: 'kind', weergavenaam: 'Kind', gebruikersnaam: 'kind', kleur: '#B5006E', actief: true }
  };
  if (kids > 1) members[KID2] = { rol: 'kind', weergavenaam: 'Zus', gebruikersnaam: 'zus', kleur: '#1D9E75', actief: true };
  const tasks = { t1: { label: 'Afwas', recurring: true, order: 0, members: [KID] } };
  if (kids > 1) tasks.t2 = { label: 'Tafel dekken', recurring: true, order: 1, members: [KID2] };
  return {
    families: { [FID]: {
      meta: { naam: 'Testgezin', code: 'ABC123' },
      members,
      settings: {
        streakStart, tasks,
        // Geen eigen beurt meegegeven? Dan tóch een node zetten, anders zaait de app
        // DEFAULT_SHIFTS erin ("Stofzuigen", ma+vr) en staat er op maandag en vrijdag een
        // extra rij op de kaart. weekdays:[7] is een onbestaande weekdag (getDay is 0..6):
        // de node bestaat, maar levert nooit een beurt op. Zie de seed-valkuilen in README.md.
        shifts: shifts || { s0: { name: 'Nooit', weekdays: [7], lines: ['x'], members: [KID] } },
        ...(vrij ? { vrijeDagen: vrij } : {})
      },
      streaks: { [KID]: { days, diamonds } }
    }},
    userIndex: { [PARENT]: FID, [KID]: FID, ...(kids > 1 ? { [KID2]: FID } : {}) },
    familyCodes: { ABC123: FID }
  };
}

// Rauw uitlezen zoals de database het bewaart (een lege dag-node telt als "niet vrij",
// net als in de echte RTDB waar een lege node verdwijnt).
const leesVrij = (page, key, uid) => page.evaluate(([f, k, u]) => {
  const v = (((window.__store.root.families[f].settings || {}).vrijeDagen) || {})[k];
  return !!(v && v[u]);
}, [FID, key, uid]);

const streaksVan = page => page.evaluate(([f, k]) => {
  const s = (window.__store.root.families[f].streaks || {})[k] || {};
  return { days: s.days || {}, diamonds: s.diamonds || {} };
}, [FID, KID]);

const shiftTaken = page => page.evaluate(f =>
  Object.keys((window.__store.root.families[f].settings || {}).tasks || {}).filter(id => id.startsWith('shift-s1-')).length
, FID);

const open = (browser, opts, user, waitFor = '.card') =>
  openApp(browser, { seed: seed(opts), user, waitFor });

(async () => {
  const browser = await launchBrowser();

  section('1. Dagscherm — een vrije dag verbergt de klusjes');
  {
    const { page } = await open(browser, {}, PARENT);
    check('gewone dag: de taak staat er', await page.locator('.task').count(), 1);
    check('  geen vakantiebanner', await page.locator('.free-note').count(), 0);
    check('  geen vakantiebalk bovenaan', await page.locator('.free-bar').count(), 0);
    await page.close();
  }
  {
    const { page } = await open(browser, { vrij: vrijeDagen({ 0: [KID] }) }, PARENT);
    check('vrije dag: geen enkele klusjesrij', await page.locator('.task').count(), 0);
    check('  de kaart toont de vakantiebanner', await page.locator('.free-note').count(), 1);
    check('  iedereen vrij → vakantiebalk i.p.v. voortgang', await page.locator('.free-bar').count(), 1);
    check('  de reeks-strook blijft staan', await page.locator('.streak-strip').count(), 1);
    await page.close();
  }
  {
    // twee kinderen, één vrij: de ander werkt gewoon door en de voortgangsbalk blijft
    const { page } = await open(browser, { kids: 2, vrij: vrijeDagen({ 0: [KID] }) }, PARENT);
    check('enkel het vrije kind verliest zijn rijen', await page.locator('.task').count(), 1);
    check('  voortgang telt enkel het werkende kind', await page.locator('.progress-label').innerText(), 'Voortgang\n0/1');
    check('  geen vakantiebalk zolang niet iedereen vrij is', await page.locator('.free-bar').count(), 0);
    await page.close();
  }

  section('2. De reeks stapt over een vakantie heen (het hart van de feature)');
  {
    // dag -10 t/m -4 afgewerkt (7 op rij), dan drie gemiste dagen
    const dagen = {}; for (let i = -10; i <= -4; i++) dagen[dk(i)] = true;
    const { page } = await open(browser, { streakStart: dk(-10), days: dagen }, PARENT);
    check('zonder vrije dagen breekt de reeks', (await page.locator('.streak-flame').first().innerText()).trim(), '🔥 0');
    await page.close();

    const vrij = vrijeDagen({ '-3': [KID], '-2': [KID], '-1': [KID] });
    const r = await open(browser, { streakStart: dk(-10), days: dagen, vrij }, PARENT);
    check('met vrije dagen blijft de reeks staan', (await r.page.locator('.streak-flame').first().innerText()).trim(), '🔥 7');
    await r.page.close();
  }

  section('3. Diamanten: niets nieuws op een vrije dag, niets kwijt');
  {
    const { page } = await open(browser, { vrij: vrijeDagen({ 0: [KID] }) }, PARENT);
    await page.waitForTimeout(300);
    const s = await streaksVan(page);
    check('geen voltooiingsvlag voor een vrije dag', Object.keys(s.days).length, 0);
    check('geen diamant voor een vrije dag', Object.keys(s.diamonds).length, 0);
    await page.close();
  }
  {
    // vandaag was al afgewerkt (vlag + diamant) en wordt daarná vrij gezet
    const { page } = await open(browser, {
      vrij: vrijeDagen({ 0: [KID] }), days: { [dk(0)]: true }, diamonds: { [dk(0)]: 1 }
    }, PARENT);
    await page.waitForTimeout(300);
    const s = await streaksVan(page);
    check('een al verdiende vlag blijft staan', s.days[dk(0)], true);
    check('een al verdiende diamant blijft staan', s.diamonds[dk(0)], 1);
    check('  en die dag telt gewoon mee voor de reeks', (await page.locator('.streak-flame').first().innerText()).trim(), '🔥 1');
    await page.close();
  }

  section('4. Beurt-taken vervallen niet tijdens de vakantie');
  const beurt = extra => ({ s1: { name: 'Stofzuigen', weekdays: [0,1,2,3,4,5,6], lines: ['boven'], members: [KID], next: { uid: KID, lineIdx: 0 }, lastDone: dk(-5), ...extra } });
  {
    const { page } = await open(browser, { shifts: beurt() }, PARENT);
    await page.waitForTimeout(600);
    check('regressie: een vergeten beurt wordt wél losgemaakt', await shiftTaken(page) > 0, true);
    await page.close();
  }
  {
    const vrij = vrijeDagen({ '-4': [KID], '-3': [KID], '-2': [KID], '-1': [KID], 0: [KID] });
    const { page } = await open(browser, { shifts: beurt(), vrij }, PARENT);
    await page.waitForTimeout(600);
    check('tijdens de vakantie wordt er niets losgemaakt', await shiftTaken(page), 0);
    const sh = await page.evaluate(f => window.__store.root.families[f].settings.shifts.s1, FID);
    check('  de beurt blijft bij hetzelfde kind', sh.next.uid, KID);
    check('  en de rotatie schuift niet door', sh.lastDone, dk(-5));
    await page.evaluate(() => window.changeDay(1));
    await page.waitForTimeout(250);
    check('  de beurt duikt op de eerste dag ná de vakantie op',
      await page.locator('.task', { hasText: 'Stofzuigen' }).count(), 1);
    await page.close();
  }

  section('5. De 🏖️-knop op het dagscherm is ouder-only');
  {
    const { page } = await open(browser, {}, PARENT, '.task');
    check('de ouder ziet de knop', await page.locator('.free-btn').count(), 1);
    await page.locator('.free-btn').first().click();
    await page.waitForTimeout(250);
    check('tikken zet de dag vrij', await leesVrij(page, dk(0), KID), true);
    check('  de klusjes verdwijnen meteen', await page.locator('.task').count(), 0);
    await page.locator('.free-btn').first().click();
    await page.waitForTimeout(250);
    check('nog eens tikken maakt er weer een gewone dag van', await leesVrij(page, dk(0), KID), false);
    check('  de klusjes staan er weer', await page.locator('.task').count(), 1);
    await page.close();
  }
  {
    const { page } = await open(browser, {}, KID, '.task');
    check('een kind ziet de knop niet', await page.locator('.free-btn').count(), 0);
    await page.evaluate(u => window.toggleVrijeDag(u), KID);
    await page.waitForTimeout(200);
    check('  en kan een dag ook niet zelf vrij zetten', await leesVrij(page, dk(0), KID), false);
    await page.close();
  }

  section('6. Elke dag apart, en Beheer blijft ongemoeid');
  {
    // meerdere dagen na elkaar vrij zetten via de dagknop (er is bewust geen beheerscherm)
    const { page } = await open(browser, { kids: 2 }, PARENT, '.task');
    for (const n of [0, 1, 2]){
      if (n) await page.evaluate(() => window.changeDay(1));
      await page.waitForTimeout(200);
      await page.locator('.free-btn').first().click();   // enkel het eerste kind
      await page.waitForTimeout(200);
    }
    for (const n of [0, 1, 2]) check(`dag +${n} staat vrij`, await leesVrij(page, dk(n), KID), true);
    check('  en het tweede kind blijft gewoon doorwerken', await leesVrij(page, dk(2), KID2), false);

    await page.evaluate(() => window.openAdmin());
    await page.waitForTimeout(250);
    check('Beheer telt nog altijd vijf secties', await page.locator('.admin-group-head').count(), 5);
    check('  geen vakantiesectie', (await page.locator('#app').textContent()).includes('Vakantie'), false);
    await page.close();
  }

  await browser.close();
  done();
})();
