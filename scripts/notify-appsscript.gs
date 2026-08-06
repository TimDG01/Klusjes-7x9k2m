/**
 * Klusjes — herinneringen sturen vanuit Google Apps Script (script.google.com)
 * =============================================================================
 *
 * WAAROM DIT BESTAAT
 * GitHub Actions bleek de zwakke schakel: de runs werden wél aangemaakt, maar kregen geen
 * runner toegewezen en werden na ~15 minuten door GitHub zelf geannuleerd — er draaide dan
 * geen enkele stap. De keten was ook onnodig lang (Apps Script → GitHub API → wachtrij →
 * runner → npm install → node → Firebase). Dit script praat rechtstreeks met Firebase:
 * Apps Script → Firebase. Twee stappen in plaats van zeven.
 *
 * ⚠️ DE BELANGRIJKSTE REGEL: HIER STAAT GEEN KLUSJES-LOGICA IN.
 * De klusjes-/beurt-/datum-wiskunde is berucht om z'n duplicatie (zie CLAUDE.md): ze staat
 * al in index.html én in scripts/notify.js. Een DERDE kopie hier zou gegarandeerd uit de
 * pas lopen. Daarom haalt dit script `scripts/notify.js` op als TEKST van GitHub Pages en
 * voert het dat uit met een kleine CommonJS-shim (zie laadKern_). Dat is exact hetzelfde
 * bestand dat de testsuite test en dat de GitHub Action draait — één bron van waarheid.
 *
 * Gevolg: dit bestand plak je ÉÉN keer in Apps Script en raak je daarna niet meer aan.
 * Wijzigt de klusjes-logica? Push naar `main` — Pages publiceert, en de volgende run pikt
 * het vanzelf op. Alleen als de opzet zelf verandert (URL's, auth, quota) moet je hier nog
 * iets doen.
 *
 * EENMALIGE INSTALLATIE
 *  1. script.google.com → Nieuw project → plak dit bestand erin.
 *  2. Projectinstellingen → Scripteigenschappen → voeg toe:
 *       FIREBASE_SERVICE_ACCOUNT = de volledige service-account-JSON (dezelfde inhoud als
 *                                  de GitHub-secret met die naam).
 *       RUN_KEY                  = (optioneel) een zelfgekozen wachtwoord; alleen nodig als
 *                                  je de iOS-Snelkoppeling wil blijven gebruiken.
 *  3. Voer één keer de functie `installeerTrigger` uit (⏱ elke 30 minuten).
 *  4. Controleer met `klusjesHerinneringNu` (stuurt meteen, negeert het uur) of de
 *     uitvoeringslogboeken groen zijn.
 *
 * De service-account-JSON is een geheim: hij staat in Scripteigenschappen, niet in dit
 * bestand en niet in de repo.
 */

// ---- configuratie ----------------------------------------------------------------------

/**
 * Waar de gedeelde logica vandaan komt — beide wijzen naar `main`, nooit naar een branch.
 * raw.githubusercontent staat eerst omdat die bron nagemeten is (levert notify.js zoals het
 * is, zonder tussenstap); GitHub Pages is de tweede kans. Lukken beide niet, dan valt
 * laadKern_ terug op de laatst gelukte versie in Scripteigenschappen — een storing bij
 * GitHub legt de herinneringen dus niet plat.
 */
var BRON_URLS = [
  'https://raw.githubusercontent.com/TimDG01/Klusjes-7x9k2m/main/scripts/notify.js',
  'https://timdg01.github.io/Klusjes-7x9k2m/scripts/notify.js'
];

var DB_URL = 'https://klusjesv2-default-rtdb.europe-west1.firebasedatabase.app';

var SCOPES = [
  'https://www.googleapis.com/auth/firebase.database',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/firebase.messaging'
].join(' ');

// Scripteigenschappen mogen max ~9 kB per waarde bevatten; notify.js is groter, dus de
// noodkopie wordt in stukken bewaard.
var CACHE_CHUNK = 8000;

