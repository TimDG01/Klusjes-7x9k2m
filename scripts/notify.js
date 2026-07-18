'use strict';
/*
 * Dagelijkse push-herinnering voor openstaande klusjes.
 * Draait als GitHub Action (elk half uur) met de Firebase Admin SDK; stuurt via FCM.
 *
 * !! LOGICA-DUPLICATIE — HOU IN SYNC MET index.html !!
 * De DB bewaart taak-DEFINITIES + rotatie-STAND + wat AFGEVINKT is (checks), niet een
 * kant-en-klaar "taken van vandaag"-lijstje. Dat berekent de app elke render; hier moeten
 * we exact dezelfde berekening overdoen. De functies hieronder (dayIndex, taskRing,
 * taskAssignee, tasksForKidDay, onDayEffIdx, shiftPendingDay, shiftEffectiveNext,
 * shiftAdvance, shiftForDay) zijn VERBATIM overgenomen uit index.html, enkel aangepast
 * zodat ze hun state via een `ctx`-object krijgen i.p.v. module-globals. Wijzigt de
 * klusjes-/beurt-berekening in index.html? Pas ze hier mee aan (zie CLAUDE.md → Meldingen).
 */

// ---- constanten (identiek aan index.html) ----
const START = new Date(2026, 5, 26);            // 26 juni 2026 — dag-index-anker
const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
const FLOORS = ['gelijkvloers', 'Verdiep ouders', 'Verdiep kinderen'];
const DEFAULT_VACUUM_WEEKDAYS = [1, 5];
const SEARCH_HORIZON = 370;
const DEFAULT_NOTIFY_TIME = '19:00';
const SHIFT_GRACE = 0; // genadevenster (dagen) vóór een vergeten beurt een gewone taak wordt; 0 = de dag ná de geplande dag al (v18.1)

