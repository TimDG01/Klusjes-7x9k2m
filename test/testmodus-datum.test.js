// v21.1 — 🧪 De testbalk: in ?test mag je "vandaag" zelf kiezen, zodat je reeksen,
// vakanties en beurten over meerdere dagen kunt uitproberen zonder te wachten.
// Twee dingen worden hier vastgezet: (1) de verzette klok werkt overal consequent door
// (dagscherm, isToday, reeks, diamant), en (2) buiten ?test bestaat de hele feature niet.
const { launchBrowser, openApp } = require('./fake-firebase.js');
const { section, check, done } = require('./assert.js');

const FID = 'f1', PARENT = 'p1', KID = 'k1';

const dayKey = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const shift = n => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
const dk = n => dayKey(shift(n));
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function gezin({ days = {}, diamonds = {} } = {}){
  return {
    meta: { naam: 'Testgezin', code: 'ABC123' },
    members: {
      [PARENT]: { rol: 'ouder', weergavenaam: 'Ouder', kleur: '#185FA5', actief: true },
      [KID]: { rol: 'kind', weergavenaam: 'Kind', gebruikersnaam: 'kind', kleur: '#B5006E', actief: true }
    },
    settings: {
      streakStart: dk(-20),
      tasks: { t1: { label: 'Afwas', recurring: true, order: 0, members: [KID] } },
      // De shifts-node moet BESTAAN, anders zaait de app DEFAULT_SHIFTS ("Stofzuigen", ma+vr)
      // erin en duikt er op sommige weekdagen een tweede rij op — dan is de dag nooit af en
      // wordt de test flaky naargelang de dag waarop de suite draait. `weekdays: [7]` is een
      // onbestaande weekdag (getDay is 0..6): de node bestaat, maar levert nooit een beurt op.
      shifts: { s0: { name: 'Nooit', weekdays: [7], lines: ['x'], members: [KID] } }
    },
    streaks: { [KID]: { days, diamonds } }
  };
}

// In ?test prefixt BASE_ROOT álles met 'test/', dus de seed nestelt onder `test`.
const sandboxSeed = opts => ({
  test: { families: { [FID]: gezin(opts) }, userIndex: { [PARENT]: FID, [KID]: FID }, familyCodes: { ABC123: FID } }
});
const echtSeed = opts => ({
  families: { [FID]: gezin(opts) }, userIndex: { [PARENT]: FID, [KID]: FID }, familyCodes: { ABC123: FID }
});

const streaksVan = page => page.evaluate(([f, k]) => {
  const s = ((window.__store.root.test.families[f].streaks) || {})[k] || {};
  return { days: s.days || {}, diamonds: s.diamonds || {} };
}, [FID, KID]);

const kopdatum = page => page.locator('.nav .fulldate').innerText();