// ---- ingangen --------------------------------------------------------------------------

/** Wordt door de tijdtrigger aangeroepen (elke 30 min). */
function klusjesHerinnering() {
  run_(false);
}

/** Handmatig testen: stuurt nu, ongeacht het ingestelde uur. Zet lastNotified niet. */
function klusjesHerinneringNu() {
  run_(true);
}

/** Eenmalig uitvoeren: zet de tijdtrigger op elke 30 minuten. */
function installeerTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'klusjesHerinnering') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('klusjesHerinnering').timeBased().everyMinutes(30).create();
  console.log('Trigger gezet: klusjesHerinnering, elke 30 minuten.');
}

/**
 * Optioneel: laat de iOS-Snelkoppeling een run starten (die riep vroeger de GitHub-API aan).
 * Werkt alleen als je dit project als web-app implementeert én RUN_KEY instelt.
 * Openen als: https://script.google.com/macros/s/…/exec?key=JOUW_RUN_KEY
 */
function doGet(e) {
  var key = PropertiesService.getScriptProperties().getProperty('RUN_KEY');
  var gegeven = (e && e.parameter && e.parameter.key) || '';
  if (!key || gegeven !== key) {
    return ContentService.createTextOutput('Geweigerd').setMimeType(ContentService.MimeType.TEXT);
  }
  var verslag = run_(false);
  return ContentService.createTextOutput(verslag).setMimeType(ContentService.MimeType.TEXT);
}

// ---- de eigenlijke run -----------------------------------------------------------------

/**
 * Spiegelt main() uit scripts/notify.js: per gezin eerst beurt-onderhoud, dan
 * aankoop-meldingen, dan de dagelijkse herinnering. De BESLISSINGEN komen alle drie uit de
 * gedeelde kern (runShiftMaintenance / purchaseNotifyPlan / familySendPlan); hier staat
 * enkel het lezen, schrijven en versturen.
 */
