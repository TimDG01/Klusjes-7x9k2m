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
// Beheer-secties staan sinds v19.3 standaard ingeklapt
async function openSectie(page, key){
  await page.evaluate(k => window.toggleAdminRow(k), key);
  await page.waitForTimeout(150);
}

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

  section('2b. Een VOORBIJE dag alsnog aanvinken levert géén diamant op');
  {
    // terugbladeren en een oude dag afvinken mag niets opleveren; de reeks-reparatie
    // (de voltooiingsvlag) moet wél gewoon blijven werken
    const { page } = await openApp(browser, { seed: seed({ streakStart: dk(-5) }), user: PARENT });
    await page.evaluate(() => window.changeDay(-3));
    await page.waitForTimeout(200);
    await tap(page, 'Afwas');
    check('geen diamant voor een oude dag', (await ledger(page))[dk(-3)], undefined);
    check('grootboek volledig leeg', JSON.stringify(await ledger(page)), '{}');
    const vlag = await page.evaluate(([f, k, d]) => {
      const s = window.__store.root.families[f].streaks[k] || {};
      return !!(s.days && s.days[d]);
    }, [FID, KID, dk(-3)]);
    check('maar de reeks-vlag wordt wél gezet', vlag, true);
    // en vandaag levert nog steeds gewoon een diamant op
    await page.evaluate(() => window.goToday());
    await page.waitForTimeout(200);
    await tap(page, 'Afwas');
    check('vandaag nog steeds 1 diamant', (await ledger(page))[dk(0)], 1);
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
    await openSectie(page, 'sec:beloningen');
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
  {
    // v21.3: het bijsturen staat in Beheer → Beloningen, niet meer bij Instellingen.
    // Beide secties worden hier geopend, want ze staan standaard ingeklapt.
    const { page } = await openApp(browser, { seed: seed({ diamonds: { [dk(-1)]: 4 } }), user: PARENT });
    await page.evaluate(() => window.openAdmin());
    await page.waitForTimeout(200);

    await page.evaluate(() => window.toggleAdminRow('sec:beloningen'));
    await page.waitForTimeout(250);
    const beloningen = await page.locator('#app').innerText();
    check('Beloningen bevat "Diamanten bijsturen"', beloningen.includes('Diamanten bijsturen'), true);
    check('  met het saldo van het kind erbij', beloningen.includes('4 💎'), true);
    check('  de sectiekop hint ernaar', (await page.locator('.admin-group-head').nth(2).innerText()).includes('💎 bijsturen'), true);
    await page.evaluate(() => window.toggleAdminRow('sec:beloningen'));
    await page.waitForTimeout(200);

    await page.evaluate(() => window.toggleAdminRow('sec:instellingen'));
    await page.waitForTimeout(250);
    check('Instellingen bevat het niet meer',
      (await page.locator('#app').innerText()).includes('Diamanten bijsturen'), false);
    check('  maar wel nog de gewone instellingen',
      (await page.locator('#app').innerText()).includes('Dagelijkse herinnering'), true);
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
    check('chip opent de shop', await page.locator('.admin-title', { hasText: 'Shop' }).count(), 1);
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

  // gezin met een catalogus en een saldo, klaar om aan te vragen
  function winkel({ saldo = 5, claims = {}, purchases = null } = {}){
    const s = seed({ diamonds: saldo ? { [dk(-1)]: saldo } : {}, claims });
    s.families[FID].settings.rewards = {
      r1: { naam: 'Filmavond', omschrijving: 'Jij kiest', diamanten: 5, order: 1 },
      r2: { naam: 'Pretpark', omschrijving: '', diamanten: 40, order: 2 }
    };
    if (purchases) s.families[FID].streaks[KID].purchases = purchases;
    return s;
  }
  const purchasesOf = page => page.evaluate(([f, k]) => {
    const s = window.__store.root.families[f].streaks[k] || {};
    return s.purchases || {};
  }, [FID, KID]);
  const claimsOf = page => page.evaluate(f =>
    window.__store.root.families[f].settings.rewardClaims || {}, FID);

  section('17. Een kind koopt zelf, zonder toestemming te vragen');
  {
    const { page } = await openApp(browser, { seed: winkel(), user: KID });
    await page.evaluate(() => { window.confirm = () => true; });
    await page.evaluate(() => window.openRewards());
    await page.waitForTimeout(250);
    check('koopknop enkel bij wat betaalbaar is', await page.locator('.reward-ask').count(), 1);
    await page.locator('.reward-ask').first().click();
    await page.waitForTimeout(250);
    const aank = Object.values(await purchasesOf(page));
    check('aankoop weggeschreven', aank.length, 1);
    check('met bevroren naam', aank[0].naam, 'Filmavond');
    check('en bevroren prijs', aank[0].diamanten, 5);
    check('nog niet als gegeven gemarkeerd', !!aank[0].gegeven, false);
    check('saldo meteen afgetrokken (5 - 5)', await page.locator('.admin-role-title', { hasText: '0 \u{1F48E}' }).count(), 1);
    check('kind ziet dat het nog moet komen', (await page.locator('#app').textContent()).includes('nog niet gekregen'), true);
    await page.close();
  }

  section('18. Te duur kopen kan niet');
  {
    const { page, dialogs } = await openApp(browser, { seed: winkel({ saldo: 5 }), user: KID });
    await page.evaluate(() => { window.confirm = () => true; });
    await page.evaluate(() => window.buyReward('r2', 'k1'));   // kost 40
    await page.waitForTimeout(200);
    check('geen aankoop', Object.keys(await purchasesOf(page)).length, 0);
    check('met uitleg', /niet genoeg diamanten/.test(dialogs.join(' ')), true);
    await page.close();
  }

  section('19. Ouder ziet de aankoop en duidt ze aan als gegeven');
  {
    const s = winkel({ saldo: 5, purchases: { p1: { rewardId: 'r1', naam: 'Filmavond', diamanten: 5, dag: dk(-1) } } });
    const { page } = await openApp(browser, { seed: s, user: PARENT });
    await page.evaluate(() => window.openRewards());
    await page.waitForTimeout(250);
    check('ouder ziet de openstaande aankoop', (await page.locator('#app').textContent()).includes('nog te geven'), true);
    await page.evaluate(([k]) => window.toggleGiven(k, 'p1'), [KID]);
    await page.waitForTimeout(250);
    const p = (await purchasesOf(page)).p1;
    check('gemarkeerd als gegeven', !!p.gegeven, true);
    check('saldo verandert daardoor niet', (await page.evaluate(([f,k]) => {
      const st = window.__store.root.families[f].streaks[k];
      return Object.values(st.purchases).reduce((a,x) => a + x.diamanten, 0);
    }, [FID, KID])), 5);
    // en terugdraaien kan ook
    await page.evaluate(([k]) => window.toggleGiven(k, 'p1'), [KID]);
    await page.waitForTimeout(250);
    check('terugdraaien werkt', !!(await purchasesOf(page)).p1.gegeven, false);
    await page.close();
  }

  section('20. Het kind ziet zelf of het gekregen is');
  {
    const s = winkel({ saldo: 5, purchases: {
      p1: { rewardId: 'r1', naam: 'Filmavond', diamanten: 5, dag: dk(-2), gegeven: dk(-1) },
      p2: { rewardId: 'r1', naam: 'Filmavond', diamanten: 5, dag: dk(0) } } });
    const { page } = await openApp(browser, { seed: s, user: KID });
    await page.evaluate(() => window.openRewards());
    await page.waitForTimeout(250);
    let tekst = await page.locator('#app').textContent();
    check('nog-te-krijgen staat open', tekst.includes('nog niet gekregen'), true);
    check('"al gekregen" is standaard dichtgeklapt', tekst.includes('gekregen op'), false);
    check('met een kop die het aantal toont', tekst.includes('Al gekregen (1)'), true);
    // openklappen toont de gekregen beloningen
    await page.locator('.admin-collapse-head', { hasText: 'Al gekregen' }).first().click();
    await page.waitForTimeout(200);
    tekst = await page.locator('#app').textContent();
    check('na openklappen zie je "gekregen op"', tekst.includes('gekregen op'), true);
    check('geen ouderknoppen voor een kind', await page.locator('button[title*="gegeven"]').count(), 0);
    await page.close();
  }

  section('21. Een kind kan niet markeren, niet terugdraaien, niet voor een ander kopen');
  {
    const s = winkel({ saldo: 5, purchases: { p1: { rewardId: 'r1', naam: 'Filmavond', diamanten: 5, dag: dk(0) } } });
    s.families[FID].members.k2 = { rol: 'kind', weergavenaam: 'Zus', kleur: '#1D9E75', actief: true };
    const { page } = await openApp(browser, { seed: s, user: KID });
    await page.evaluate(() => { window.confirm = () => true; });
    await page.evaluate(([k]) => { window.toggleGiven(k, 'p1'); window.refundPurchase(k, 'p1'); }, [KID]);
    await page.waitForTimeout(250);
    const p = (await purchasesOf(page)).p1;
    check('aankoop ongemoeid', !!p, true);
    check('niet als gegeven gemarkeerd', !!p.gegeven, false);
    // een aankoop voor de zus belandt bij het kind zelf, niet bij haar
    await page.evaluate(() => window.buyReward('r1', 'k2'));
    await page.waitForTimeout(250);
    const zus = await page.evaluate(f => (window.__store.root.families[f].streaks.k2 || {}).purchases || {}, FID);
    check('niets weggeschreven bij de zus', Object.keys(zus).length, 0);
    await page.close();
  }

  section('22. Ouder kan een aankoop terugdraaien; diamanten komen terug');
  {
    const s = winkel({ saldo: 5, purchases: { p1: { rewardId: 'r1', naam: 'Filmavond', diamanten: 5, dag: dk(0) } } });
    const { page } = await openApp(browser, { seed: s, user: PARENT });
    await page.evaluate(() => { window.confirm = () => true; });
    await page.evaluate(() => window.openRewards());
    await page.waitForTimeout(250);
    check('saldo eerst 0', await page.locator('.admin-role-title', { hasText: '0 \u{1F48E}' }).count(), 1);
    await page.evaluate(([k]) => window.refundPurchase(k, 'p1'), [KID]);
    await page.waitForTimeout(300);
    check('aankoop weg', Object.keys(await purchasesOf(page)).length, 0);
    check('saldo terug op 5', await page.locator('.admin-role-title', { hasText: '5 \u{1F48E}' }).count(), 1);
    await page.close();
  }

  section('23. Onbeperkt herhaalbaar, en oude goedgekeurde inwisselingen blijven meetellen');
  {
    const s = winkel({ saldo: 20, claims: { c1: { uid: KID, rewardId: 'r1', naam: 'Filmavond', diamanten: 5, dag: dk(-5) } } });
    const { page } = await openApp(browser, { seed: s, user: KID });
    await page.evaluate(() => { window.confirm = () => true; });
    await page.evaluate(() => window.openRewards());
    await page.waitForTimeout(250);
    check('oude claim telt mee: 20 - 5 = 15', await page.locator('.admin-role-title', { hasText: '15 \u{1F48E}' }).count(), 1);
    await page.locator('.reward-ask').first().click();
    await page.waitForTimeout(250);
    await page.locator('.reward-ask').first().click();
    await page.waitForTimeout(250);
    check('twee keer hetzelfde kopen mag', Object.keys(await purchasesOf(page)).length, 2);
    check('saldo 20 - 5 - 5 - 5 = 5', await page.locator('.admin-role-title', { hasText: '5 \u{1F48E}' }).count(), 1);
    await page.close();
  }

  section('24. Afbeeldingen: luie listener, tonen, en de witte lijst');
  {
    // 1×1 JPEG als geldige data-URI
    const foto = 'data:image/jpeg;base64,' + 'A'.repeat(64);
    const s = winkel({ saldo: 5 });
    s.families[FID].settings.rewardImages = { r1: foto, r2: 'javascript:alert(1)' };
    const { page } = await openApp(browser, { seed: s, user: KID });

    // luie listener: pas ná het openen van de winkel zijn de foto's geladen
    const voor = await page.evaluate(() => document.querySelectorAll('.reward-art img').length);
    check('op het dagscherm nog geen foto\'s geladen', voor, 0);

    await page.evaluate(() => window.openRewards());
    await page.waitForTimeout(300);
    check('geldige foto verschijnt als <img>', await page.locator('.badge-card', { hasText: 'Filmavond' }).locator('img').count(), 1);
    const park = page.locator('.badge-card', { hasText: 'Pretpark' }).first();
    check('onveilige waarde wordt geweigerd', await park.locator('img').count(), 0);
    check('en valt terug op 🎁', (await park.textContent()).includes('🎁'), true);
    check('komt ook niet in de DOM', (await page.locator('#app').innerHTML()).includes('javascript:'), false);
    await page.close();
  }

  section('25. Een kind kan geen foto zetten of wissen');
  {
    const foto = 'data:image/jpeg;base64,' + 'A'.repeat(64);
    const s = winkel({ saldo: 5 });
    s.families[FID].settings.rewardImages = { r1: foto };
    const { page } = await openApp(browser, { seed: s, user: KID });
    await page.evaluate(() => { window.confirm = () => true; });
    await page.evaluate(() => window.removeRewardImage('r1'));
    await page.waitForTimeout(200);
    const na = await page.evaluate(f => window.__store.root.families[f].settings.rewardImages, FID);
    check('foto staat er nog', !!(na && na.r1), true);
    await page.close();
  }

  section('26. Ouder: Beheer toont de fotoknop en wissen werkt');
  {
    const foto = 'data:image/jpeg;base64,' + 'A'.repeat(64);
    const s = winkel({ saldo: 5 });
    s.families[FID].settings.rewardImages = { r1: foto };
    const { page } = await openApp(browser, { seed: s, user: PARENT });
    await page.evaluate(() => window.openAdmin());
    await page.waitForTimeout(300);
    await openSectie(page, 'sec:beloningen');
    await page.locator('.admin-collapse-head', { hasText: 'Filmavond' }).first().click();
    await page.waitForTimeout(200);
    check('Beheer toont de huidige foto', await page.locator('.admin-next-row img').count(), 1);
    await page.evaluate(() => { window.confirm = () => true; });
    await page.evaluate(() => window.removeRewardImage('r1'));
    await page.waitForTimeout(250);
    const na = await page.evaluate(f => window.__store.root.families[f].settings.rewardImages || {}, FID);
    check('foto gewist door de ouder', !!na.r1, false);
    await page.close();
  }

  section('27. Kant-en-klare iconen');
  {
    const s = winkel({ saldo: 5 });
    s.families[FID].settings.rewards.r1.icoon = 'film';
    const { page } = await openApp(browser, { seed: s, user: KID });
    await page.evaluate(() => window.openRewards());
    await page.waitForTimeout(250);
    const film = page.locator('.badge-card', { hasText: 'Filmavond' }).first();
    const park = page.locator('.badge-card', { hasText: 'Pretpark' }).first();
    check('gekozen icoon staat op de kaart', (await film.textContent()).includes('🎬'), true);
    check('zonder icoon blijft het 🎁', (await park.textContent()).includes('🎁'), true);
    await page.close();
  }

  section('28. Een eigen foto krijgt voorrang op het icoon');
  {
    const foto = 'data:image/jpeg;base64,' + 'A'.repeat(64);
    const s = winkel({ saldo: 5 });
    s.families[FID].settings.rewards.r1.icoon = 'film';
    s.families[FID].settings.rewardImages = { r1: foto };
    const { page } = await openApp(browser, { seed: s, user: KID });
    await page.evaluate(() => window.openRewards());
    await page.waitForTimeout(250);
    const film = page.locator('.badge-card', { hasText: 'Filmavond' }).first();
    check('foto getoond', await film.locator('img').count(), 1);
    check('icoon niet meer zichtbaar', (await film.textContent()).includes('🎬'), false);
    await page.close();

    // ook in Beheer krijgt de foto voorrang, als kleine thumb
    const p2 = await openApp(browser, { seed: s, user: PARENT });
    await p2.page.evaluate(() => window.openAdmin());
    await p2.page.waitForTimeout(250);
    await openSectie(p2.page, 'sec:beloningen');
    check('Beheer toont de foto als thumb', await p2.page.locator('.admin-collapse-head .admin-reward-thumb').count(), 1);
    await p2.page.close();
  }

  section('29. Icoon kiezen in Beheer (ouder-only)');
  {
    const { page } = await openApp(browser, { seed: winkel({ saldo: 5 }), user: PARENT });
    await page.evaluate(() => window.openAdmin());
    await page.waitForTimeout(250);
    await openSectie(page, 'sec:beloningen');
    await page.locator('.admin-collapse-head', { hasText: 'Filmavond' }).first().click();
    await page.waitForTimeout(200);
    await page.locator('button[title="Ander icoon kiezen"]').first().click();   // raster staat ingeklapt
    await page.waitForTimeout(200);
    check('meer dan 30 iconen om uit te kiezen', (await page.locator('.icon-pick-btn').count()) > 30, true);
    await page.locator('.icon-pick-btn[title="Wandeltocht"]').first().click();
    await page.waitForTimeout(250);
    check('icoon bewaard', (await page.evaluate(f => window.__store.root.families[f].settings.rewards.r1, FID)).icoon, 'wandeling');
    // de rij in Beheer moet het GEKOZEN icoon tonen; er stond hier een vaste 🎁, waardoor
    // het leek alsof de keuze niet aankwam terwijl ze wel degelijk bewaard was
    const kop = await page.locator('.admin-collapse-head', { hasText: 'Filmavond' }).first().textContent();
    check('Beheer toont het gekozen icoon', kop.includes('🥾'), true);
    check('en niet meer de vaste 🎁', kop.includes('🎁'), false);
    // weer wissen via de 🎁-knop
    await page.locator('.icon-pick-btn[title="Geen icoon"]').first().click();
    await page.waitForTimeout(250);
    check('icoon gewist', !!(await page.evaluate(f => window.__store.root.families[f].settings.rewards.r1, FID)).icoon, false);
    await page.close();
  }

  section('30. Een kind kan geen icoon zetten, en onzin wordt geweigerd');
  {
    const { page } = await openApp(browser, { seed: winkel({ saldo: 5 }), user: KID });
    await page.evaluate(() => window.setRewardIcon('r1', 'film'));
    await page.waitForTimeout(200);
    check('kind kan niets zetten', !!(await page.evaluate(f => window.__store.root.families[f].settings.rewards.r1, FID)).icoon, false);
    await page.close();

    const p2 = await openApp(browser, { seed: winkel({ saldo: 5 }), user: PARENT });
    await p2.page.evaluate(() => window.setRewardIcon('r1', 'bestaat-niet'));
    await p2.page.waitForTimeout(200);
    check('onbekende sleutel geweigerd', !!(await p2.page.evaluate(f => window.__store.root.families[f].settings.rewards.r1, FID)).icoon, false);
    await p2.page.close();
  }

  section('31. Beheer is compact: secties staan ingeklapt');
  {
    const { page } = await openApp(browser, { seed: winkel({ saldo: 5 }), user: PARENT });
    await page.evaluate(() => window.openAdmin());
    await page.waitForTimeout(250);
    check('vijf sectiekoppen', await page.locator('.admin-group-head').count(), 5);
    check('niets opengeklapt', await page.locator('.admin-group-body').count(), 0);
    check('geen beloningsrijen zichtbaar', (await page.locator('#app').textContent()).includes('Filmavond'), false);
    check('wel een samenvatting', (await page.locator('.admin-group-sub', { hasText: '2 beloningen' }).count()), 1);
    await openSectie(page, 'sec:beloningen');
    check('één sectie open', await page.locator('.admin-group-body').count(), 1);
    check('na openklappen wel de rijen', await page.locator('.admin-collapse-head', { hasText: 'Filmavond' }).count(), 1);
    check('maar het iconenraster nog niet', await page.locator('.icon-pick-btn').count(), 0);
    check('inhoud hangt onder de kop', await page.locator('.admin-group-body .admin-collapse-head').count() > 0, true);
    await page.close();
  }

  section('32. 🛒 wijst naar de shop, 🎁 blijft voor een losse beloning');
  {
    const s = winkel({ saldo: 5 });
    delete s.families[FID].settings.rewards.r2.icoon;      // Pretpark zonder icoon of foto
    const { page } = await openApp(browser, { seed: s, user: KID });
    const footer = await page.locator('.footer-btns').textContent();
    check('footerknop heet Shop', /🛒\s*Shop/.test(footer), true);
    check('en draagt geen 🎁 meer', footer.includes('🎁'), false);
    await page.evaluate(() => window.openRewards());
    await page.waitForTimeout(250);
    check('schermtitel ook', (await page.locator('.admin-title').textContent()).includes('🛒 Shop'), true);
    const park = page.locator('.badge-card', { hasText: 'Pretpark' }).first();
    check('beloning zonder icoon houdt 🎁', (await park.locator('.reward-art').textContent()).trim(), '🎁');
    await page.close();
  }

  await browser.close();
  done();
})();