(async () => {
  const browser = await launchBrowser();

  section('1. Buiten ?test bestaat de testbalk niet');
  {
    const { page } = await openApp(browser, { seed: echtSeed(), user: PARENT, waitFor: '.task' });
    check('geen testbalk', await page.locator('.testbar').count(), 0);
    check('  geen datumveld', await page.locator('#testdate').count(), 0);
    check('  setTestToday is een no-op', await page.evaluate(() => {
      window.setTestToday('2026-07-01');
      return document.querySelector('.nav .fulldate').innerText;
    }), await page.evaluate(() => {
      const d = new Date();
      return d.getDate() + ' ' + ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'][d.getMonth()];
    }));
    check('  en de footer-markering blijft weg', await page.locator('.testmode').count(), 0);
    await page.close();
  }

  section('2. In ?test staat de balk bovenaan, op de echte datum');
  {
    const { page } = await openApp(browser, { seed: sandboxSeed(), user: PARENT, waitFor: '.task', query: 'test' });
    check('de balk staat er', await page.locator('.testbar').count(), 1);
    check('  met een datumveld op vandaag', await page.locator('#testdate').inputValue(), iso(shift(0)));
    check('  nog niet verzet (geen kleurmarkering)',
      await page.evaluate(() => document.getElementById('testbar').classList.contains('shifted')), false);
    check('  de balk staat buiten #app', await page.locator('#app .testbar').count(), 0);
    check('  en de footer zegt nog steeds TESTMODUS', await page.locator('.testmode').count(), 1);
    await page.close();
  }

  section('3. De klok verzetten verplaatst "vandaag" in de hele app');
  {
    const { page } = await openApp(browser, { seed: sandboxSeed(), user: PARENT, waitFor: '.task', query: 'test' });
    await page.evaluate(d => window.setTestToday(d), iso(shift(-5)));
    await page.waitForTimeout(350);
    const verwacht = `${shift(-5).getDate()} ${new Intl.DateTimeFormat('nl', { month: 'long' }).format(shift(-5))}`;
    check('het dagscherm springt naar de gekozen dag', await kopdatum(page), verwacht);
    check('  "Ga naar vandaag" is weg (we staan er al op)', await page.locator('.today-btn').count(), 0);
    check('  het veld is opgekleurd',
      await page.evaluate(() => document.getElementById('testbar').classList.contains('shifted')), true);

    // vooruit bladeren mag nu wél: die dagen liggen vóór de echte datum maar ná de gesimuleerde
    await page.evaluate(() => window.changeDay(1));
    await page.waitForTimeout(250);
    check('een dag verder is nu "morgen" → wél een terug-knop', await page.locator('.today-btn').count(), 1);
    await page.close();
  }

  section('4. De diamant volgt de verzette klok (writeCompletionFlag)');
  {
    // Afvinken op een dag die in werkelijkheid verleden tijd is, maar die de app als
    // "vandaag" beschouwt: dat hoort een diamant op te leveren.
    const { page } = await openApp(browser, { seed: sandboxSeed(), user: PARENT, waitFor: '.task', query: 'test' });
    await page.evaluate(d => window.setTestToday(d), iso(shift(-5)));
    await page.waitForTimeout(350);
    await page.locator('.task').first().click();
    await page.waitForTimeout(400);
    const s = await streaksVan(page);
    check('voltooiingsvlag op de gesimuleerde dag', s.days[dk(-5)], true);
    check('  en een diamant (de poort kijkt naar todayDate)', s.diamonds[dk(-5)], 1);
    await page.close();
  }

  section('5. De reeks rekent tot de gesimuleerde dag, niet tot de echte');
  {
    // Zeven afgewerkte dagen die eindigen op dag -5. Met de echte klok liggen daarna vier
    // gemiste dagen (-4..-1) → reeks gebroken. Zet je "vandaag" op -4, dan bestaan die
    // gemiste dagen nog niet: -4 is dan "vandaag, nog bezig" en breekt niets → reeks 7.
    // (Bewust -4 en niet -5: op de gesimuleerde dag zélf haalt render() een onverdiende
    // vlag terecht weer weg, want dan is die dag "vandaag" en nog niet af.)
    const dagen = {}; for (let i = -11; i <= -5; i++) dagen[dk(i)] = true;
    const opts = { days: dagen };

    const a = await openApp(browser, { seed: sandboxSeed(opts), user: PARENT, waitFor: '.task', query: 'test' });
    check('met de echte klok is de reeks gebroken',
      (await a.page.locator('.streak-flame').first().innerText()).trim(), '🔥 0');
    await a.page.close();

    const b = await openApp(browser, { seed: sandboxSeed(opts), user: PARENT, waitFor: '.task', query: 'test' });
    await b.page.evaluate(d => window.setTestToday(d), iso(shift(-4)));
    await b.page.waitForTimeout(400);
    check('met de klok op dag -4 staat de reeks op 7',
      (await b.page.locator('.streak-flame').first().innerText()).trim(), '🔥 7');
    await b.page.close();
  }

  section('6. Terugzetten, en de keuze overleeft een herlaad');
  {
    const { page } = await openApp(browser, { seed: sandboxSeed(), user: PARENT, waitFor: '.task', query: 'test' });
    await page.evaluate(d => window.setTestToday(d), iso(shift(-5)));
    await page.waitForTimeout(300);
    check('bewaard in localStorage', await page.evaluate(() => localStorage.getItem('klusjes-test-today')), dk(-5));

    await page.reload();
    await page.waitForSelector('.task', { timeout: 10000 });
    check('na een herlaad staat de klok nog verzet', await page.locator('#testdate').inputValue(), iso(shift(-5)));

    await page.locator('.testbar-reset').click();
    await page.waitForTimeout(300);
    check('↺ zet de echte datum terug', await page.locator('#testdate').inputValue(), iso(shift(0)));
    check('  localStorage is opgeruimd', await page.evaluate(() => localStorage.getItem('klusjes-test-today')), null);
    check('  en de kleurmarkering is weg',
      await page.evaluate(() => document.getElementById('testbar').classList.contains('shifted')), false);
    await page.close();
  }

  await browser.close();
  done();
})();