function run_(force) {
  var kern = laadKern_();
  var token = accessToken_();

  var now = kern.brusselsNow();
  var todayKey = kern.dayKey(now.today);
  var uur = ('0' + Math.floor(now.minutes / 60)).slice(-2) + ':' + ('0' + (now.minutes % 60)).slice(-2);
  console.log('Brussel: ' + todayKey + ' ' + uur + (force ? ' (FORCE)' : ''));

  var families = dbGet_(token, 'families') || {};
  var totaalGestuurd = 0, totaalAankoop = 0, totaalLosgemaakt = 0;

  Object.keys(families).forEach(function (fid) {
    var family = families[fid];

    // 1. Beurt-onderhoud bij ELKE run — de garantie dat de rotatie doordraait, ook als
    //    niemand met rechten de app opent. Muteert `family` in-memory, zodat de
    //    meld-berekening hierna de losgemaakte beurten al als gewone taken ziet.
    try {
      var writes = kern.runShiftMaintenance(family, now);
      var paden = Object.keys(writes);
      if (paden.length) {
        dbPatch_(token, 'families/' + fid, writes);
        var aantal = paden.filter(function (p) { return p.indexOf('settings/tasks/') === 0; }).length;
        totaalLosgemaakt += aantal;
        console.log('Beurt losgemaakt voor gezin ' + fid + ': ' + aantal + ' taak/taken.');
      }
    } catch (e) {
      console.error('Beurt-onderhoud mislukt voor ' + fid + ': ' + (e && e.message ? e.message : e));
    }

    // 2. Ouders melden bij een aankoop — los van het meld-uur, want een aankoop kan op elk
    //    moment gebeuren. Altijd markeren, ook zonder ouder-tokens: één poging per aankoop.
    try {
      var aankoop = kern.purchaseNotifyPlan(family);
      aankoop.plan.forEach(function (item) {
        aankoop.parentTokens.forEach(function (pt) {
          var res = fcmSend_(token, pt.token, {
            title: '🛒 ' + item.kidName + ' heeft iets gekocht!',
            body: '"' + item.naam + '" · ' + item.prijs + ' 💎 — nog te geven.',
            tag: 'klusjes-aankoop',
            url: '.'
          });
          if (res.ok) {
            totaalAankoop++;
          } else if (res.dood) {
            stil_(function () {
              dbDelete_(token, 'families/' + fid + '/members/' + pt.uid + '/fcmTokens/' + pt.key);
              console.log('Ouder-token opgeruimd voor ' + pt.uid + ' (' + res.code + ')');
            });
          } else {
            console.error('Aankoop-melding mislukt voor ' + pt.uid + ': ' + res.code);
          }
        });
        stil_(function () {
          dbPut_(token, 'families/' + fid + '/streaks/' + item.kidUid + '/purchases/' + item.purchaseId + '/gemeld', true);
        });
      });
    } catch (e) {
      console.error('Aankoop-meldingen mislukt voor gezin ' + fid + ': ' + (e && e.message ? e.message : e));
    }

    // 3. De dagelijkse herinnering.
    var send = kern.familySendPlan(family, now, todayKey, force);
    if (!send.due) return;

    send.plan.forEach(function (item) {
      item.tokens.forEach(function (t) {
        var res = fcmSend_(token, t.token, {
          title: ('Hey ' + item.name + ' 👋').trim(),
          body: item.body,
          tag: 'klusjes-herinnering',
          url: '.'
        });
        if (res.ok) {
          totaalGestuurd++;
        } else if (res.dood) {
          stil_(function () {
            dbDelete_(token, 'families/' + fid + '/members/' + item.uid + '/fcmTokens/' + t.key);
            console.log('Token opgeruimd voor ' + item.uid + ' (' + res.code + ')');
          });
        } else {
          console.error('Sturen mislukt voor ' + item.uid + ': ' + res.code);
        }
      });
    });

    // Eén keer per dag markeren dat de avondrun gebeurd is. Bij een handmatige testrun
    // (force) NIET, zodat de echte avondmelding nog doorgaat.
    if (!force) dbPut_(token, 'families/' + fid + '/settings/lastNotified', todayKey);
  });

  var verslag = 'Klaar. ' + totaalGestuurd + ' melding(en) verstuurd, ' + totaalAankoop +
    ' aankoop-melding(en) verstuurd, ' + totaalLosgemaakt + ' beurt(en) losgemaakt.';
  console.log(verslag);
  return verslag;
}

// ---- de gedeelde kern ophalen ----------------------------------------------------------

/**
 * Haalt scripts/notify.js op als tekst en voert het uit met een CommonJS-shim, zodat we de
 * pure planners eruit krijgen zonder ook maar één regel logica te kopiëren.
 *
 * De shim doet drie dingen:
 *   • `module`/`exports` aanbieden, want notify.js eindigt op `module.exports = {…}`;
 *   • `require` aanbieden dat gooit — notify.js roept `require('firebase-admin')` alleen
 *     aan binnenin main(), en die draait hier nooit;
 *   • `require.main = null` zetten, waardoor de `require.main === module`-test onderaan
 *     notify.js onwaar is en main() dus niet vanzelf start.
 *
 * (In een directe eval blijven `module`, `exports` en `require` uit deze functiescope
 * zichtbaar voor de uitgevoerde code — ook al staat er 'use strict' bovenaan notify.js.)
 */
function laadKern_() {
  var bron = haalBron_();
  var module = { exports: {} };
  var exports = module.exports;
  var require = function () { throw new Error('require is niet beschikbaar in Apps Script'); };
  require.main = null;
  eval(bron);
  var kern = module.exports;
  if (!kern || typeof kern.familySendPlan !== 'function') {
    throw new Error('notify.js geladen maar familySendPlan ontbreekt — is het bestand gewijzigd?');
  }
  return kern;
}

