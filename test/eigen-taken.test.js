// v21 — 📝 Eigen klusjes. Draait de echte index.html tegen de nep-Firebase-SDK.
// Kern van het ontwerp: een eigen klusje leeft onder streaks/{uid}/eigenTaken en is met
// opzet géén gewone taak. Het hoort dus NOOIT in de id-lijst van de dag terecht te komen:
// geen voltooiingsvlag, geen badge, geen diamant, niet in de voortgangsbalk, en het mag
// een reeks noch breken noch redden. Precies dat wordt hier vastgezet.
const { launchBrowser, openApp } = require('./fake-firebase.js');
const { section, check, done } = require('./assert.js');

const FID = 'f1', PARENT = 'p1', KID = 'k1', KID2 = 'k2';

const dayKey = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const shift = n => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
const dk = n => dayKey(shift(n));

// Gezin met één dagelijkse taak. `taakVoor` bepaalt van wie die taak is: zet ze op de zus
// en het eerste kind heeft géén ingeplande klusjes meer — zo bouw je een "lege dag".
// (Een taak nooit-actief maken met `weekdays: []` kán niet in een seed: RTDB — en dus ook
// de nep-SDK — bewaart een lege array niet, waardoor het veld afwezig is en "elke dag"
// betekent. Vandaar de omweg via de deelnemer.)
function seed({ eigen = null, taakVoor = KID, kids = 1, streakStart = dk(0), days = {}, diamonds = {}, checks = null } = {}){
  const members = {
    [PARENT]: { rol: 'ouder', weergavenaam: 'Ouder', kleur: '#185FA5', actief: true },
    [KID]: { rol: 'kind', weergavenaam: 'Kind', gebruikersnaam: 'kind', kleur: '#B5006E', actief: true }
  };
  if (kids > 1) members[KID2] = { rol: 'kind', weergavenaam: 'Zus', gebruikersnaam: 'zus', kleur: '#1D9E75', actief: true };
  const t1 = { label: 'Afwas', recurring: true, order: 0, members: [taakVoor] };
  return {
    families: { [FID]: {
      meta: { naam: 'Testgezin', code: 'ABC123' },
      members,
      settings: { streakStart, tasks: { t1 } },
      streaks: { [KID]: { days, diamonds, ...(eigen ? { eigenTaken: eigen } : {}) } },
      ...(checks ? { days: checks } : {})
    }},
    userIndex: { [PARENT]: FID, [KID]: FID, ...(kids > 1 ? { [KID2]: FID } : {}) },
    familyCodes: { ABC123: FID }
  };
}

const eigenVan = (page, uid = KID) => page.evaluate(([f, k]) => {
  const s = (window.__store.root.families[f].streaks || {})[k] || {};
  return s.eigenTaken || {};
}, [FID, uid]);

const streaksVan = page => page.evaluate(([f, k]) => {
  const s = (window.__store.root.families[f].streaks || {})[k] || {};
  return { days: s.days || {}, diamonds: s.diamonds || {} };
}, [FID, KID]);

// prompt/confirm vervangen in de pagina (zoals rewards.test.js) — addEigenTaak vraagt
// eerst het label en dan "elke dag?".
const stubDialogs = (page, label, elkeDag) => page.evaluate(([l, e]) => {
  window.prompt = () => l;
  window.confirm = () => e;
}, [label, elkeDag]);

const open = (browser, opts, user, waitFor = '.card') =>
  openApp(browser, { seed: seed(opts), user, waitFor });

// één eigen klusje "elke dag" / gepind op dag n
const elkeDag = (label = 'Boek lezen') => ({ e1: { label, order: 1 } });
const gepind = (n, extra = {}) => ({ e1: { label: 'Kamer opruimen', order: 1, onDay: dk(n), ...extra } });

