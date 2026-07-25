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

  section('9. Beheer: beloningen aanmaken en bewerken (ouder-only)');
  {
    const rewards = { r1: { naam: 'Filmavond', omschrijving: 'Jij kiest', diamanten: 5, order: 1 } };
    const s = seed(); s.families[FID].settings.rewards = rewards;
    const { page } = await openApp(browser, { seed: s, user: PARENT });
    await page.evaluate(() => window.openAdmin());
    await page.waitForTimeout(150);
    check('beloning staat in Beheer', await page.locator('.admin-collapse-head', { hasText: 'Filmavond' }).count(), 1);
    check('samenvatting toont de prijs', await page.locator('.admin-collapse-sub', { hasText: '5 💎' }).count(), 1);

    // toevoegen via de prompt-reeks: naam, omschrijving, prijs
    const antwoorden = ['Pretpark', 'Een dagje uit', '40'];
    await page.evaluate(a => { let i = 0; window.prompt = () => a[i++]; }, antwoorden);
    await page.evaluate(() => window.addReward());
    await page.waitForTimeout(150);
    const na = await page.evaluate(f => window.__store.root.families[f].settings.rewards, FID);
    const nieuw = Object.values(na).find(r => r.naam === 'Pretpark');
    check('beloning toegevoegd', !!nieuw, true);
    check('met de juiste prijs', nieuw && nieuw.diamanten, 40);

    // prijs wijzigen
    await page.evaluate(() => { window.prompt = () => '7'; });
    await page.evaluate(() => window.editRewardCost('r1'));
    await page.waitForTimeout(150);
    check('prijs gewijzigd', (await page.evaluate(f => window.__store.root.families[f].settings.rewards.r1, FID)).diamanten, 7);

    // een ongeldige prijs wordt geweigerd
    await page.evaluate(() => { window.prompt = () => '0'; });
    await page.evaluate(() => window.editRewardCost('r1'));
    await page.waitForTimeout(150);
    check('ongeldige prijs geweigerd', (await page.evaluate(f => window.__store.root.families[f].settings.rewards.r1, FID)).diamanten, 7);
    await page.close();
  }

  section('10. Verwijderen: geschiedenis en saldo blijven kloppen, afbeelding gaat mee');
  {
    const s = seed({ claims: { c1: { uid: KID, rewardId: 'r1', naam: 'Filmavond', diamanten: 5, dag: dk(-1) } },
                     diamonds: { [dk(-1)]: 4, [dk(-2)]: 4 } });
    s.families[FID].settings.rewards = { r1: { naam: 'Filmavond', omschrijving: '', diamanten: 5, order: 1 } };
    s.families[FID].settings.rewardImages = { r1: 'data:image/jpeg;base64,AAAA' };
    const { page } = await openApp(browser, { seed: s, user: PARENT });
    await page.evaluate(() => { window.confirm = () => true; });
    await page.evaluate(() => window.deleteReward('r1'));
    await page.waitForTimeout(200);
    const st = await page.evaluate(f => window.__store.root.families[f].settings, FID);
    check('beloning weg', !!(st.rewards && st.rewards.r1), false);
    check('afbeelding mee weg', !!(st.rewardImages && st.rewardImages.r1), false);
    check('claim blijft in de geschiedenis', st.rewardClaims.c1.naam, 'Filmavond');
    check('met zijn bevroren prijs', st.rewardClaims.c1.diamanten, 5);
    await page.close();
  }

  section('11. Diamanten bijsturen (verificatie 4, verschoven van fase 2)');
  {
    const { page } = await openApp(browser, { seed: seed({ diamonds: { [dk(-1)]: 4 } }), user: PARENT });
    await page.evaluate(() => { window.prompt = () => '3'; });
    await page.evaluate(([k]) => window.adjustDiamonds(k), [KID]);
    await page.waitForTimeout(150);
    let led = await ledger(page);
    check('bonusregel toegevoegd', Object.keys(led).filter(k => k.startsWith('bonus-')).length, 1);
    check('dagregel onaangeroerd', led[dk(-1)], 4);

    await page.evaluate(() => { window.prompt = () => '-2'; });
    await page.evaluate(([k]) => window.adjustDiamonds(k), [KID]);
    await page.waitForTimeout(150);
    led = await ledger(page);
    const som = Object.values(led).reduce((a, b) => a + Number(b), 0);
    check('aftrekken kan ook (4 + 3 - 2)', som, 5);
    check('en blijft als aparte regel zichtbaar', Object.keys(led).length, 3);
    await page.close();
  }

  section('12. Een kind kan de catalogus niet wijzigen');
  {
    const s = seed(); s.families[FID].settings.rewards = { r1: { naam: 'Filmavond', omschrijving: '', diamanten: 5, order: 1 } };
    const { page } = await openApp(browser, { seed: s, user: KID });
    await page.evaluate(() => { window.prompt = () => 'Gehackt'; window.confirm = () => true; });
    await page.evaluate(() => { window.addReward(); window.renameReward('r1'); window.deleteReward('r1'); });
    await page.waitForTimeout(200);
    const rw = await page.evaluate(f => window.__store.root.families[f].settings.rewards, FID);
    check('niets toegevoegd', Object.keys(rw).length, 1);
    check('niets hernoemd of verwijderd', rw.r1.naam, 'Filmavond');
    await page.evaluate(([k]) => window.adjustDiamonds(k), [KID]);
    await page.waitForTimeout(150);
    check('en geen diamanten bijgeboekt', JSON.stringify(await ledger(page)), '{}');
    await page.close();
  }

  section('13. Beloningsscherm: saldo, betaalbaar vs nog te sparen');
  {
    const s = seed({ diamonds: { [dk(-1)]: 4, [dk(-2)]: 1 } });   // saldo 5
    s.families[FID].settings.rewards = {
      r1: { naam: 'Filmavond', omschrijving: 'Jij kiest', diamanten: 5, order: 1 },
      r2: { naam: 'Pretpark', omschrijving: '', diamanten: 40, order: 2 }
    };
    const { page } = await openApp(browser, { seed: s, user: KID });
    await page.locator('.diamond-chip').first().click();
    await page.waitForTimeout(200);
    check('chip opent de winkel', await page.locator('.admin-title', { hasText: 'Beloningen' }).count(), 1);
    check('saldo in de kop', await page.locator('.admin-role-title', { hasText: '5 💎' }).count(), 1);
    check('twee kaarten', await page.locator('.badge-card').count(), 2);
    const film = page.locator('.badge-card', { hasText: 'Filmavond' }).first();
    const park = page.locator('.badge-card', { hasText: 'Pretpark' }).first();
    check('betaalbare beloning niet vergrendeld', (await film.getAttribute('class')).includes('locked'), false);
    check('te dure beloning vergrendeld', (await park.getAttribute('class')).includes('locked'), true);
    check('toont hoeveel er nog nodig is', (await park.textContent()).includes('nog 35'), true);
    await page.close();
  }

  section('14. Het kind ziet enkel zichzelf; de ouder ziet iedereen');
  {
    const s = seed({ diamonds: { [dk(-1)]: 2 } });
    s.families[FID].members.k2 = { rol: 'kind', weergavenaam: 'Zus', kleur: '#1D9E75', actief: true };
    s.families[FID].settings.rewards = { r1: { naam: 'Filmavond', omschrijving: '', diamanten: 1, order: 1 } };

    const kid = await openApp(browser, { seed: s, user: KID });
    await kid.page.evaluate(() => window.openRewards());   // zonder filter aanroepen
    await kid.page.waitForTimeout(200);
    check('kind ziet één sectie (zichzelf)', await kid.page.locator('.admin-role-title').count(), 1);
    check('en niet die van de zus', (await kid.page.locator('#app').textContent()).includes('Zus'), false);
    await kid.page.close();

    const ouder = await openApp(browser, { seed: s, user: PARENT });
    await ouder.page.evaluate(() => window.openRewards());
    await ouder.page.waitForTimeout(200);
    check('ouder ziet beide kinderen', await ouder.page.locator('.admin-role-title').count(), 2);
    await ouder.page.close();
  }

  section('15. Lege catalogus en terugkeren');
  {
    const { page } = await openApp(browser, { seed: seed(), user: KID });
    await page.evaluate(() => window.openRewards());
    await page.waitForTimeout(200);
    check('nette uitleg zonder beloningen', (await page.locator('#app').textContent()).includes('Nog geen beloningen'), true);
    await page.locator('.admin-back').click();
    await page.waitForTimeout(200);
    check('terug op het dagscherm', await page.locator('.task', { hasText: 'Afwas' }).count(), 1);
    await page.close();
  }

  section('16. Verdiende diamant is meteen zichtbaar op de chip');
  {
    const { page } = await openApp(browser, { seed: seed(), user: KID });
    check('start op 0', (await page.locator('.diamond-chip').first().textContent()).trim(), '💎 0');
    await tap(page, 'Afwas');
    check('na voltooien 1', (await page.locator('.diamond-chip').first().textContent()).trim(), '💎 1');
    await page.close();
  }

  await browser.close();
  done();
})();