/** Probeer elke bron-URL; lukt geen enkele, gebruik dan de laatst gelukte versie. */
function haalBron_() {
  for (var i = 0; i < BRON_URLS.length; i++) {
    try {
      var res = UrlFetchApp.fetch(BRON_URLS[i], { muteHttpExceptions: true, followRedirects: true });
      if (res.getResponseCode() === 200) {
        var tekst = res.getContentText();
        // Minimale gezondheidstest vóór we iets bewaren: een foutpagina van GitHub mag
        // nooit de noodkopie overschrijven.
        if (tekst.indexOf('module.exports') !== -1 && tekst.indexOf('familySendPlan') !== -1) {
          bewaarBron_(tekst);
          return tekst;
        }
        console.error('Bron ' + BRON_URLS[i] + ' zag er niet uit als notify.js — overgeslagen.');
      }
    } catch (e) {
      console.error('Bron ' + BRON_URLS[i] + ' onbereikbaar: ' + (e && e.message ? e.message : e));
    }
  }
  var nood = leesBewaardeBron_();
  if (!nood) throw new Error('notify.js niet op te halen en geen noodkopie aanwezig.');
  console.warn('Alle bronnen onbereikbaar — noodkopie uit Scripteigenschappen gebruikt.');
  return nood;
}

function bewaarBron_(tekst) {
  var props = PropertiesService.getScriptProperties();
  var stukken = Math.ceil(tekst.length / CACHE_CHUNK);
  var nieuw = { 'BRON_STUKKEN': String(stukken) };
  for (var i = 0; i < stukken; i++) {
    nieuw['BRON_' + i] = tekst.substring(i * CACHE_CHUNK, (i + 1) * CACHE_CHUNK);
  }
  props.setProperties(nieuw);
}

function leesBewaardeBron_() {
  var props = PropertiesService.getScriptProperties();
  var stukken = Number(props.getProperty('BRON_STUKKEN') || 0);
  if (!stukken) return null;
  var uit = '';
  for (var i = 0; i < stukken; i++) uit += (props.getProperty('BRON_' + i) || '');
  return uit || null;
}

// ---- authenticatie (service account → OAuth-token) -------------------------------------

/** Wisselt de service-account-sleutel om voor een access token (met korte cache). */
function accessToken_() {
  var cache = CacheService.getScriptCache();
  var bewaard = cache.get('ACCESS_TOKEN');
  if (bewaard) return bewaard;

  var sa = serviceAccount_();
  var nu = Math.floor(Date.now() / 1000);
  var header = { alg: 'RS256', typ: 'JWT' };
  var claim = {
    iss: sa.client_email,
    scope: SCOPES,
    aud: 'https://oauth2.googleapis.com/token',
    iat: nu,
    exp: nu + 3600
  };
  var teTekenen = b64_(JSON.stringify(header)) + '.' + b64_(JSON.stringify(claim));
  var sig = Utilities.computeRsaSha256Signature(teTekenen, sa.private_key);
  var jwt = teTekenen + '.' + b64_(sig);

  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    throw new Error('Token ophalen mislukt (' + res.getResponseCode() + '): ' + res.getContentText());
  }
  var token = JSON.parse(res.getContentText()).access_token;
  cache.put('ACCESS_TOKEN', token, 3000); // token leeft 3600 s; ruim vóór het verloopt vernieuwen
  return token;
}

var _sa = null;
function serviceAccount_() {
  if (_sa) return _sa;
  var ruw = PropertiesService.getScriptProperties().getProperty('FIREBASE_SERVICE_ACCOUNT');
  if (!ruw) throw new Error('Scripteigenschap FIREBASE_SERVICE_ACCOUNT ontbreekt.');
  var sa = JSON.parse(ruw);
  if (!sa.client_email || !sa.private_key) throw new Error('FIREBASE_SERVICE_ACCOUNT is geen geldige sleutel.');
  _sa = sa;
  return _sa;
}

