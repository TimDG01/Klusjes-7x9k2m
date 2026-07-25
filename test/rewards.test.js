// v19 — 💎 diamanten verdienen. Draait de echte index.html tegen de nep-Firebase-SDK.
// Kern van het ontwerp: diamanten worden per dag WEGGESCHREVEN, niet berekend.
const { launchBrowser, openApp } = require('./fake-firebase.js');
const { section, check, done } = require('./assert.js');

const FID = 'f1', PARENT = 'p1', KID = 'k1';

const dayKey = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const shift = n => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
const dk = n => dayKey(shift(n));

// gezin met één dagelijkse taak voor het kind; extra's per test aan te vullen
function seed({ streakStart = dk(-1), days = {}, diamonds = {}, claims = {}, checks = {} } = {}){
  return {
    families: { [FID]: {
      meta: { naam: 'Testgezin', code: 'ABC123' },
      members: {
        [PARENT]: { rol: 'ouder', weergavenaam: 'Ouder', kleur: '#185FA5', actief: true },
        [KID]: { rol: 'kind', weergavenaam: 'Kind', kleur: '#B5006E', actief: true }
      },
      settings: {
        streakStart,
        tasks: { t1: { label: 'Afwas', recurring: true, order: 0, members: [KID] } },
        ...(Object.keys(claims).length ? { rewardClaims: claims } : {})
      },
      streaks: { [KID]: { days, diamonds } },
      ...(Object.keys(checks).length ? { days: checks } : {})
    }},
    userIndex: { [PARENT]: FID, [KID]: FID },
    familyCodes: { ABC123: FID }
  };
}

const ledger = page => page.evaluate(([f, k]) => {
  const s = window.__store.root.families[f].streaks || {};
  return (s[k] && s[k].diamonds) || {};
}, [FID, KID]);
const badges = page => page.evaluate(([f, k]) => {
  const s = window.__store.root.families[f].streaks || {};
  return Object.keys((s[k] && s[k].badges) || {}).length;
}, [FID, KID]);

// De vieringspopup legt zich over de kaart zodra een dag compleet is; net als een
// gebruiker klikken we ze eerst weg ("Toppie") voor we de volgende rij aantikken.
async function tap(page, label){
  const close = page.locator('.celebration-close');
  if (await close.count()) await close.first().click();
  await page.locator('.task', { hasText: label }).first().click();
  await page.waitForTimeout(150);
}

(async () => {
  const browser = await launchBrowser();

  section('1. Verdienen: een nieuw voltooide dag schrijft één diamant weg');
  {
    const { page } = await openApp(browser, { seed: seed(), user: KID });
    check('vooraf leeg', JSON.stringify(await ledger(page)), '{}');
    await tap(page, 'Afwas');
    check('na voltooien 1 diamant voor vandaag', (await ledger(page))[dk(0)], 1);
    // opnieuw renderen mag niets veranderen (dag-gesleuteld = idempotent)
    await page.evaluate(() => window.changeDay(-1));
    await page.evaluate(() => window.goToday());
    await page.waitForTimeout(200);
    const led = await ledger(page);
    check('opnieuw renderen verandert niets', led[dk(0)], 1);
    check('en er staat maar één regel', Object.keys(led).length, 1);
    await page.close();
  }

  section('2. Een dag die al vóór v19 voltooid was krijgt niets (start op 0)');
  {
    // gisteren staat als voltooid geregistreerd, maar zonder diamant-regel
    const { page } = await openApp(browser, { seed: seed({ days: { [dk(-1)]: true } }), user: KID });
    await page.waitForTimeout(200);
    check('geen diamant met terugwerkende kracht', JSON.stringify(await ledger(page)), '{}');
    await page.close();
  }

  section('3. Een badgedag levert 1 + 3 = 4 diamanten op');
  {
    // 6 voorgaande dagen al voltooid → het afvinken van vandaag is dag 7 → badge
    const days = {};
    for (let i = -6; i <= -1; i++) days[dk(i)] = true;
    const { page } = await openApp(browser, { seed: seed({ streakStart: dk(-6), days }), user: KID });
    await tap(page, 'Afwas');
    check('badge verdiend', await badges(page), 1);
    check('4 diamanten op de badgedag', (await ledger(page))[dk(0)], 4);
    await page.close();
  }

  section('4. Aanvinken en weer uitvinken levert netto niets op');
  {
    const { page } = await openApp(browser, { seed: seed(), user: KID });
    await tap(page, 'Afwas');
    check('diamant verschijnt', (await ledger(page))[dk(0)], 1);
    await tap(page, 'Afwas');                      // uitvinken
    check('diamant verdwijnt weer', (await ledger(page))[dk(0)], undefined);
    await tap(page, 'Afwas');                      // opnieuw voltooien
    const led = await ledger(page);
    check('opnieuw voltooien geeft er weer één', led[dk(0)], 1);
    check('nooit twee', Object.keys(led).length, 1);
    await page.close();
  }

  section('5. Een badgedag blijft na uitvinken-en-hervinken op 4 staan');
  {
    const days = {};
    for (let i = -6; i <= -1; i++) days[dk(i)] = true;
    const { page } = await openApp(browser, { seed: seed({ streakStart: dk(-6), days }), user: KID });
    await tap(page, 'Afwas');
    await tap(page, 'Afwas');
    await tap(page, 'Afwas');
    // de badge is permanent, dus newRanks is nu leeg — de earnDays-formule houdt de 4
    check('nog steeds 4 (earnDays-formule, niet newRanks)', (await ledger(page))[dk(0)], 4);
    check('en nog steeds één badge', await badges(page), 1);
    await page.close();
  }

  section('6. Op een voorbije dag wordt de diamant nooit weggehaald');
  {
    const { page } = await openApp(browser, {
      seed: seed({
        streakStart: dk(-3),
        days: { [dk(-1)]: true },
        diamonds: { [dk(-1)]: 1 },
        checks: { [dk(-1)]: { checks: { [KID]: { t1: true } } } }
      }), user: KID });
    await page.evaluate(() => window.changeDay(-1));
    await page.waitForTimeout(200);
    await tap(page, 'Afwas');                      // uitvinken op gisteren
    check('diamant van gisteren blijft staan', (await ledger(page))[dk(-1)], 1);
    await page.close();
  }

  section('7. Een al uitgegeven diamant kan niet teruggenomen worden');
  {
    const { page } = await openApp(browser, {
      seed: seed({ claims: { c1: { uid: KID, rewardId: 'r1', naam: 'Filmavond', diamanten: 1, dag: dk(-1) } } }),
      user: KID });
    await tap(page, 'Afwas');
    check('diamant verdiend', (await ledger(page))[dk(0)], 1);
    await tap(page, 'Afwas');                      // uitvinken zou het saldo negatief maken
    check('blijft staan (saldo mag niet onder 0)', (await ledger(page))[dk(0)], 1);
    await page.close();
  }

  section('8. De reeks-startdatum verzetten verandert het saldo niet');
  {
    const { page } = await openApp(browser, { seed: seed(), user: KID });
    await tap(page, 'Afwas');
    const voor = JSON.stringify(await ledger(page));
    await page.evaluate(([f, d]) => {
      window.__store.root.families[f].settings.streakStart = d;
      window.__flushDb();
    }, [FID, dk(-30)]);
    await page.waitForTimeout(250);
    check('grootboek ongewijzigd', JSON.stringify(await ledger(page)), voor);
    await page.close();
  }

  await browser.close();
  done();
})();