// ---- dag-wiskunde ----
function dayIndex(d) {
  const clean = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((clean - START) / 86400000);
}
function dayKey(d) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function parseDayKey(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
function clampedToday(ctx) {
  const t = ctx.today;
  return t < START ? new Date(START) : t;
}

// ---- leden ----
function activeKidUids(ctx) {
  const mc = ctx.membersCache;
  return Object.keys(mc)
    .filter(uid => (mc[uid].rol || 'kind') === 'kind' && mc[uid].actief !== false)
    .sort();
}

// ---- gewone taken (platte ring+pointer) ----
function taskList(ctx) {
  const tc = ctx.tasksCache;
  return Object.keys(tc)
    .map(id => ({ id, ...tc[id] }))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}
function taskWeekdays(t) {
  return Array.isArray(t.weekdays) ? t.weekdays : ALL_WEEKDAYS;
}
function taskRing(t, ctx) {
  const mc = ctx.membersCache;
  const active = uid => mc[uid] && mc[uid].rol === 'kind' && mc[uid].actief !== false;
  const m = Array.isArray(t.members) ? t.members.filter(active) : [];
  return m.length ? m : activeKidUids(ctx);
}
function taskAssignee(t, idx, ctx) {
  const ring = taskRing(t, ctx);
  if (!ring.length) return null;
  const anchor = Number.isInteger(t.anchorIdx) ? t.anchorIdx : 0;
  const ptr = Number.isInteger(t.pointer) ? t.pointer : 0;
  const steps = t.interval === 'weekly' ? Math.floor((idx - anchor) / 7) : (idx - anchor);
  const n = ring.length;
  return ring[(((ptr + steps) % n) + n) % n];
}
function onDayEffIdx(t, ctx) {
  const od = parseDayKey(t.onDay);
  if (!od) return null;
  return Math.max(dayIndex(od), dayIndex(clampedToday(ctx)));
}
function tasksForKidDay(uid, idx, dow, ctx) {
  return taskList(ctx).filter(t => {
    if (taskAssignee(t, idx, ctx) !== uid) return false;
    if (t.onDay) { const e = onDayEffIdx(t, ctx); return e != null && idx === e; }
    return taskWeekdays(t).includes(dow);
  });
}

// ---- beurt-taken (shifts) ----
function shiftsArray(ctx) {
  const sc = ctx.shiftsCache;
  return Object.keys(sc)
    .map(id => ({ id, ...sc[id] }))
    .sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.name || '').localeCompare(String(b.name || '')));
}
function shiftMembers(sh, ctx) {
  const mc = ctx.membersCache;
  const active = uid => mc[uid] && mc[uid].rol === 'kind' && mc[uid].actief !== false;
  const m = Array.isArray(sh.members) ? sh.members.filter(active) : [];
  return m.length ? m : activeKidUids(ctx);
}
function shiftLines(sh) {
  return (Array.isArray(sh.lines) && sh.lines.length > 0) ? sh.lines : FLOORS;
}
function shiftWeekdays(sh) {
  return Array.isArray(sh.weekdays) ? sh.weekdays : DEFAULT_VACUUM_WEEKDAYS;
}
function shiftNextScheduledDayFrom(sh, d) {
  const days = shiftWeekdays(sh);
  if (!days.length) return null;
  const from = Math.max(0, dayIndex(d));
  for (let i = from; i < from + SEARCH_HORIZON; i++) {
    const dd = new Date(START); dd.setDate(dd.getDate() + i);
    if (days.includes(dd.getDay())) return dd;
  }
  return null;
}
function shiftPendingDay(sh, ctx) {
  let from = clampedToday(ctx);
  const today = from;
  const ld = sh.lastDone ? parseDayKey(sh.lastDone) : null;
  if (ld && dayIndex(ld) >= dayIndex(from)) {
    from = new Date(ld.getFullYear(), ld.getMonth(), ld.getDate() + 1);
  }
  const ov = sh.override;
  if (ov) {
    const od = parseDayKey(ov);
    if (od) {
      return dayIndex(od) >= dayIndex(from) ? dayKey(od) : dayKey(from);
    }
  }
  // Zoek de eerste geplande dag ná de laatst-gedane beurt (niet enkel vanaf vandaag).
  const searchFrom = ld ? new Date(ld.getFullYear(), ld.getMonth(), ld.getDate() + 1) : from;
  const nd = shiftNextScheduledDayFrom(sh, searchFrom);
  if (!nd) return null;
  const ndIdx = dayIndex(nd), tIdx = dayIndex(today);
  if (ndIdx >= tIdx) return dayKey(nd);              // vandaag of in de toekomst
  if (tIdx - ndIdx <= SHIFT_GRACE) return dayKey(today); // binnen venster → klem naar vandaag
  return dayKey(nd);                                 // voorbij venster → op de voorbije dag (detach volgt)
}
function shiftEffectiveNext(sh, ctx) {
  const lines = shiftLines(sh);
  const ring = shiftMembers(sh, ctx);
  const n = sh.next;
  if (n && ring.includes(n.uid) && Number.isInteger(n.lineIdx)) {
    return { uid: n.uid, lineIdx: ((n.lineIdx % lines.length) + lines.length) % lines.length };
  }
  return ring.length ? { uid: ring[0], lineIdx: 0 } : null;
}
function shiftAdvance(sh, combo, steps, ctx) {
  const ring = shiftMembers(sh, ctx);
  const lines = shiftLines(sh);
  const ri = ring.indexOf(combo.uid);
  const nr = ring.length;
  return {
    uid: nr ? ring[(((ri < 0 ? 0 : ri) + steps) % nr + nr) % nr] : combo.uid,
    lineIdx: ((combo.lineIdx + steps) % lines.length + lines.length) % lines.length
  };
}
function shiftForDay(sh, d, ctx) {
  const lines = shiftLines(sh);
  const snap = ctx.daysToday.shift && ctx.daysToday.shift[sh.id];
  if (snap && snap.uid) {
    const li = lines.indexOf(snap.line);
    return { uid: snap.uid, line: snap.line, lineIdx: li >= 0 ? li : null, mode: 'done' };
  }
  const key = dayKey(d);
  const pKey = shiftPendingDay(sh, ctx);
  if (pKey && key === pKey) {
    const n = shiftEffectiveNext(sh, ctx);
    return n ? { uid: n.uid, lineIdx: n.lineIdx, line: lines[n.lineIdx], mode: 'pending' } : null;
  }
  const idx = dayIndex(d);
  if (idx < dayIndex(clampedToday(ctx))) return null;
  if (pKey && idx > dayIndex(parseDayKey(pKey)) && shiftWeekdays(sh).includes(d.getDay())) {
    const base = shiftEffectiveNext(sh, ctx);
    if (!base) return null;
    let steps = 0;
    for (let i = dayIndex(parseDayKey(pKey)) + 1; i <= idx; i++) {
      const dd = new Date(START); dd.setDate(dd.getDate() + i);
      if (shiftWeekdays(sh).includes(dd.getDay())) steps++;
    }
    const c = shiftAdvance(sh, base, steps, ctx);
    return { uid: c.uid, lineIdx: c.lineIdx, line: lines[c.lineIdx], mode: 'projected' };
  }
  return null;
}

