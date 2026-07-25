// Nep-Firebase-SDK voor de tests: een in-memory database + auth die de echte
// gstatic-CDN-modules vervangen, zodat index.html headless getest kan worden zonder
// netwerk en zonder ooit echte gezinsdata te raken.
//
// De drie valkuilen die hier bewust opgelost zijn (elke keer opnieuw ontdekt vóór dit
// bestand bestond — zie CLAUDE.md):
//   1. val() moet een node met dichte 0..n-1 sleutels als ARRAY teruggeven, net als de
//      echte RTDB. Anders faalt elke Array.isArray(weekdays)-check stilzwijgend en valt
//      de app terug op "elke dag".
//   2. Listeners moeten ASYNCHROON en GECOALESCEERD vuren. Synchroon notificeren binnen
//      een write geeft herintredende renders met verouderde caches — iets wat de echte
//      (altijd async) SDK nooit kan veroorzaken. Dat gaf ooit een oneindige lus.
//   3. Kindaanmaak gebruikt een TWEEDE app-instantie, dus auth houdt state per instantie
//      bij, niet globaal.
// Bovendien vuurt een listener enkel bij een échte wijziging (vergelijking op JSON),
// precies zoals de echte SDK — anders blijft de app zichzelf hertekenen.

const fs = require('fs');
const path = require('path');

const APP_JS = `
export const __apps = [];
export function initializeApp(config, name){
  const app = { name: name || '[DEFAULT]', config, __id: __apps.length };
  __apps.push(app);
  return app;
}
export function deleteApp(app){ return Promise.resolve(); }
`;

const DB_JS = `
// één gedeelde in-memory boom voor alle app-instanties; de test zet window.__seed
// via addInitScript, dus vóór de app-module draait
const store = { root: window.__seed || {} };
window.__store = store;

function parts(path){ return String(path).split('/').filter(Boolean); }
function getAt(p){
  let n = store.root;
  for (const k of p){ if (n == null || typeof n !== 'object') return undefined; n = n[k]; }
  return n;
}
function setAt(p, val){
  if (!p.length){ store.root = (val == null ? {} : val); return; }
  let n = store.root;
  for (let i = 0; i < p.length - 1; i++){
    if (n[p[i]] == null || typeof n[p[i]] !== 'object') n[p[i]] = {};
    n = n[p[i]];
  }
  const last = p[p.length - 1];
  if (val === null || val === undefined) delete n[last];
  else n[last] = val;
}
// valkuil 1: dichte integer-sleutels => array (zoals de echte RTDB)
function toVal(v){
  if (v == null || typeof v !== 'object') return v === undefined ? null : v;
  const keys = Object.keys(v);
  if (keys.length){
    const nums = keys.map(Number);
    if (nums.every(n => Number.isInteger(n) && n >= 0)){
      const sorted = [...nums].sort((a,b)=>a-b);
      if (sorted[0] === 0 && sorted[sorted.length-1] === sorted.length - 1){
        return sorted.map(i => toVal(v[String(i)]));
      }
    }
  }
  const out = {};
  for (const k of keys){ const c = toVal(v[k]); if (c !== null) out[k] = c; }
  return Object.keys(out).length ? out : (keys.length ? {} : null);
}
function snapshot(path){
  const raw = getAt(parts(path));
  const v = toVal(raw);
  return { val: () => v, exists: () => v !== null && v !== undefined, key: parts(path).slice(-1)[0] || null };
}

const listeners = [];
let flushPending = false;
// valkuil 2: asynchroon en gecoalesceerd, en enkel bij een echte wijziging
function scheduleFlush(){
  if (flushPending) return;
  flushPending = true;
  setTimeout(() => {
    flushPending = false;
    for (const l of [...listeners]){   // kopie: een callback mag listeners toevoegen
      if (l.dead) continue;
      const snap = snapshot(l.path);
      const json = JSON.stringify(snap.val());
      if (json === l.last) continue;
      l.last = json;
      try { l.cb(snap); } catch(e){ console.error('listener error', e); }
    }
  }, 0);
}
window.__flushDb = scheduleFlush;

export function getDatabase(app){ return { app }; }
export function ref(db, path){ return { path: String(path || '') }; }
export function onValue(r, cb, errCb){
  const l = { path: r.path, cb, last: undefined, dead: false };
  listeners.push(l);
  setTimeout(() => {           // eerste levering ook asynchroon, zoals de echte SDK
    if (l.dead) return;
    const snap = snapshot(l.path);
    l.last = JSON.stringify(snap.val());
    try { cb(snap); } catch(e){ console.error('listener error', e); }
  }, 0);
  return () => { l.dead = true; const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); };
}
export function get(r){ return Promise.resolve(snapshot(r.path)); }
export function set(r, val){ setAt(parts(r.path), val); scheduleFlush(); return Promise.resolve(); }
export function update(r, obj){
  for (const k of Object.keys(obj)) setAt(parts(r.path + '/' + k), obj[k]);
  scheduleFlush();
  return Promise.resolve();
}
export function remove(r){ setAt(parts(r.path), null); scheduleFlush(); return Promise.resolve(); }
let pushN = 0;
// De echte push(ref, value) maakt een sleutel én SCHRIJFT de waarde weg (en geeft een
// thenable ref terug). Een variant die de waarde negeert laat elke "voeg toe"-knop in de
// app stilzwijgend niets doen — zo ontdekt bij addReward, en het raakt evengoed
// addShift/addTaskAdmin.
export function push(r, value){
  const key = '-gen' + (pushN++);
  const child = { path: r.path + '/' + key, key };
  if (value !== undefined){ setAt(parts(child.path), value); scheduleFlush(); }
  return child;
}
`;