/**
 * Voor de kleine bijkomstige schrijfacties (een token opruimen, een `gemeld`-vlag zetten).
 * notify.js laat die bewust stilvallen (`.catch(() => {})`): mislukt er één, dan mogen de
 * overige meldingen daar niet op stuklopen — de volgende run pikt het vanzelf weer op.
 */
function stil_(fn) {
  try { fn(); } catch (e) { console.error('Bijwerking mislukt: ' + (e && e.message ? e.message : e)); }
}

/** base64url zonder opvulling — werkt zowel op een String als op een byte-array. */
function b64_(waarde) {
  return Utilities.base64EncodeWebSafe(waarde).replace(/=+$/, '');
}

// ---- Realtime Database (REST) ----------------------------------------------------------

function dbGet_(token, pad) {
  var res = dbFetch_(token, pad, { method: 'get' });
  var tekst = res.getContentText();
  return tekst && tekst !== 'null' ? JSON.parse(tekst) : null;
}

/** Eén update met meerdere paden — hetzelfde als ref(pad).update(writes) in de Admin SDK. */
function dbPatch_(token, pad, writes) {
  dbFetch_(token, pad, { method: 'patch', contentType: 'application/json', payload: JSON.stringify(writes) });
}

function dbPut_(token, pad, waarde) {
  dbFetch_(token, pad, { method: 'put', contentType: 'application/json', payload: JSON.stringify(waarde) });
}

function dbDelete_(token, pad) {
  dbFetch_(token, pad, { method: 'delete' });
}

function dbFetch_(token, pad, opties) {
  opties.headers = { Authorization: 'Bearer ' + token };
  opties.muteHttpExceptions = true;
  var res = UrlFetchApp.fetch(DB_URL + '/' + pad + '.json', opties);
  var code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('RTDB ' + opties.method + ' ' + pad + ' mislukte (' + code + '): ' + res.getContentText());
  }
  return res;
}

// ---- FCM (HTTP v1) ---------------------------------------------------------------------

/**
 * Stuurt één data-only bericht (titel/tekst maken we zelf in firebase-messaging-sw.js,
 * anders toont iOS een tweede melding).
 * Geeft { ok, dood, code } terug. `dood` = het token bestaat niet meer en mag opgeruimd.
 *
 * Bewust strenger dan notify.js: die ruimt ook bij `invalid-argument` op, maar die fout
 * kan óók op een verkeerde payload wijzen — dan zou een goed ouder-token sneuvelen. Hier
 * verdwijnt een token alleen bij een ondubbelzinnig UNREGISTERED/404. Een echt dood token
 * dat blijft hangen logt hooguit een foutregel; dat is het veiligere uiteinde.
 */
function fcmSend_(token, doelToken, data) {
  var sa = serviceAccount_();
  var payload = {
    message: {
      token: doelToken,
      data: {
        title: String(data.title),
        body: String(data.body),
        tag: String(data.tag),
        url: String(data.url)
      },
      webpush: { headers: { Urgency: 'high' } }
    }
  };
  var res = UrlFetchApp.fetch('https://fcm.googleapis.com/v1/projects/' + sa.project_id + '/messages:send', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code >= 200 && code < 300) return { ok: true, dood: false, code: String(code) };

  var foutCode = String(code);
  try {
    var body = JSON.parse(res.getContentText());
    var details = (body.error && body.error.details) || [];
    for (var i = 0; i < details.length; i++) {
      if (details[i].errorCode) { foutCode = details[i].errorCode; break; }
    }
    if (foutCode === String(code) && body.error && body.error.status) foutCode = body.error.status;
  } catch (e) { /* body niet leesbaar — de HTTP-code volstaat */ }

  return { ok: false, dood: (code === 404 || foutCode === 'UNREGISTERED'), code: foutCode };
}