// ---- de kern: welke klusjes staan vandaag open voor kind `uid` ----
// Spiegelt de id-set die index.html in render() als "de dag van dit kind" gebruikt:
// gewone/roterende taken + doorgeschoven beurten (fromShift-taken, via tasksForKidDay) +
// de ene openstaande ('pending') beurt-turn. "Open" = niet afgevinkt in days/{vandaag}/checks.
// Bevroren eenmalige snaps tellen niet: die bestaan alleen ná afvinken (dus altijd gedaan).
function openChoresFor(uid, ctx) {
  const idx = dayIndex(ctx.today);
  const dow = ctx.today.getDay();
  const checks = (ctx.daysToday.checks && ctx.daysToday.checks[uid]) || {};
  const out = [];
  for (const t of tasksForKidDay(uid, idx, dow, ctx)) {
    if (checks[t.id] !== true) out.push(String(t.label || 'Klusje'));
  }
  for (const sh of shiftsArray(ctx)) {
    const info = shiftForDay(sh, ctx.today, ctx);
    if (info && info.mode === 'pending' && info.uid === uid && checks['shift-' + sh.id] !== true) {
      out.push(`🔁 ${sh.name || 'Beurt'}: ${info.line}`);
    }
  }
  return out;
}

// ---- auto-losmaken van een verlopen beurt (v18) ----
// Spiegelt shiftAutoDetachIfLapsed/detachShiftTurn uit index.html. Puur/testbaar: geeft de
// detach-actie voor één verlopen beurt terug (of null), zonder te schrijven. Ligt de eerste
// geplande dag ná lastDone méér dan SHIFT_GRACE dagen in het verleden en is er geen override,
// dan wordt die beurt een verschuifbare eenmalige taak en schuift de rotatie één stap door.
// Sleutel is DETERMINISTISCH (`shift-{id}-{dueDay}`) → client + server (en herhaalde runs)
// overschrijven i.p.v. dubbel aan te maken (idempotent).
function shiftDetachPlan(sh, ctx) {
  if (sh.override) return null;
  const today = clampedToday(ctx), tIdx = dayIndex(today);
  const ld = sh.lastDone ? parseDayKey(sh.lastDone) : null;
  const from = ld ? new Date(ld.getFullYear(), ld.getMonth(), ld.getDate() + 1) : today;
  const nd = shiftNextScheduledDayFrom(sh, from);
  if (!nd) return null;
  if (tIdx - dayIndex(nd) <= SHIFT_GRACE) return null; // nog binnen het venster (of toekomst)
  const n = shiftEffectiveNext(sh, ctx);
  if (!n) return null;
  const lines = shiftLines(sh);
  const li = ((n.lineIdx % lines.length) + lines.length) % lines.length;
  const dueDayKey = dayKey(nd);
  return {
    dueDayKey,
    taskId: 'shift-' + sh.id + '-' + dueDayKey,
    task: {
      label: `🔁 ${sh.name || 'Beurt'}: ${lines[li]}`,
      recurring: false,
      members: [n.uid],
      onDay: dueDayKey,
      fromShift: sh.id,
      fromShiftDay: dueDayKey,
      order: Date.now()
    },
    next: shiftAdvance(sh, { uid: n.uid, lineIdx: li }, 1, ctx),
    lastDone: dueDayKey
  };
}