const AUTH_JS = `
// valkuil 3: state per app-instantie (kindaanmaak draait op een tweede instantie)
const perApp = new Map();
function stateFor(app){
  const id = (app && app.name) || '[DEFAULT]';
  if (!perApp.has(id)){
    // de test kan via window.__seedUser al ingelogd starten (browserLocalPersistence)
    const seeded = (id === '[DEFAULT]' && window.__seedUser)
      ? { uid: window.__seedUser, email: window.__seedUser + '@test.local' } : null;
    perApp.set(id, { user: seeded, cbs: [] });
  }
  return perApp.get(id);
}
export function getAuth(app){
  const st = stateFor(app);
  return { __st: st, get currentUser(){ return st.user; } };
}
export const browserLocalPersistence = 'local';
export function setPersistence(){ return Promise.resolve(); }
export function onAuthStateChanged(auth, cb){
  auth.__st.cbs.push(cb);
  setTimeout(() => cb(auth.__st.user), 0);
  return () => {};
}
function fire(st){ for (const cb of [...st.cbs]){ try { cb(st.user); } catch(e){ console.error(e); } } }
export function signInWithEmailAndPassword(auth, email, pw){
  const uid = (window.__emailToUid && window.__emailToUid[email]) || null;
  if (!uid) return Promise.reject(Object.assign(new Error('geen account'), { code: 'auth/user-not-found' }));
  auth.__st.user = { uid, email };
  fire(auth.__st);
  return Promise.resolve({ user: auth.__st.user });
}
export function createUserWithEmailAndPassword(auth, email, pw){
  const uid = 'new-' + Math.random().toString(36).slice(2, 8);
  window.__emailToUid = window.__emailToUid || {};
  window.__emailToUid[email] = uid;
  auth.__st.user = { uid, email };
  fire(auth.__st);
  return Promise.resolve({ user: auth.__st.user });
}
export function signOut(auth){ auth.__st.user = null; fire(auth.__st); return Promise.resolve(); }
export function updatePassword(){ return Promise.resolve(); }
`;

// Meldingen doen in een test niets; de app vangt elke fout hier zelf op.
const MSG_JS = `
export function getMessaging(){ throw new Error('geen messaging in de test'); }
export function getToken(){ return Promise.reject(new Error('geen token')); }
export function onMessage(){ return () => {}; }
export function isSupported(){ return Promise.resolve(false); }
`;

const APP_PATH = path.join(__dirname, '..', 'index.html');

// Deze omgeving levert een voorgeïnstalleerde Chromium (Playwright mag niet downloaden);
// elders valt dit terug op de browser die Playwright zelf beheert.
function chromiumExecutable(){
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    const dir = fs.readdirSync(base).find(d => /^chromium-\d+$/.test(d));
    if (dir){
      const p = path.join(base, dir, 'chrome-linux', 'chrome');
      if (fs.existsSync(p)) return p;
    }
  } catch (e) { /* geen voorgeïnstalleerde browser: Playwright regelt het zelf */ }
  return undefined;
}

async function launchBrowser(){
  const { chromium } = require('playwright');
  return chromium.launch({ executablePath: chromiumExecutable() });
}

// Opent index.html met de nep-SDK ervoor. `seed` is de volledige databaseboom,
// `user` de uid die al ingelogd is. Geeft { page, dialogs } terug — dialogs verzamelt
// elke alert()/confirm()-tekst, zodat een test kan controleren dát er uitleg kwam.
async function openApp(browser, { seed = {}, user = null, waitFor = '.task' } = {}){
  const page = await browser.newPage();
  await page.addInitScript(([s, u]) => { window.__seed = s; window.__seedUser = u; }, [seed, user]);
  const mod = body => route => route.fulfill({ status: 200, contentType: 'application/javascript', body });
  await page.route('**/firebase-app.js', mod(APP_JS));
  await page.route('**/firebase-database.js', mod(DB_JS));
  await page.route('**/firebase-auth.js', mod(AUTH_JS));
  await page.route('**/firebase-messaging.js', mod(MSG_JS));
  const dialogs = [];
  page.on('dialog', d => { dialogs.push(d.message()); d.dismiss(); });
  page.on('pageerror', e => console.error('  PAGINA-FOUT:', e.message));
  await page.goto('file://' + APP_PATH);
  if (waitFor) await page.waitForSelector(waitFor, { timeout: 10000 });
  return { page, dialogs };
}

module.exports = { APP_JS, DB_JS, AUTH_JS, MSG_JS, APP_PATH, launchBrowser, openApp };