(async () => {
  const browser = await launchBrowser();

  section('1. Een kind voegt zelf een eigen klusje toe');
  {
    const { page } = await open(browser, {}, KID, '.task');
    check('het blok staat op de kaart, ook zonder eigen klusjes', await page.locator('.own-sec').count(), 1);
    check('  met de + knop', await page.locator('.own-sec .admin-add-btn').count(), 1);
    check('  en nog geen enkele eigen rij', await page.locator('.own-sec .task').count(), 0);
    check('  een lege lijst toont geen kopregel', await page.locator('.own-head').count(), 0);

    await stubDialogs(page, 'Boek lezen', true);
    await page.locator('.own-sec .admin-add-btn').click();
    await page.waitForTimeout(300);
    const e = await eigenVan(page);
    const ids = Object.keys(e);
    check('er staat één record onder streaks/{uid}/eigenTaken', ids.length, 1);
    check('  met het getypte label', e[ids[0]].label, 'Boek lezen');
    check('  "elke dag" = geen onDay-pin', e[ids[0]].onDay, undefined);
    check('  nog niets afgevinkt', e[ids[0]].gedaanOp, undefined);
    check('de rij staat op de kaart', await page.locator('.own-sec .task').count(), 1);
    check('  met "elke dag" op de chip', (await page.locator('.own-tag').first().innerText()).trim(), 'elke dag');
    check('  en nu wél een kopregel', await page.locator('.own-head').count(), 1);
    check('  en niets is er in settings/tasks bijgekomen',
      await page.evaluate(f => Object.keys(window.__store.root.families[f].settings.tasks).length, FID), 1);
    await page.close();
  }
  {
    // "enkel deze dag" → gepind op de dag die op het scherm staat
    const { page } = await open(browser, {}, KID, '.task');
    await stubDialogs(page, 'Zwemzak klaarzetten', false);
    await page.locator('.own-sec .admin-add-btn').click();
    await page.waitForTimeout(300);
    const e = await eigenVan(page);
    check('"enkel deze dag" pint op vandaag', e[Object.keys(e)[0]].onDay, dk(0));
    check('  en de chip zegt "eenmalig"', (await page.locator('.own-tag').first().innerText()).trim(), 'eenmalig');
    await page.close();
  }
  {
    // de twee soorten naast elkaar: het onderscheid moet op de rij zelf te zien zijn
    const { page } = await open(browser, {
      eigen: {
        e1: { label: 'Gitaar oefenen', order: 1 },
        e2: { label: 'Zwemzak klaarzetten', order: 2, onDay: dk(0) }
      }
    }, KID, '.task');
    check('twee eigen klusjes van verschillende soort',
      await page.locator('.own-sec .task').count(), 2);
    check('  chips vertellen welke welke is',
      (await page.locator('.own-tag').allInnerTexts()).map(s => s.trim()).join('|'), 'elke dag|eenmalig');
    check('  geen enkele chip zegt nog "eigen" (dat zegt de kopregel al)',
      (await page.locator('.own-tag').allInnerTexts()).some(s => s.trim() === 'eigen'), false);
    check('  de kopregel zegt het wel', (await page.locator('.own-head').innerText()).startsWith('Eigen klusjes'), true);
    await page.close();
  }

  section('2. Afvinken heeft géén gevolgen voor de vlag en de diamant (het hart)');
  {
    const { page } = await open(browser, { eigen: elkeDag() }, KID, '.task');
    check('twee rijen: het echte klusje en het eigen klusje', await page.locator('.task').count(), 2);

    await page.locator('.own-sec .task').first().click();
    await page.waitForTimeout(300);
    const e = await eigenVan(page);
    check('het eigen klusje staat afgevinkt', e.e1.gedaanOp[dk(0)], true);
    check('  ook zichtbaar op de kaart', await page.locator('.own-sec .check.done').count(), 1);
    let s = await streaksVan(page);
    check('géén voltooiingsvlag', Object.keys(s.days).length, 0);
    check('géén diamant', Object.keys(s.diamonds).length, 0);
    check('  en geen viering', await page.locator('.celebration').count(), 0);

    // nu het échte klusje: dát levert wél een vlag + diamant op, ondanks dat het eigen
    // klusje niet meetelt — een openstaand eigen klusje mag de dag ook niet blokkeren
    await page.locator('.task').first().click();
    await page.waitForTimeout(400);
    s = await streaksVan(page);
    check('het echte klusje levert wél een vlag op', s.days[dk(0)], true);
    check('  en één diamant', s.diamonds[dk(0)], 1);
    await page.close();
  }
  {
    // omgekeerd: het echte klusje af terwijl het eigen klusje open blijft staan
    const { page } = await open(browser, { eigen: elkeDag() }, KID, '.task');
    await page.locator('.task').first().click();
    await page.waitForTimeout(400);
    const s = await streaksVan(page);
    check('een openstaand eigen klusje blokkeert de voltooiing niet', s.days[dk(0)], true);
    check('  en de viering komt gewoon', await page.locator('.celebration').count(), 1);
    await page.close();
  }
  {
    // uitvinken van een eigen klusje raakt een al verdiende diamant niet. De dag moet
    // écht af zijn (het klusje afgevinkt in de seed), anders haalt de bestaande
    // v19-tak in render() de vlag terecht weer weg.
    const { page } = await open(browser, {
      eigen: { e1: { label: 'Boek lezen', order: 1, gedaanOp: { [dk(0)]: true } } },
      days: { [dk(0)]: true }, diamonds: { [dk(0)]: 1 },
      checks: { [dk(0)]: { checks: { [KID]: { t1: true } } } }
    }, KID, '.task');
    await page.waitForTimeout(200);
    if (await page.locator('.celebration-close').count()) await page.locator('.celebration-close').click();
    await page.locator('.own-sec .task').first().click();
    await page.waitForTimeout(300);
    const e = await eigenVan(page);
    check('uitvinken wist enkel de dagsleutel', (e.e1.gedaanOp || {})[dk(0)], undefined);
    const s = await streaksVan(page);
    check('  de vlag blijft staan', s.days[dk(0)], true);
    check('  de diamant blijft staan', s.diamonds[dk(0)], 1);
    await page.close();
  }

  section('3. De voortgangsbalk telt eigen klusjes niet mee');
  {
    const { page } = await open(browser, { eigen: elkeDag() }, KID, '.task');
    check('één echt klusje + één eigen klusje = 0/1',
      await page.locator('.progress-label').innerText(), 'Voortgang\n0/1');
    await page.locator('.own-sec .task').first().click();
    await page.waitForTimeout(300);
    check('  een afgevinkt eigen klusje verandert de balk niet',
      await page.locator('.progress-label').innerText(), 'Voortgang\n0/1');
    await page.close();
  }

  section('4. Een eigen klusje breekt de reeks niet en redt ze ook niet');
  {
    // dag -10 t/m -4 afgewerkt (7 op rij), dan drie gemiste dagen
    const dagen = {}; for (let i = -10; i <= -4; i++) dagen[dk(i)] = true;
    const opts = { streakStart: dk(-10), days: dagen, eigen: elkeDag(), kids: 2 };

    const a = await open(browser, opts, KID);
    check('met échte klusjes op de gemiste dagen breekt de reeks',
      (await a.page.locator('.streak-flame').first().innerText()).trim(), '🔥 0');
    await a.page.close();

    // zelfde gezin, maar het echte klusje is van de zus → dit kind heeft geen ingeplande
    // klusjes meer, enkel zijn eigen klusje (elke dag). Zou dát meetellen als "ingeplande
    // taak", dan brak de reeks alsnog op de drie gemiste dagen.
    const b = await open(browser, { ...opts, taakVoor: KID2 }, KID);
    check('een dag met enkel een eigen klusje blijft een lege dag → reeks blijft staan',
      (await b.page.locator('.streak-flame').first().innerText()).trim(), '🔥 7');
    await b.page.waitForTimeout(300);
    const s = await streaksVan(b.page);
    check('  en zo\'n dag levert geen diamant op', s.diamonds[dk(0)], undefined);
    await b.page.close();
  }

  section('5. "elke dag" versus "enkel deze dag"');
  {
    const { page } = await open(browser, { eigen: elkeDag() }, KID, '.task');
    check('elke dag: vandaag zichtbaar', await page.locator('.own-sec .task').count(), 1);
    await page.evaluate(() => window.changeDay(1));
    await page.waitForTimeout(250);
    check('  morgen ook', await page.locator('.own-sec .task').count(), 1);
    check('  en morgen weer onafgevinkt', await page.locator('.own-sec .check.done').count(), 0);
    await page.close();
  }
  {
    // een vergeten gepind klusje schuift mee naar vandaag i.p.v. te verdwijnen
    const { page } = await open(browser, { eigen: gepind(-3) }, KID, '.task');
    check('een vergeten gepind klusje staat op vandaag', await page.locator('.own-sec .task').count(), 1);
    await page.evaluate(() => window.changeDay(-3));
    await page.waitForTimeout(250);
    check('  en niet meer op zijn oorspronkelijke dag', await page.locator('.own-sec .task').count(), 0);
    await page.evaluate(() => window.changeDay(3));
    await page.waitForTimeout(250);

    await page.locator('.own-sec .task').first().click();
    await page.waitForTimeout(300);
    const e = await eigenVan(page);
    check('afvinken verhuist de pin naar de dag van afvinken', e.e1.onDay, dk(0));
    check('  met het vinkje op die dag', e.e1.gedaanOp[dk(0)], true);
    check('de rij blijft op vandaag staan (springt niet terug)',
      await page.locator('.own-sec .task').count(), 1);
    check('  afgevinkt', await page.locator('.own-sec .check.done').count(), 1);
    await page.evaluate(() => window.changeDay(1));
    await page.waitForTimeout(250);
    check('  en komt morgen niet terug', await page.locator('.own-sec .task').count(), 0);
    await page.close();
  }

  section('6. Wissen, en wie wat mag');
  {
    const { page } = await open(browser, { eigen: elkeDag() }, KID, '.task');
    await page.evaluate(() => { window.confirm = () => true; });
    await page.locator('.own-sec .admin-icon-btn').click();
    await page.waitForTimeout(300);
    check('het kind kan zijn eigen klusje wissen', Object.keys(await eigenVan(page)).length, 0);
    check('  de rij is weg', await page.locator('.own-sec .task').count(), 0);
    await page.close();
  }
  {
    const { page } = await open(browser, { eigen: elkeDag() }, PARENT, '.task');
    check('de ouder ziet het blok op de kaart van het kind', await page.locator('.own-sec').count(), 1);
    check('  en de rij', await page.locator('.own-sec .task').count(), 1);
    await page.evaluate(() => { window.confirm = () => true; });
    await page.locator('.own-sec .admin-icon-btn').click();
    await page.waitForTimeout(300);
    check('  en mag ze wissen', Object.keys(await eigenVan(page)).length, 0);

    await stubDialogs(page, 'Van de ouder', true);
    await page.locator('.own-sec .admin-add-btn').click();
    await page.waitForTimeout(300);
    check('  en toevoegen', Object.keys(await eigenVan(page)).length, 1);

    await page.evaluate(() => window.openAdmin());
    await page.waitForTimeout(300);
    check('Beheer blijft ongemoeid: nog altijd vijf secties', await page.locator('.admin-group-head').count(), 5);
    check('  en eigen klusjes staan er niet in',
      (await page.locator('#app').textContent()).includes('Van de ouder'), false);
    await page.close();
  }
  {
    // een kind kan niet aan de eigen klusjes van een ánder kind (mayEditEigen zit ook
    // in de handlers zelf, niet alleen rond de knoppen)
    const { page } = await open(browser, { kids: 2 }, KID, '.task');
    check('een kind ziet enkel zijn eigen kaart', await page.locator('.own-sec').count(), 1);
    await page.evaluate(u => { window.prompt = () => 'Gehackt'; window.confirm = () => true; window.addEigenTaak(u); }, KID2);
    await page.waitForTimeout(300);
    check('  en kan niets toevoegen bij een ander kind',
      Object.keys(await eigenVan(page, KID2)).length, 0);
    await page.close();
  }

  await browser.close();
  done();
})();