// Onderhoud per gezin: maak alle verlopen beurten los (bounded loop tot convergentie, want
// er kunnen meerdere gemiste dagen op de rij staan). Muteert familyData in-memory zodat de
// meld-berekening hierna de losgemaakte taken al als gewone taken ziet, en geeft de platte
// schrijf-paden (relatief t.o.v. families/{fid}) terug voor één admin-update.
function runShiftMaintenance(familyData, now) {
  const settings = familyData.settings || (familyData.settings = {});
  if (!settings.tasks) settings.tasks = {};
  if (!settings.shifts) settings.shifts = {};
  const ctx = {
    membersCache: familyData.members || {},
    tasksCache: settings.tasks,
    shiftsCache: settings.shifts,
    today: now.today
  };
  const writes = {};
  for (const id of Object.keys(ctx.shiftsCache)) {
    let guard = 0;
    while (guard++ < 400) {
      const cur = { id, ...ctx.shiftsCache[id] };
      const plan = shiftDetachPlan(cur, ctx);
      if (!plan) break;
      writes[`settings/tasks/${plan.taskId}`] = plan.task;
      writes[`settings/shifts/${id}/next`] = plan.next;
      writes[`settings/shifts/${id}/lastDone`] = plan.lastDone;
      writes[`settings/shifts/${id}/override`] = null;
      // in-memory bijwerken zodat de volgende iteratie/meld-berekening klopt
      ctx.tasksCache[plan.taskId] = plan.task;
      ctx.shiftsCache[id].next = plan.next;
      ctx.shiftsCache[id].lastDone = plan.lastDone;
      delete ctx.shiftsCache[id].override;
    }
  }
  return writes;
}

// ---- Brussel-tijd (zomertijd/wintertijd automatisch via de tijdzone) ----
function brusselsNow(dateArg) {
  const d = dateArg || new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(d).reduce((o, p) => (o[p.type] = p.value, o), {});
  const y = +parts.year, m = +parts.month, day = +parts.day;
  const hh = +parts.hour % 24, mm = +parts.minute;
  return { today: new Date(y, m - 1, day), minutes: hh * 60 + mm };
}
function timeToMinutes(hhmm) {
  const m = String(hhmm).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

// ---- per gezin: moet er nu gestuurd worden, en aan wie? (puur, testbaar) ----
// Geeft { due, plan } terug. `due` = de tijd is bereikt en er is vandaag nog niet gestuurd
// (→ de aanroeper zet lastNotified). `plan` = [{ uid, name, body, tokens:[{key,token}] }].
function familySendPlan(familyData, now, todayKey, force) {
  const settings = familyData.settings || {};
  const notifyTime = settings.notifyTime || DEFAULT_NOTIFY_TIME;
  if (notifyTime === 'uit') return { due: false, plan: [] };
  // `force` (handmatige testrun): sla de tijd- en dedup-guards over — maar respecteer wél
  // "uit", en stuur nog steeds enkel naar kinderen met openstaande klusjes + een token.
  if (!force) {
    const target = timeToMinutes(notifyTime);
    if (target == null) return { due: false, plan: [] };
    if (now.minutes < target) return { due: false, plan: [] };
    if (settings.lastNotified === todayKey) return { due: false, plan: [] };
  }

  const membersCache = familyData.members || {};
  const daysToday = (familyData.days && familyData.days[todayKey]) || {};
  const ctx = {
    membersCache,
    tasksCache: settings.tasks || {},
    shiftsCache: settings.shifts || {},
    daysToday,
    today: now.today
  };
  const plan = [];
  for (const uid of activeKidUids(ctx)) {
    const open = openChoresFor(uid, ctx);
    if (!open.length) continue;
    const tokMap = membersCache[uid].fcmTokens || {};
    const tokens = Object.keys(tokMap).map(key => ({ key, token: tokMap[key] })).filter(t => t.token);
    if (!tokens.length) continue;
    const shown = open.slice(0, 5);
    const body = 'Nog te doen: ' + shown.join(', ') + (open.length > shown.length ? ' …' : '');
    plan.push({ uid, name: membersCache[uid].weergavenaam || '', body, tokens });
  }
  return { due: true, plan };
}

module.exports = {
  dayIndex, dayKey, parseDayKey, openChoresFor, familySendPlan,
  brusselsNow, timeToMinutes, activeKidUids, tasksForKidDay, shiftForDay,
  shiftPendingDay, shiftDetachPlan, runShiftMaintenance
};

// ---- live uitvoering (enkel wanneer direct gedraaid, niet bij require in tests) ----
if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}

