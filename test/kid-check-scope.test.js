// v18.9 — settings/kidCheckScope: op welke dagen mag een KIND af-/uitvinken?
// Draait de echte index.html in Chromium tegen de nep-Firebase-SDK.
const { launchBrowser, openApp } = require('./fake-firebase.js');
const { section, check, done } = require('./assert.js');

const FID = 'f1', PARENT = 'p1', KID = 'k1';

const dayKey = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const shift = n => { const d = new Date(); d.setDate(d.getDate() + n); return d; };

// gezin met één kind, één vaste dagelijkse taak en één beurt-taak (elke dag)
function seed(scope){
  const fam = {
    meta: { naam: 'Testgezin', code: 'ABC123' },
    members: {
      [PARENT]: { rol: 'ouder', weergavenaam: 'Ouder', kleur: '#185FA5', actief: true },
      [KID]: { rol: 'kind', weergavenaam: 'Kind', gebruikersnaam: 'kind', kleur: '#B5006E', actief: true }
    },
    settings: {
      tasks: { t1: { label: 'Afwas', recurring: true, order: 0, members: [KID] } },
      shifts: { s1: { name: 'Stofzuigen', weekdays: [0,1,2,3,4,5,6], lines: ['boven'], next: { uid: KID, lineIdx: 0 } } }
    }
  };
  if (scope) fam.settings.kidCheckScope = scope;
  return { families: { [FID]: fam }, userIndex: { [PARENT]: FID, [KID]: FID }, familyCodes: { ABC123: FID } };
}

const open = (browser, scope, user) => openApp(browser, { seed: seed(scope), user });

async function clickRow(page, labelPart){
  await page.locator('.task', { hasText: labelPart }).first().click();
  await page.waitForTimeout(120);
}
const readCheck = (page, dk, id) => page.evaluate(
  ([f, d, k, i]) => {
    const days = window.__store.root.families[f].days || {};
    return !!(days[d] && days[d].checks && days[d].checks[k] && days[d].checks[k][i]);
  }, [FID, dk, KID, id]);

// probeer op dag `offset` af te vinken; geeft { written, alerted }
async function attempt(browser, { scope, user, offset, label, checkId }){
  const { page, dialogs } = await open(browser, scope, user);
  if (offset !== 0) await page.evaluate(n => window.changeDay(n), offset);
  await page.waitForTimeout(150);
  await clickRow(page, label);
  const written = await readCheck(page, dayKey(shift(offset)), checkId);
  await page.close();
  return { written, alerted: dialogs.length > 0 };
}