async function main() {
  const admin = require('firebase-admin');
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) { console.error('FIREBASE_SERVICE_ACCOUNT ontbreekt.'); process.exit(1); }
  const serviceAccount = JSON.parse(raw);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://klusjesv2-default-rtdb.europe-west1.firebasedatabase.app'
  });
  const db = admin.database();
  const messaging = admin.messaging();

  const now = brusselsNow();
  const todayKey = dayKey(now.today);
  const force = process.env.FORCE === 'true' || process.env.FORCE === '1';
  console.log(`Brussel: ${todayKey} ${String(Math.floor(now.minutes / 60)).padStart(2, '0')}:${String(now.minutes % 60).padStart(2, '0')}${force ? ' (FORCE)' : ''}`);

  const families = (await db.ref('families').get()).val() || {};
  let totalSent = 0;
  let totalDetached = 0;

  for (const fid of Object.keys(families)) {
    // v18: beurt-onderhoud bij ELKE run (los van het meld-uur) — de garantie dat de rotatie
    // doordraait ook als niemand met rechten de app opent. Muteert families[fid] in-memory,
    // zodat de meld-berekening hierna de losgemaakte beurten al als gewone taken meeneemt.
    try {
      const writes = runShiftMaintenance(families[fid], now);
      const paths = Object.keys(writes);
      if (paths.length) {
        await db.ref(`families/${fid}`).update(writes);
        totalDetached += paths.filter(p => p.startsWith('settings/tasks/')).length;
        console.log(`Beurt losgemaakt voor gezin ${fid}: ${paths.filter(p => p.startsWith('settings/tasks/')).length} taak/taken.`);
      }
    } catch (e) {
      console.error(`Beurt-onderhoud mislukt voor ${fid}:`, (e && e.message) || e);
    }

    const { due, plan } = familySendPlan(families[fid], now, todayKey, force);
    if (!due) continue;

    for (const item of plan) {
      for (const { key, token } of item.tokens) {
        try {
          await messaging.send({
            token,
            data: {
              title: `Hey ${item.name} 👋`.trim(),
              body: item.body,
              tag: 'klusjes-herinnering',
              url: '.'
            },
            webpush: { headers: { Urgency: 'high' } }
          });
          totalSent++;
        } catch (e) {
          const code = (e && e.code) || (e && e.errorInfo && e.errorInfo.code);
          if (code === 'messaging/registration-token-not-registered' ||
              code === 'messaging/invalid-registration-token' ||
              code === 'messaging/invalid-argument') {
            // dood token opruimen zodat het niet blijft falen
            await db.ref(`families/${fid}/members/${item.uid}/fcmTokens/${key}`).remove().catch(() => {});
            console.log(`Token opgeruimd voor ${item.uid} (${code})`);
          } else {
            console.error(`Sturen mislukt voor ${item.uid}:`, code || (e && e.message));
          }
        }
      }
    }
    // Eén keer per dag: markeer dat de avondrun voor dit gezin gebeurd is. Bij een
    // handmatige testrun (force) NIET zetten, zodat de echte avondmelding nog doorgaat.
    if (!force) await db.ref(`families/${fid}/settings/lastNotified`).set(todayKey);
  }

  console.log(`Klaar. ${totalSent} melding(en) verstuurd, ${totalDetached} beurt(en) losgemaakt.`);
  process.exit(0);
}