(async () => {
  const browser = await launchBrowser();

  section('1. REGRESSIE — instelling afwezig: kind mag elke dag (gedrag van vóór v18.9)');
  for (const [n, lbl] of [[-1, 'gisteren'], [0, 'vandaag'], [1, 'morgen']]){
    const r = await attempt(browser, { scope: null, user: KID, offset: n, label: 'Afwas', checkId: 't1' });
    check(`kind kan ${lbl} afvinken`, r.written, true);
  }

  section("2. 'geen-verleden' — kind niet terug in de tijd");
  for (const [n, lbl, exp] of [[-1, 'gisteren', false], [0, 'vandaag', true], [1, 'morgen', true]]){
    const r = await attempt(browser, { scope: 'geen-verleden', user: KID, offset: n, label: 'Afwas', checkId: 't1' });
    check(`kind ${lbl} → ${exp ? 'mag' : 'geblokkeerd'}`, r.written, exp);
    if (!exp) check('  en kreeg uitleg te zien', r.alerted, true);
  }

  section("3. 'enkel-vandaag' — kind ook niet vooruit");
  for (const [n, lbl, exp] of [[-1, 'gisteren', false], [0, 'vandaag', true], [1, 'morgen', false]]){
    const r = await attempt(browser, { scope: 'enkel-vandaag', user: KID, offset: n, label: 'Afwas', checkId: 't1' });
    check(`kind ${lbl} → ${exp ? 'mag' : 'geblokkeerd'}`, r.written, exp);
  }

  section("4. 'nooit' — enkel de ouder vinkt af");
  for (const [n, lbl] of [[-1, 'gisteren'], [0, 'vandaag'], [1, 'morgen']]){
    const r = await attempt(browser, { scope: 'nooit', user: KID, offset: n, label: 'Afwas', checkId: 't1' });
    check(`kind ${lbl} geblokkeerd`, r.written, false);
  }

  section('5. OUDER mag in elke stand, op elke dag');
  for (const scope of ['geen-verleden', 'enkel-vandaag', 'nooit']){
    for (const n of [-1, 0, 1]){
      const r = await attempt(browser, { scope, user: PARENT, offset: n, label: 'Afwas', checkId: 't1' });
      check(`ouder mag bij '${scope}' op dag ${n}`, r.written, true);
    }
  }

  // NB: een openstaande beurt bestaat alleen op haar eigen dag (SHIFT_GRACE=0) en als
  // dimme projectie in de toekomst — op een voorbije dag is er dus géén rij om te klikken.
  section('6. Beurt-rij (toggleShift) volgt dezelfde regel');
  for (const [scope, n, exp] of [
    [null, 0, true], [null, 1, true],                        // regressie: zonder instelling alles
    ['geen-verleden', 0, true], ['geen-verleden', 1, true],
    ['enkel-vandaag', 0, true], ['enkel-vandaag', 1, false],  // projectie geblokkeerd
    ['nooit', 0, false], ['nooit', 1, false]
  ]){
    const r = await attempt(browser, { scope, user: KID, offset: n, label: 'Stofzuigen', checkId: 'shift-s1' });
    check(`beurt: scope=${scope || 'afwezig'} dag ${n} → ${exp ? 'mag' : 'geblokkeerd'}`, r.written, exp);
  }
  for (const n of [0, 1]){
    const r = await attempt(browser, { scope: 'nooit', user: PARENT, offset: n, label: 'Stofzuigen', checkId: 'shift-s1' });
    check(`beurt: ouder mag bij 'nooit' op dag ${n}`, r.written, true);
  }

  section('7. Beheer → Instellingen: de keuzelijst werkt en schrijft weg');
  {
    const { page } = await open(browser, null, PARENT);
    await page.evaluate(() => window.openAdmin());
    await page.waitForTimeout(150);
    const sel = page.locator('select[onchange*="setKidCheckScope"]');
    check('keuzelijst staat in Beheer', await sel.count(), 1);
    check('vier standen', await sel.locator('option').count(), 4);
    check('toont de default', await sel.inputValue(), 'alles');
    await sel.selectOption('enkel-vandaag');
    await page.waitForTimeout(150);
    const stored = await page.evaluate(f => window.__store.root.families[f].settings.kidCheckScope, FID);
    check('keuze is bewaard in settings/kidCheckScope', stored, 'enkel-vandaag');
    await page.close();
  }
  {
    // Beheer is ouder-only: een kind kan de instelling niet zetten
    const { page } = await open(browser, 'alles', KID);
    await page.evaluate(() => window.setKidCheckScope('nooit'));
    await page.waitForTimeout(150);
    const stored = await page.evaluate(f => window.__store.root.families[f].settings.kidCheckScope, FID);
    check('kind kan de instelling niet wijzigen', stored, 'alles');
    await page.close();
  }

  section('8. REGRESSIE — bestaande ouder-only-regel voor een eenmalige taak');
  {
    const { page, dialogs } = await open(browser, null, KID);
    await page.evaluate(f => window.__store.root.families[f].settings.tasks.t2 =
      { label: 'Kamer opruimen', recurring: false, order: 1, members: ['k1'] }, FID);
    await page.evaluate(() => window.__flushDb());
    await page.waitForTimeout(200);
    await clickRow(page, 'Kamer opruimen');                 // afvinken mag (vandaag)
    check('kind kan een eenmalige taak afvinken', await readCheck(page, dayKey(shift(0)), 't2'), true);
    dialogs.length = 0;
    await clickRow(page, 'Kamer opruimen');                 // uitvinken = ouder-only
    check('uitvinken blijft geblokkeerd', await readCheck(page, dayKey(shift(0)), 't2'), true);
    check('  met de bestaande uitleg', /alleen een ouder/.test(dialogs[0] || ''), true);
    await page.close();
  }

  await browser.close();
  done();
})();
