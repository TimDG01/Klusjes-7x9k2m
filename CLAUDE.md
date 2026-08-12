# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## The app in one paragraph

**Klusjes-PWA v21.3** (`VERSION` = `klusjes-pwa v21.3`): a Dutch-language family chores app —
multi-family, Firebase Auth (parent + child login), rotating tasks (flat ring+pointer model)
and completion-driven "shift" turn tasks, streaks & badges, 💎 diamonds + a reward shop,
🏖️ vacation days, 📝 kid-added own chores (that count for nothing), and push reminders.
The app itself is **one static file, `index.html`** (inline CSS + one
`<script type="module">`), zero dependencies, no build step, hosted on GitHub Pages from
`main`. Companion files: `manifest.json` + `icon-*.png` + `firebase-messaging-sw.js` (PWA +
push), `firebase-rules-v16.json` (RTDB rules, paste-ready for the Console), `scripts/`
(server half: `notify.js` + the Apps Script runner that drives it) + `.github/workflows/`
(manual fallback), and **`test/`** (headless suite + fake Firebase SDK).
Docs live in **`docs/`**: `CHANGELOG.md` (what shipped per version) and `PLAN-v16.md` /
`PLAN-v17-meldingen.md` / `PLAN-v18-beurten.md` / `PLAN-v19-beloningen.md` /
`PLAN-v20-vakantie.md` / `PLAN-v21-eigen-klusjes.md` (frozen build logs — the *why* behind
big decisions; this file is the working summary).
**`index.html`, `manifest.json`, `firebase-messaging-sw.js` and `icon-*.png` must stay at
the repo root** — Pages serves the root and the service worker's scope depends on its
location.

## Workflow for every change (checklist)

1. **Work on a feature branch** — never directly on `main` (`main` = the live app).
2. Make the change in `index.html` (the only app file).
3. New inline `onclick` handler? → add it to the **`Object.assign(window, {...})`** export
   at the bottom of the script, or it silently does nothing.
4. **Verify with the committed suite**: `cd test && npm install && npm test`. New behaviour
   gets a case in an existing `test/*.test.js` or a new one — **reuse `test/fake-firebase.js`
   as-is; never hand-roll another fake SDK** (that is exactly what this folder ends). Never
   verify against production data, never via the real ⚙️ Beheer / 👨‍👩‍👧 Gezin flows.
5. **Bump `VERSION`** in the same commit, following the version policy below.
6. **Add a `docs/CHANGELOG.md` entry** (Dutch, one short bullet list per version).
7. Commit (clear NL message) + push to the feature branch.
8. **Pushing/merging to `main` deploys to every device — only do this when the user
   explicitly asks.**
9. Changed anything in `firebase-rules-v16.json`? → **tell the user explicitly**: they must
   paste the updated file into the Firebase Console themselves, or the feature fails
   silently at the rules (UI works, writes rejected).

## Version policy

`VERSION` (constant near the top of the script, shown in the footer) is how a device
verifies which build it runs.

- **Small change** (bugfix, tweak, small feature): minor bump — `v16.1`, `v16.2`, …
- **Big change** (major feature, refactor, data-model change): major bump — `v17`.
- Format: `klusjes-pwa v16.1`. Bump in the same commit as the change; every bump gets a
  CHANGELOG entry. Never ship a behavior change under an unchanged VERSION.

## Golden rules (never break these)

- **Every DB ref via `dbRef(path)` / `rootUpdate(obj)`** — never bare `ref(db, ...)`. Only
  the two top-level pointers (`userIndex`, `familyCodes`) go via `baseRef`. Anything else
  escapes the family scope and the `?test` sandbox.
- **Every inline `onclick` handler must be in `Object.assign(window, {...})`** — a module
  script has no implicit globals; forgetting this is the classic silent bug here.
- **`escapeHtml()` around all user-entered free text** (task labels, display names, family
  name) at render time. This app has shipped a stored-XSS bug before.
- **`weekdays` absent vs `[]` is load-bearing**: absent = every day, `[]` = never. Always
  `Array.isArray(...)` checks, never truthiness/length.
- **Array-shaped fields (`weekdays`, `lines`, `members`) are always written whole** in one
  `update()` — never a nested numeric index (Firebase sparse-array coercion).
- **A new synced top-level path needs a manual Console rule** (plus the `/test` mirror) —
  a missing rule shows "Geen verbinding" or hangs the app.

## Commands

There is no build or lint step — the app is a single static file. There **is** a committed
test suite in **`test/`** (Node + Playwright; `node_modules` is gitignored).

- **Production / deploy**: **GitHub Pages serves the `main` branch** — every push to `main`
  auto-deploys (live within a couple of minutes, plus up to ~10 min HTTP cache). The family
  uses an iOS home-screen bookmark; a fully closed-and-reopened app picks up a deploy
  automatically; the footer `VERSION` verifies the build. Pages on the free plan requires a
  public repo, so **making this repo private would take the app offline**.
- **Branch preview — the user's standing preference.** Pages only serves `main`, so when the
  user asks for a link to try a feature branch on their phone, always give a **githack** URL:
  `https://raw.githack.com/TimDG01/Klusjes-7x9k2m/<branch>/index.html` — append `?test` for
  the sandboxed variant, and a `?v=<n>` cache-buster when they report a stale version. Don't
  propose alternatives unless githack fails. Two limits worth repeating to the user: push
  notifications and the home-screen icon **don't** work there (they need the Pages origin +
  an installed PWA), and without `?test` they are logged into the **real** family data.
- **Firebase project**: `klusjesv2` (config inline in `index.html`; the visible apiKey is a
  public identifier, not a secret — access control lives in Auth + the rules), with Auth
  (email/password) enabled and the rules from `firebase-rules-v16.json` applied.
- **Run locally**: open `index.html` directly (`file://`). No server. The app shows an
  **auth screen first** — there's no data until you log in (or use the fake backend below).
- **Verification (the standard way)** — `cd test && npm install && npm test`. Headless
  Playwright loads the real `index.html` via `file://` and intercepts the Firebase CDN
  imports with `page.route().fulfill()`, serving an **in-memory fake SDK** instead: no
  network, no real family data. **Reuse `test/fake-firebase.js` — do not rewrite it.**
  `openApp(browser, { seed, user })` opens a page with the fake in place, where `seed` is
  the whole database tree and `user` the already-logged-in uid; it returns `{ page, dialogs }`
  (`dialogs` collects every `alert()`/`confirm()` text). Pass `query: 'test'` to open the
  sandbox variant — the seed then has to be nested under a `test` key, because `BASE_ROOT`
  prefixes every path (see `test/testmodus-datum.test.js`). Inside the page,
  `window.__store.root` is the database and `window.__flushDb()` fires listeners after a
  direct poke. Add a test as `test/*.test.js` using `test/assert.js`; `test/README.md` has
  the details. Four fake-SDK properties were learned the hard way and must not be
  "simplified" away: (1) `val()` returns dense integer-keyed nodes as **arrays** (like real
  RTDB), or every `Array.isArray(weekdays)` check silently falls back to "every day";
  (2) listeners notify **asynchronously, coalesced, and only on real change** — a synchronous
  notify inside a write causes re-entrant renders with stale caches that the real
  (always-async) SDK can't produce (this once caused an infinite completion-flag loop);
  (3) child-account creation uses a **second app instance**, so fake auth keeps per-instance
  state; (4) `push(ref, value)` must **write** the value, not just mint a key — otherwise
  every "add" button silently does nothing in tests. Pure helpers in `scripts/notify.js` are
  testable in plain Node (see `test/notify.test.js`) — no browser needed;
  `test/appsscript-loader.test.js` additionally loads that file the way Apps Script does, so
  a change that would break the live reminders shows up as a red test.
- **Testing gotchas**: the celebration popup overlays the card once a day is complete, so
  dismiss `.celebration-close` before the next click; Beheer sections are collapsed by
  default, so open the right `'sec:*'` row before asserting on its contents; for a visual
  change, take a screenshot and *look* at it — **`cd test && npm run shot`** does exactly that
  (`test/screenshot.js`, same fake SDK, light **and** dark, output in the gitignored
  `test/screenshots/`). Don't hand-roll a throwaway screenshot script: add a scenario to its
  `SCENARIOS` map instead, so the next change can reuse it.
  Three seeding traps, each of which produced a wrong test before a wrong diagnosis:
  (1) **a seed without `settings/shifts` gets `DEFAULT_SHIFTS` written into it** ("Stofzuigen",
  Mon+Fri), so an extra row appears on some weekdays and the day is never complete — seed the
  node explicitly, e.g. `weekdays: [7]` (a non-existent weekday: the node exists but never
  yields a turn); (2) **`weekdays: []` cannot be seeded** — RTDB and the fake SDK don't store
  an empty array, so the field reads as *absent* = "every day"; build an empty day via
  `members` instead; (3) **seeding a completion flag for a day whose chores aren't checked**
  is correctly removed again by the un-flag branch in `render()` — seed the matching
  `days/{key}/checks/{uid}` too.
- **Manual acceptance on a real device**: append `?test` to the URL. `BASE_ROOT` becomes
  `'test/'` and **every** database path — the family subtree, the two top-level pointers,
  and the keys of root-level multi-path updates — lives under `/test/...`, self-seeded by
  the normal flows; the footer shows a red TESTMODUS marker. `?test` only works if the RTDB
  rules include the `/test` rule. Cleanup = delete `/test`.
- **🧪 Moving the clock (`?test` only, v21.1).** In the sandbox a bar at the top (`#testbar`,
  outside `#app` so the `<input type="date">` keeps focus across renders) lets you pick which
  day the app treats as **today** — the way to exercise streaks, badges, diamonds, vacations
  and shift turns across days without waiting. Kept in `localStorage`
  (`klusjes-test-today`), the field turns amber while shifted, ↺ restores the real date.
  **`todayDate()` is the single source of "today"** and everything routes through it
  (`clampedToday`, `simulateStreak`, the diamond gate in `writeCompletionFlag`, `isToday`,
  `goToday`, the badge "new" marker) — a new `new Date()` that means *today* is a bug; use
  `todayDate()`. The one deliberate exception is `meta/aangemaakt` at family creation, which
  records a real-world fact. Outside `?test` the whole thing is inert: `testTodayKey` stays
  `null`, no bar is drawn, and `setTestToday` is a no-op.
- Outbound network to `gstatic.com`/Firebase may be blocked in sandboxed environments
  (proxy 403) — the fake-backend and Node approaches never hit the network.

## Architecture

Everything lives in `index.html`: inline CSS, then a single `<script type="module">` with
all app logic. No framework, no bundler — UI is built by string-templating HTML into
`#app`'s `innerHTML` on every state change (a full `render()` call), with
`onclick="handler(...)"` attributes wired to plain functions. A top-of-script NL comment
block summarizes the account/data model.

### Accounts, families & data scoping
- **Multi-family.** All app data lives under `families/{familyId}/…`. The magic is
  `DB_ROOT`: after login the app resolves the user's family (`/userIndex/{uid}` →
  `familyId`) and sets `DB_ROOT = BASE_ROOT + 'families/{familyId}/'`. `BASE_ROOT` is `''`
  normally, `'test/'` under `?test`. Every DB access goes through `dbRef(path)` or
  `rootUpdate(obj)` (root-level multi-path updates — prefixes each key with `DB_ROOT`), so
  all paths nest under the family automatically.
- **The only two top-level nodes** are the lookup tables `/familyCodes/{CODE6}: familyId`
  and `/userIndex/{uid}: familyId` — the signposts you need *before* you know your
  `familyId`. They are reached via `baseRef(path)` (BASE_ROOT prefix only, no family
  scope) — the deliberate exception to the `dbRef` rule. Never fold real data into a
  top-level path.
- **Accounts.** A **parent** is a real email+password account. A **child** is a username +
  PIN: the app maps it to a synthetic email `{normalized-username}@kids.klusjesv2.app` and
  uses the PIN (≥4 digits entered, padded internally) as the password. Firebase rejects
  duplicate emails, so usernames are globally unique for free. Everyone stays logged in via
  `browserLocalPersistence` until explicit logout. `isParent()` / `isChild()` gate
  role-specific UI and routes; `authUser` holds the current Firebase user.
- **Creating a child needs a second app instance.** `createUserWithEmailAndPassword` on the
  primary app would log the parent out. So child creation spins up a temporary
  `initializeApp(config, 'secondary-…')` + `getAuth(secondaryApp)`, creates the child
  there, writes the child's own `userIndex/{kidUid}` **as the child** (rules: self-only),
  then writes `members/{kidUid}` **as the parent** on the primary app, and finally
  `signOut(secondaryAuth)` + `deleteApp(secondaryApp)` in a `finally`. Same trick for PIN
  reset (needs the old PIN). A forgotten PIN is a known limitation — client-side you can't
  reset another account's password without the Admin SDK / a Cloud Function.
- **Members.** `families/{fid}/members/{uid}: { rol:'ouder'|'kind', weergavenaam,
  gebruikersnaam?, kleur, actief, magVerschuiven?, fcmTokens? }`. `activeKids()` returns
  active child members (sorted by uid — stable across renames); kid colors come from the
  member record. Removing a child is a **soft-delete** (`actief:false`) so history/streaks
  survive; the login account itself can't be deleted client-side. `magVerschuiven` is the
  per-kid permission flag "may move own shift turns" (absent = no): it lives on the member
  record deliberately — no extra listener (membersCache already loads) and the rules read
  the same flag server-side, so toggling it off is actually enforced, not just hidden UI.
  Read via `kidMayMove(uid)`; the combined "may the *logged-in* user move kid X's turn"
  check is `mayMoveShiftOf(uid)` (parent: always; child: own turn + flag).
- **Which days a child may (un)check — `settings/kidCheckScope`.** Family-wide, set by a
  parent in Beheer → Instellingen via a `<select>` (`kidCheckScopeOptions`/`setKidCheckScope`,
  same pattern as `notifyTime`); read by a **no-gate/non-fatal** listener into
  `kidCheckScopeKey`, reset in `teardownFamily`. Values: `'alles'` (every day),
  `'geen-verleden'` (today + future), `'enkel-vandaag'` (today only), `'nooit'` (parent
  only). **Absent = `'alles'`** — schema-additive, so existing families are untouched.
  One helper carries the whole rule *and* the wording: `checkBlockReason()` returns `null`
  when allowed, else the message to `alert()`. Call it at the top of **`toggleTask`** and
  **`toggleShift`** — the only two check-write paths, so `taskRow`, `shiftRow` **and**
  `owedShiftRow` (which routes through `toggleTask`) are all covered without touching
  render. A parent always passes. ⚠️ **Client-side only**: `days/$dayKey` is an opaque
  wildcard in the rules and RTDB can't compute "today", so this can't be enforced
  server-side — same category as the parent-only un-freeze of a one-off. Deliberately *not*
  extended to the shift move buttons (⏮/⏭), which already only act on today or later.
- Bootstrap ordering matters: creating a family writes
  `meta`+`members`+`familyCodes`+`userIndex` first, and `settings/*` in a **second**
  update — the settings rule is parent-only based on the *pre-write* `root`, so the creator
  must already be a recorded parent-member before seeding defaults. Follow this split if
  you touch family creation.

### Data model (Firebase Realtime Database, all under `families/{familyId}/`)
```
settings/tasks/{taskId}: { label, recurring, order, weekdays?, members?, interval?,
                           anchorIdx?, pointer?, onDay?, fromShift? }   // flat task, ring+pointer rotation
settings/shifts/{shiftId}: { name, weekdays[], lines[], members?[], next?:{uid,lineIdx},
                             override?:'yyyy-M-d', lastDone?:'yyyy-M-d', order? }   // completion-driven turn task
settings/streakStart: 'yyyy-M-d'                       // streak/badge launch floor; DEFAULT_STREAK_START (9 jul 2026) fallback
settings/kidCheckScope: 'alles'|'geen-verleden'|'enkel-vandaag'|'nooit'   // which days a CHILD may (un)check; absent = 'alles'
settings/vrijeDagen/{dayKey}/{uid}: true               // 🏖️ vacation: that kid has no chores that day; absent = normal day
settings/notifyTime: 'HH:MM'|'uit'                     // per-family reminder hour; settings/lastNotified = server dedup flag
settings/rewards/{id}: { naam, omschrijving, diamanten, order, icoon? }  // reward catalogue (parent-only)
settings/rewardImages/{id}: 'data:image/jpeg;base64,…'            // separate path, lazily loaded
settings/rewardClaims/{id}: { uid, rewardId, naam, diamanten, dag }  // legacy (pre-v19.7 approved redemptions); still counted as spent
days/{yyyy-M-d}/checks/{uid}/{taskId}: boolean         // per-day checked state, incl. 'shift-{shiftId}' for turn tasks
days/{yyyy-M-d}/snap/{uid}/{taskId}: { label, order, weekdays?, members?, … }   // frozen one-off, written at check-off
days/{yyyy-M-d}/shift/{shiftId}: { uid, line }         // frozen turn-task history
streaks/{uid}/days/{yyyy-M-d}: true                    // completion flag: that kid finished everything that day
streaks/{uid}/badges/b{n}: 'yyyy-M-d'                  // n-th badge (ordinal key), value = earn-day; permanent
streaks/{uid}/diamonds/{yyyy-M-d}: 1|4                 // earning ledger; 'bonus-{ts}': ±n for a manual parent adjustment
streaks/{uid}/eigenTaken/{id}: { label, order, onDay?, gedaanOp?:{dayKey:true} }
                                                       // 📝 klusje dat het kind zelf toevoegde; telt nergens mee
streaks/{uid}/purchases/{id}: { rewardId, naam, diamanten, dag, icoon?, gegeven?, gemeld? }
                                                       // child buys directly; gegeven = day handed over; gemeld = server-written, alert sent

/familyCodes/{CODE6}: familyId    // top-level pointer (baseRef)
/userIndex/{uid}: familyId        // top-level pointer (baseRef)
```
- Each independent piece of remote state gets its **own permanent `onValue` listener** plus
  its own `*Loaded` boolean gate (`tasksLoaded`, `vacuumLoaded` [covers shifts], `dayLoaded`,
  `streaksLoaded`, `metaLoaded`, `membersLoaded`), all of which `render()` waits on. These
  listeners start in `initFamily()` **after** login + family resolution (not at module load).
  A new piece of synced state should follow this pattern. `teardownFamily()` (on logout)
  detaches them all and resets caches/gates/`DB_ROOT`, so re-login starts clean.
- **Extra layers must be non-fatal.** The `/streaks` listener and the settings listeners
  (`streakStart`, `notifyTime`, `kidCheckScope`, `rewards`, `rewardClaims`) have **no load
  gate**: an absent node means "nothing yet" and a *read error* falls back to an empty cache
  without hanging the app. Only tasks/shifts/day/members are fatal (errors set `loadError` →
  connection-error screen). Badges, diamonds and rewards must never take the core down.
- The day listener (`attachDayListener`) is torn down and reattached on every
  `changeDay`/`goToday`, using an incrementing `dayListenerToken` to make stale callbacks
  no-ops. Any new per-day-scoped listener should reuse this token pattern, not the day-key.
- `weekdays: number[]` (0=zondag..6=zaterdag, matches `Date.getDay()` and `WD`): **absent =
  every day**, **explicit `[]` = never active**. See `taskWeekdays`/`shiftWeekdays`.
- **Legacy in-memory migration:** an older DB with A/B/uid task *buckets* is detected
  (`looksLikeBuckets`) and converted on load (`migrateTaskBuckets`), then written flat once
  by the first parent (`maybeMigrateTasks`).

### Task semantics (flat rotation model — `settings/tasks/{taskId}`)
Rotation is a per-task **ring + pointer** (A/B buckets are gone):
- `taskRing(t)` = the participant order. `members` empty/absent = all active kids;
  otherwise exactly that subset (filtered to still-active kids). **One participant = a
  fixed task** (`isFixedTask`, shows the 👤 marker).
- `taskAssignee(t, dayIdx)` = `ring[((pointer + steps) % n + n) % n]`, with `steps =
  interval === 'weekly' ? floor((dayIdx - anchorIdx)/7) : (dayIdx - anchorIdx)`.
  `anchorIdx`/`pointer` are adjustable (admin ⏮/⏭ via
  `advanceTaskPointer`/`rewindTaskPointer`).
- `tasksForKidDay(uid, idx, dow)` picks a kid's tasks for a day: assignee must match, then
  either the `onDay` exact-date pin or the weekday filter.
- `recurring:false` (one-off): same visibility rule, but the moment it's checked it's
  `remove()`d from `settings/tasks` — gone from every other day. Check-off first
  **freezes** the task into `days/{key}/snap/{uid}/{taskId}` (label/order + full rotation
  via `copyRotation`), *then* removes the definition; `daySnapsFor()` merges frozen rows
  back at render time. Un-checking restores the definition from the snapshot and deletes
  the snapshot. Both directions are each a **single root-level multi-path
  `rootUpdate({...})`** — keep them atomic. Restoring a definition is a settings write, so
  **un-checking a frozen one-off is parent-only**; the child UI explains this.
- **`onDay: 'yyyy-M-d'`** pins a task to one exact day instead of a weekday pattern
  (absent = normal weekday behavior). Its *effective* day self-heals: `onDayEffIdx(t)`
  returns `max(onDayIdx, todayIdx)`, so a lapsed unchecked pin slides forward to today
  instead of vanishing (same idea as a shift's past `override`).
  **`fromShift: shiftId`** tags a task as a detached turn (see Shifts): `renderAdminTasks`
  hides it from Beheer, and `renderCard` draws it via `owedShiftRow` (a movable beurt row)
  instead of a plain `taskRow`. Both fields are carried through freeze/restore by
  `copyRotation`.

### Shift tasks (turn tasks — `settings/shifts/{shiftId}`)
A shift task rotates one *person* + one *line* per turn, **completion-driven**.
`settings/shifts/{shiftId}/next` holds the one open turn as `{uid, lineIdx}`; it only
advances (person steps through the ring, line cycles) when the turn is checked off. The
pointer stores the **uid** (robust across member changes), not an index. Empty `members` =
all active kids; the ring is always filtered to still-active kids. Key functions:
`shiftPendingDay`, `shiftEffectiveNext`, `shiftAdvance`, `shiftForDay` (returns mode
`done`/`pending`/`projected`), `shiftsForKid`, `toggleShift`.
- Exactly **one** interactive ("pending") turn exists across all days. `shiftPendingDay()`
  picks the day: an `override` date wins over the weekday schedule, but an override that has
  slipped into the *past* is **clamped forward to today** (read-path only, self-heals each
  render, no write). A day matching `lastDone` is skipped. Future scheduled days show a
  dimmed **projection** (excluded from the progress bar) that **is** clickable — checking it
  completes that projected turn and jumps the pointer past it, letting an earlier open turn
  lapse silently (a parent covering a skipped turn must not block the rotation). Past days
  render from the frozen `days/{key}/shift/{shiftId}` snapshot.
- **`SHIFT_GRACE = 0`**: a missed turn shows as a pending shift only on its own scheduled
  day; the next day it is auto-detached into a movable one-off while the rotation advances.
  The clamp branch in `shiftPendingDay` (`tIdx - ndIdx <= SHIFT_GRACE → today`) is therefore
  inert, but kept as a tunable: `n > 0` would hold a missed turn on today for `n` extra days
  before detaching. Keep `index.html` and `scripts/notify.js` on the same value.
- Per-kid check-off writes `days/{key}/checks/{uid}/shift-{shiftId}`. **A child can complete
  their own turn** (rules allow member writes to `checks/{uid}`, `days/.../shift`, and the
  shift pointer fields `next`/`override`/`lastDone`). The two move buttons (⏮ `shiftPrepone`
  one day earlier, ⏭ `shiftPostpone` one day later) are gated by `mayMoveShiftOf(uid)` —
  and the same check guards the handlers themselves, not just the buttons.
- Un-checking a turn only rewinds the pointer when the day matches `lastDone` (the
  just-completed turn); older checked days toggle freely. That rewind also restores
  `override` to the day (check-off clears it), so a moved turn doesn't snap back to the
  next scheduled weekday and appear to vanish.
- **Detach = keep rotating** (the fix for "de beurt draait niet meer door"). Both the manual
  ⏭ and the automatic lapse-detach funnel through one helper
  `detachShiftTurn(sh, dueDayKey, uid, lineIdx, onDayKey)` — one atomic `rootUpdate` that:
  (1) creates a **regular `recurring:false` one-off task** under the **deterministic key**
  `settings/tasks/shift-{shiftId}-{dueDayKey}` — `{ label:'🔁 {name}: {line}',
  recurring:false, members:[uid], onDay, fromShift, fromShiftDay, order }` — reusing the
  whole one-off freeze/restore machinery (and the child-completable rules path);
  (2) **advances the shift pointer** (`next = shiftAdvance(...,1)`, `override:null`); and
  (3) sets `lastDone = dueDayKey` so `shiftPendingDay` moves past the resolved day. The
  deterministic key + `fromShiftDay` make it **idempotent** — client render-path, a second
  render, and the server cron all write the same key, never a duplicate.
- **Auto-detach.** `shiftAutoDetachIfLapsed(sh)` skips a shift with an active `override`;
  otherwise, if the first scheduled day after `lastDone` is more than `SHIFT_GRACE` days
  past, it calls `detachShiftTurn` for that day. It runs on **two** paths so the rotation can
  never permanently stall: the client **render-path** (parent-only, since it's a settings
  write) *and* the **server cron** (`scripts/notify.js` → `runShiftMaintenance`, admin
  rights, every run, so it advances even when nobody opens the app). Both are idempotent;
  the server loops to converge multiple missed days in one run.
- A detached turn stays **movable**: `owedShiftRow` draws it as a beurt row with ⏮/⏭ (gated
  by `mayMoveShiftOf`), and `moveOwedShift(taskId, ±1)` re-pins its `onDay` (never before
  today). If ignored it slides to today via `onDayEffIdx` rather than disappearing. It still
  counts for day completion/streaks and, when checked off, freezes into `snap` + removes its
  definition like any one-off.
- **Admin** (`renderAdminShifts`): one section per shift with name / weekdays / lines (CRUD)
  / members (per-kid on-off) / next turn with ⏮/⏭ (`rewindShiftTurn`/`advanceShiftTurn`),
  plus create/delete. Every shift starts with a valid pointer — there is no legacy calendar
  fallback in the render path (see `docs/PLAN-v16.md` fase 8).

### Streaks & badges
- **Day complete** for a kid = the exact id-set `render()` uses for the celebration
  (rotating tasks + fixed tasks + frozen one-off snaps + any non-projected shift turn), all
  checked, ≥1 present. When true, `render()` writes `streaks/{uid}/days/{dayKey}` — a
  deliberate write-on-the-read-path, kept safe by being idempotent and transition-guarded
  (an already-present flag is never rewritten). On **past** days the flag is add-only
  (backfills a genuinely-complete old day — the "kid forgot to tap" repair; newly added
  tasks must never retro-break old days); only on **today** is an unearned flag removed
  again; future days never get one. A logged-in child writes this **only for its own uid**.
- **Streak-start is a launch floor**: streaks/badges count only from `settings/streakStart`
  onward (both the write/backfill guard and the `simulateStreak` walk start at
  `streakStartIdx()`). Editable in Beheer ("Reeksen & badges" → `editStreakStart`);
  `streakStartKey` defaults to `DEFAULT_STREAK_START` (9 juli 2026). It sits *above* `START`
  (the day-index anchor), never below.
- Streak math (`simulateStreak`) is a **pure read-path forward walk** over the flags,
  recomputed every render: days where the kid has zero scheduled tasks (`kidScheduledCount`,
  which uses *current* settings for history and deliberately **excludes shift turns** — a
  rolled-forward turn must not break a past streak) **or a 🏖️ vrije dag** neither count nor
  break; today-in-progress never breaks; one missed task-day per 7-day cycle is forgiven (the joker ❤️/💔, reset on
  badge or break); a miss with no running streak burns nothing.
- A **badge** is earned each time the streak count hits a multiple of 7, written in the
  **same root-level multi-path update as the completion flag**. Badges are permanent:
  unchecking drops the streak but never a badge. **Badges are keyed by ordinal**
  (`badges/b{n}`, value = earn-day for display), NOT by earn-day — the day a streak crosses
  a 7-multiple isn't stable (completing a forgotten earlier day shifts it), and a day-keyed
  scheme minted stale duplicates. Badge count = `simulateStreak().earnDays.length`
  (monotonic); `writeCompletionFlag` tops up `b{have+1..want}`, never removing. A badge
  shows its rank mapped over the **13** `BADGES` entries (`kidBadgeList`, `badgeDesign`);
  past 13 the ladder wraps with a level chip so it never runs out.
- The gallery (`screen === 'badges'`) has two entry points via `openBadges(kidKey?)` (sets
  module-level `badgesFilter`): a kid's **streak strip** opens that kid alone; the **🏆
  footer button** opens everyone. Medals are hand-drawn inline SVGs (`badgeSVG`). `MOTIFS`
  runs index-parallel to `BADGES` — a new badge needs an entry in **both**. Gradient ids are
  uniqued per instance via `svgUid`. Badge names are code constants (skip `escapeHtml`);
  anything task-label-derived still must not.

### 💎 Diamanten & beloningen
Kids earn diamonds and spend them in a shop on parent-defined rewards. Full build log:
**`docs/PLAN-v19-beloningen.md`** (note: its fase 4b describes a request/approve flow that
v19.7 replaced with direct buying — the text below is current).
- **Earning is WRITTEN, never derived.** `writeCompletionFlag` adds one key to its existing
  atomic `rootUpdate`: `streaks/{uid}/diamonds/{dayKey} = DIAMANTEN_PER_DAG (1) +
  DIAMANTEN_PER_BADGE (3) on a badge day`. Deriving from the completion flags was rejected
  for three reasons: every family would instantly get diamonds for all past days (they must
  **start at 0**), the balance would move when a parent edits `settings/streakStart`, and
  the old-day backfill would mint diamonds out of nowhere. Day-keyed = **idempotent**, so
  "max 1 per day" is a property of the shape, not a guard — never replace it with an
  incrementing counter (`render()` runs from several async listeners and on several devices).
- **Only for today.** `writeCompletionFlag` also runs for a *past* day that becomes complete
  (the deliberate "kid forgot to tap" streak repair — that stays), so the diamond write is
  gated on `key === dayKey(new Date())`. Without it, paging back and ticking an old day is
  free diamonds (found on-device during testing).
- The badge bonus uses `sim.earnDays.includes(key)`, **not** `newRanks`: `newRanks` is empty
  once the badge exists, so an uncheck-and-recheck would strip the day's 3 badge diamonds
  while the kid keeps the (permanent) badge.
- **Unchecking today** removes the day's diamond too (so tick-then-untick nets zero) — never
  on a past day, and never if it would push the balance below what's already been spent.
- **Spending: the child buys directly, no approval.** `buyReward` writes
  `streaks/{uid}/purchases/{id}` — that path is child-writable under the existing
  `streaks/$childId` rule, which is exactly why direct buying needed **no rules change**.
  The record **freezes** `naam` + `diamanten` (+ `icoon`), so editing or deleting a reward
  never rewrites history. `kidDiamonds(uid)` = sum of `diamonds` − sum of `purchases` − sum
  of that kid's legacy `settings/rewardClaims` (pre-v19.7 approved redemptions; they must
  not silently become free).
- **Fulfilment**: `gegeven` (a dayKey) marks that the parent actually handed the reward over.
  Absent = still owed. `toggleGiven` sets/clears it, `refundPurchase` deletes the whole
  purchase so the diamonds come back (for a kid's mis-tap). Both parent-only. Both roles see
  the same two lists — "Gekocht — nog te krijgen" (always open) and "Al gekregen" (collapsed
  by default via `adminOpen`), the child without the buttons.
- The **entry point** to the shop is `🛒 Shop` (footer button + `renderRewards` title); `🎁`
  stays reserved for a single reward without its own art. Beheer's section keeps the name
  **Beloningen** — that screen manages the catalogue rather than spending.
- **Card art, in priority order**: own photo → chosen icon (`icoon`, a key into
  `REWARD_ICONS`) → 🎁. The same order applies to the Beheer row, so the parent sees their
  choice where they made it. `REWARD_ICONS` is ~51 curated **emoji** with Dutch labels,
  picked from a button grid (`setRewardIcon`, itself behind `'icons:'+id`) — the same
  reasoning as the weekday picker: a 50-way choice is past what `prompt()` can do. Emoji
  rather than hand-drawn SVG on purpose: custom SVGs exist because colour emoji ignore CSS
  `color` when an icon must be **tinted**, which is irrelevant here — and storing a key
  costs zero DB bytes.
- **Images**: Firebase Storage needs Blaze and this project stays on Spark, so a photo is
  shrunk **in-app** (canvas, square-cropped to 320×320, `toDataURL('image/jpeg', 0.72)`,
  one retry at 0.5, hard refusal over 60 kB) and stored as a data-URI under
  `settings/rewardImages/{id}` — a **separate path with a lazy listener**
  (`attachRewardImages()`, called from `openRewards`/`openAdmin`, flag
  `rewardImagesAttached` reset in `teardownFamily`), because it is by far the heaviest node
  and the day screen has no use for it. Rendering goes through `safeImageSrc()`, a strict
  `data:image/(png|jpeg|webp);base64,…` allow-list — this app has shipped a stored-XSS
  before. `deleteReward` removes the reward **and** its image in one update (no orphans).
- **✅ No rules change was needed**: `settings` is node-wide parent-only and
  `streaks/$childId` is parent-or-self, and both **cascade** to the new sub-keys.

### 🏖️ Vrije dagen (vakantie)
A parent marks a day as free **per kid**: no chores, no reminder, no turn — and the streak
steps over it. Build log: **`docs/PLAN-v20-vakantie.md`**.
- Storage `settings/vrijeDagen/{dayKey}/{uid}: true`, absent = normal day. **Not** under
  `days/{key}`: `simulateStreak` walks the *whole* history while the day listener holds one
  day. Read via `isVrijeDag(uid, key)` from `vrijeDagenCache`, filled by a **no-gate,
  non-fatal** listener (the `kidCheckScope` pattern), reset in `teardownFamily`.
  **No rules change** — the node-wide parent-only `settings` rule cascades.
- **The streak carries the whole feature**: one extra `|| isVrijeDag(...)` in
  `simulateStreak`'s existing "zero scheduled tasks" branch. It sits **after** the flag
  branch, so a day that was already complete and is *later* marked free keeps counting (and
  keeps its badge + diamond). Because the walk is recomputed every render, filling in a
  vacation **afterwards repairs** a streak that broke during it.
- **Day screen**: `render()` sets `k.vrij` and empties `k.tasks`/`k.snaps`/`k.shifts`. The
  empty id-set is what produces everything else — no completion flag (hence **no diamond**),
  no celebration, out of the progress bar — while the existing `ids.length > 0` guard on the
  un-flag branch keeps an already-earned flag + diamond intact. All kids free → the progress
  bar is replaced by one vacation bar. The streak strip **stays** on the card on purpose.
- **Shifts**: `shiftNextScheduledDayFrom` skips a day that is free for the uid whose turn it
  is. Both `shiftPendingDay` and `shiftAutoDetachIfLapsed`/`shiftDetachPlan` run through it,
  so a turn falling in a vacation **slides to the first day after** instead of lapsing into a
  detached 🔁 one-off. A manual `override` still wins (an explicit parent choice).
- **One entry point, on purpose**: the parent-only 🏖️ button in the card header
  (`toggleVrijeDag`), one day at a time. A Beheer → Vakantie section (van–tot periods) was
  built and then **removed at the user's request** — Beheer is already crowded and a second
  place to do the same thing didn't pay for itself. Don't re-add one without asking; the
  removed code is in the v20 commit history.
- **Server mirror** in `scripts/notify.js`: `isVrijeDag`, the same skip in
  `shiftNextScheduledDayFrom`, and an early `return []` in `openChoresFor` (no reminder).

### 📝 Eigen klusjes (kind-eigen, telt nergens mee)
A child adds its own chores for itself — things it wants to track — with **no consequences**
for day completion, the streak 🔥, badges 🏆 or diamonds 💎. Build log:
**`docs/PLAN-v21-eigen-klusjes.md`**.
- Storage `streaks/{uid}/eigenTaken/{id}: { label, order, onDay?, gedaanOp? }`. **Deliberately
  not in `settings/tasks`.** Two reasons: the `streaks/$childId` rule is already
  parent-or-self and **cascades** (→ **no rules change**, same argument as v19.7 direct
  buying), and — the real point — because an eigen klusje never enters `taskList()`, it is
  excluded from `tasksForKidDay`, `kidScheduledCount`, `simulateStreak`,
  `writeCompletionFlag`, the progress bar, `showCelebration`, `renderAdminTasks` and
  `scripts/notify.js` **by structure, not by filters**. All of those files stayed literally
  unchanged; don't "improve" this by folding eigen klusjes into the task machinery.
- **No new listener**: the `/streaks` listener (no gate, non-fatal) already loads the branch
  and covers the whole history. `streaksOf()` and the listener mapping each gained one key.
- **The whole feature is one absence in `render()`**: `k.eigen = eigenTakenForDay(...)` is set
  **after** the `k.vrij` branch (so eigen klusjes survive a 🏖️ vrije dag — vacation cancels
  *chores*) and is deliberately **not** concatenated into `ids`. `ids` is what drives the
  completion flag, badge, diamond, progress bar and celebration, so staying out of it *is* the
  requirement.
- **`onDay` absent = every day**; present = pinned to one day. `eigenEffIdx` slides an
  unchecked pin forward to today (same self-healing as `onDayEffIdx`); on check-off
  `toggleEigenTaak` rewrites `onDay` to the checked day **in the same atomic update** as
  `gedaanOp/{key}`, or the row would jump back to the original pin and reappear unchecked.
  `gedaanOp` sits **on the definition** rather than in `days/{key}/checks` because the day
  listener holds only one day while this cache holds the whole history — that is what makes
  the slide computable without a second listener.
- **`checkBlockReason()` is deliberately NOT called** here: `settings/kidCheckScope` exists to
  stop a kid gaming its streak/diamonds by checking past days, and an eigen klusje has no such
  consequences. Also **no celebration/fanfare** — only `playChime()` as tap feedback.
- **UI lives entirely on the card**: an `.own-sec` block with a grey chip per row (not the
  coloured `.vac-tag`), a 🗑 per row, and one `+ Eigen klusje` button. The chip carries the
  **frequency** — `elke dag` / `eenmalig` (v21.2) — not the word "eigen", which the block
  header already says; that way the distinction costs no extra room on the row. Deliberately
  text rather than `CALENDAR_ICON`/`CALENDAR_DAYS_ICON` (the Beheer interval toggle): those
  two differ only in their dot pattern and are indistinguishable at chip size on a phone.
  Keep the creation `confirm()` wording and the chip wording in sync. The header only
  renders when there are rows, so an empty card stays quiet. Parent **and** child see and may
  delete them; `mayEditEigen(uid)` guards the three handlers themselves, not just the buttons.
  **No admin screen and no renaming** — the user's explicit choice (mistyped label = delete and
  retype); don't add a Beheer section or a fourth screen without asking.

### Admin & members screens
No client-side password — access is the **parent role** (`isParent()`; children don't see
the buttons and the `openAdmin`/`openMembers` routes are guarded). **Beheer**
(`renderAdmin`) has five sections: **Taken** (`renderAdminTasks` — per task: participant
chips, interval toggle, pointer ⏮/⏭, label edit, recurring/one-off, delete; `fromShift`
tasks are filtered out), one per shift (`renderAdminShifts`), **Beloningen**
(`renderAdminRewards` — the catalogue, plus the per-kid **diamond adjustment**
(`adjustDiamonds`) at the bottom), **Instellingen** (`renderAdminSettings` — per-kid
`magVerschuiven` chips (new per-kid flags belong here), the `notifyTime` dropdown and the
`kidCheckScope` dropdown) and **Reeksen & badges** (`renderAdminStreak`).
**Instellingen is for how the app behaves, not for actions.** The diamond adjustment sat
there until v21.2 and moved to Beloningen because it is an operation on the shop's currency,
not a setting — apply the same test to anything new.
The separate **Gezin** screen (`renderMembers`) manages children
(add/rename/color/PIN/pause/delete) and shows the family code. All mutations are
`prompt()`/`confirm()`-based to match the no-forms style; the exceptions are the weekday
picker and the reward-icon grid, where `prompt()` hits its limit.
- **Beheer is collapsed at two levels.** The five top-level sections are accordion heads via
  `adminSection(key, titel, sub, maakInhoud)` with keys `'sec:*'`, all **closed by default**,
  so the screen opens as a short menu with one-line summaries. The content function is only
  *called* when open, so a closed section costs nothing to render — that is what keeps the
  51-button icon grid out of the way. New admin sections follow the same shape, with a `sub`
  summary.
- **Style section heads as a list** (`.admin-group` + hairline `border-bottom`, no filled
  background), with a caret that rotates and a title that turns blue when open. Filled
  rounded pills read as *buttons* rather than as something that folds open — that was tried
  and rejected on-device.
- **Rows inside a section are their own accordion**: each task/shift/reward renders as a
  clickable `admin-collapse-head` with a one-line summary (`weekdaySummary(days)` →
  `'elke dag'` / `'nooit'` / abbreviated list, plus who's in the ring / the open turn /
  the price) and the edit controls hidden until expanded. Open/closed state lives in the
  module-level `adminOpen` **Set** keyed by `'task:'+id` / `'shift:'+id` / `'reward:'+id` /
  `'sec:*'`, toggled by `toggleAdminRow(key)` (in the `window` export). It's a `Set` (not a
  per-render flag) deliberately: an opened row **stays open across the re-render** that every
  edit triggers, so you can keep tweaking. Reuse it for any new collapsible row.

### Security rules — committed in this repo
The rules live in `firebase-rules-v16.json` (paste-ready for the Console, with per-block NL
comments). They are path-scoped and enforce the real access control:
- Everything is auth-gated and scoped to your own family (membership checked via
  `root.child('families').child($familyId).child('members').child(auth.uid)`).
- `meta`/`members`/`settings` (task & shift **definitions**) are **parent-only**, with
  deliberate member exceptions: a child may **delete a `recurring===false` task** under
  `settings/tasks/{id}` (that's what completing a one-off does) and may write the **shift
  rotation state** (`shifts/{id}/next|override|lastDone`). A child whose `magVerschuiven`
  member flag is **true** may additionally **create** a detached own turn (a new
  `settings/tasks` record with `recurring:false` + `fromShift` + `members[0] === auth.uid`)
  and **re-pin its `onDay`** — both conditions read the flag from `root`, so a parent
  flipping the Beheer toggle off revokes this server-side.
- A child may write its own `days/.../checks/{uid}`, `days/.../snap/{uid}`,
  `days/.../shift`, and **its whole `streaks/{uid}` subtree** (which is why diamonds and
  purchases live there) — nothing else.
- One `members` exception: any member may write its own `members/{uid}/fcmTokens` (own push
  tokens), otherwise `members` stays parent-only. The RTDB allow-cascade (a deeper
  `.write:true`) grants it without loosening the node.
- `/familyCodes` is a targeted lookup (not enumerable, write-once); `/userIndex/{uid}` is
  strict self-only; `/test` is fully open to any authenticated user (the sandbox — the
  strict family rules reference `root.child('families')`, which wouldn't match under
  `test/families`).
- There are no `.validate` rules, so records are trusted by shape (a child could only fudge
  its own family's gamification).
- **Shipping a rules change means telling the user to re-paste the file in the Console**
  (checklist step 9) — until they do, the UI works but writes are silently rejected.

### Push notifications
Two kinds of push, both delivered **even when the app is closed**, so both need a server
half. Full build log + manual-setup steps: **`docs/PLAN-v17-meldingen.md`**.
1. **Daily reminder** to a kid with unfinished chores, at the family's `notifyTime`.
2. **Purchase alert** to the parents when a child buys something in the shop.

- **Device half (`index.html` + companion files):** `manifest.json` + `icon-192/512.png`
  (installable PWA — iOS 16.4+ web push requires an installed PWA with a manifest);
  `firebase-messaging-sw.js` (service worker, at repo root; uses the compat SDK via
  `importScripts` and shows the notification in `onBackgroundMessage`; **data-only messages**
  so we control title/body and avoid a double notification). In the app: a "🔔 Meldingen aan"
  footer button (`enableNotifications()`) that requests permission (must be a user gesture —
  iOS) and stores the FCM token under `members/{uid}/fcmTokens/{sanitizedKey}: token` (token
  as **value** since a raw token isn't a valid RTDB key). The button is shown to **any**
  member, parent or child — a parent needs a token for the purchase alert.
  `VAPID_PUBLIC_KEY` near the config is a public Web-Push key pasted from the Console. All
  push code is soft/try-caught — never blocks the app. `?test` note: Pages serves this app
  on a **subpath**, so all SW/manifest/icon paths are **relative** (no leading `/`).
- **Reminder time** is per family: `settings/notifyTime` (`"HH:MM"` on the whole/half hour,
  or `"uit"`, default `"19:00"`), set by a parent in Beheer → Instellingen via a `<select>`
  (`notifyTimeOptions`/`setNotifyTime` — native wheel picker on mobile; only `:00`/`:30` for
  simplicity), read via a no-gate/non-fatal listener. `settings/lastNotified` (`"yyyy-M-d"`)
  is a server-written dedup flag.
- **Server half — `scripts/notify.js`, driven by Google Apps Script.** The script does, on
  **every** run, shift maintenance (`runShiftMaintenance`) and purchase alerts, and
  additionally sends the daily reminder for each family where Brussels-now ≥ `notifyTime`
  and it hasn't sent today. **No Blaze/credit card** — FCM + RTDB reads are free on Spark.
  Two entry points run that same file:
  - **Apps Script (`scripts/notify-appsscript.gs`) — the live one.** Talks to Firebase over
    REST (RTDB + FCM HTTP v1), authenticating with a service-account JWT it signs via
    `Utilities.computeRsaSha256Signature`. Service-account JSON lives in a **Script
    Property** `FIREBASE_SERVICE_ACCOUNT`; time-driven trigger every 30 min (enough —
    `notifyTime` is only on the hour/half hour). Install steps are in the file's header.
  - **GitHub Action (`.github/workflows/klusjes-herinnering.yml`) — manual fallback only.**
    `workflow_dispatch`, no cron (see below). Uses the Firebase Admin SDK and the GitHub
    secret `FIREBASE_SERVICE_ACCOUNT`. ⚠️ That secret holds an **older service-account key**
    than the one in Apps Script — two keys are deliberately alive at once. Deleting the old
    key in the Firebase Console silently kills this fallback (the UI still offers "Run
    workflow"; it just fails on auth). Rotate the secret first if you ever do remove it.
- **Purchase alert**: `purchaseNotifyPlan(familyData)` (pure, tested in
  `test/notify.test.js` — no browser needed) scans every `streaks/{kidUid}/purchases/{id}`
  without a `gemeld` flag and returns them with the fcmTokens of all members with
  `rol === 'ouder'`. `main()` pushes one message per unreported purchase to each parent
  token, then **always** sets `gemeld:true` — even when there were no parent tokens — so a
  purchase yields at most one alert and a pile of old ones never lands at once when a parent
  enables notifications later. Runs on every run, independent of `notifyTime`, because a
  purchase can happen at any moment. No logic duplication with `index.html`: the app only
  displays the `purchases` list.
- **⚠️ Logic duplication — keep in sync.** The DB stores task *definitions* + rotation *state*
  + `checks` (what's *done*), **not** a ready-made "today's chores" list — the app computes it
  each render, so `notify.js` must recompute it too. The pure helpers there (`dayIndex`,
  `taskRing`/`taskAssignee`/`tasksForKidDay` + `onDay`, `isVrijeDag` +
  `shiftNextScheduledDayFrom`, `shiftPendingDay`/`shiftEffectiveNext`/
  `shiftForDay`, `shiftDetachPlan`/`runShiftMaintenance` mirroring
  `shiftAutoDetachIfLapsed`/`detachShiftTurn`) are **verbatim copies** of the `index.html`
  versions, adapted to take a `ctx` object. Change the chore/shift math in `index.html` →
  update `notify.js` too.
- **⚠️ `notify.js` must stay loadable by Apps Script — this is what keeps the copy count at
  two.** Apps Script does **not** hold its own copy of the chore/shift math: it fetches
  `scripts/notify.js` as **text** from GitHub Pages and runs it through a CommonJS shim
  (`laadKern_`), so the live reminders execute the exact file the test suite tests. That
  rests on four properties of `notify.js` — keep all four:
  1. it stays **CommonJS** (`module.exports = {…}` at the end), never ESM;
  2. **no `require()` at the top level** — only inside `main()`, which never runs there;
  3. `main()` is reached only via the `require.main === module` guard at the bottom;
  4. the exported planner names stay as they are.
  `test/appsscript-loader.test.js` enforces all of this by loading the file through the same
  shim, so breaking it turns the suite red instead of silently killing everyone's reminders.
  Change the logic freely — push to `main`, Pages publishes, the next run picks it up. Only
  a change to the *setup* (URLs, auth, quotas) means re-pasting the `.gs` file.
- **Why not GitHub Actions any more.** `on: schedule` was always best-effort and often ran
  hours late, but in Aug 2026 it got worse: GitHub accepted the dispatches and then **never
  assigned a runner** — jobs sat ~15 min in the queue and were auto-cancelled with
  `runner_id: 0`, zero steps executed and no logs, so `notify.js` never even started. The
  cron is therefore removed; the workflow survives as a manual noodknop. Related gotcha
  worth remembering: scheduled workflows only ever fire from the **default branch (`main`)**,
  so on a feature branch only `workflow_dispatch` works.
- **Where the schedule lives now.** A single Apps Script time-driven trigger (every 30 min)
  on Tim's personal Google account calls `klusjesHerinnering()`. The old GitHub PAT is gone
  — nothing calls the GitHub API any more. `klusjesHerinneringNu()` is the by-hand instant
  test (force: sends regardless of the hour, and deliberately does **not** set
  `lastNotified`, so the real evening reminder still goes out).
  - **iOS Shortcut**: it used to POST to the GitHub dispatch API and no longer works. To keep
    it, deploy the Apps Script project as a web app and set a `RUN_KEY` Script Property — the
    included `doGet` then accepts `…/exec?key=<RUN_KEY>` and refuses without it. Optional:
    the 30-min trigger already covers the daily reminder on its own.
  - Overlapping runs still can't double-send — `lastNotified` makes the daily reminder
    idempotent, and `gemeld` does the same for purchase alerts.
  - **Bus-factor:** the Apps Script runs on Tim's personal Google account — the same one that
    administers the Firebase project (`klusjesv2`) — and now holds the **service-account
    JSON** (not just a repo-scoped PAT), so it is worth more than it used to be. The script
    body itself is version-controlled at `scripts/notify-appsscript.gs`; only the two Script
    Properties live outside the repo.

### Other conventions worth knowing
- The schedule is **open-ended with a fixed lower bound**: `START` (26 juni 2026) anchors
  all day-index math (`dayIndex`, `taskAssignee` rotation, `simulateStreak`) and navigation
  refuses `idx < 0` / clamps `goToday` to `START` — no end date. Anything that scans
  forward for a matching weekday iterates a rolling `SEARCH_HORIZON` (~370 days) as an
  infinite-loop guard for empty/weird weekday sets.
- **Icons: SVG when it must be a specific colour, emoji otherwise.** Colour-emoji glyphs
  ignore CSS `color`, so anything that must be tinted (red delete) or stay legible on the
  dark card is an inline SVG. Two families exist: outline icons following `currentColor`
  (`TRASH_ICON`, `SKIP_FWD_ICON`, `SKIP_BACK_ICON`, coloured via `.danger`/`.accent`/
  `.postpone-btn`) and multi-colour icons carrying their own fills (`COLORWHEEL_ICON`,
  `SHIELD_PIN_ICON`, `COPY_ICON`, `FAMILY_ICON`, `ROTATE_ICON`, `PERSON_ICON`, `GEAR_ICON`,
  `BELL_ICON`, `PENCIL_ICON`, `CALENDAR_ICON`/`CALENDAR_DAYS_ICON` — the interval toggle
  keeps **two** so weekly vs daily stays visible — `HEART_ICON`, `HEARTBREAK_ICON`).
  🏆 🔥 🛒 💎 🎁 ✓ and emoji inside `alert()`s/prose stay emoji by choice.
  **`ROTATE_ICON` is display-only**: the `🔁` in *stored* shift labels (`detachShiftTurn` and
  `notify.js`'s copy) stays emoji — `owedShiftRow` strips a leading `🔁 ` from `t.label`
  before prefixing the icon.
- The celebration popup (`showCelebration`) fires **per kid**, the moment that kid's tasks
  are all done — and only while viewing **today** (`isToday` gate). Its anti-repeat guard
  (`celebratedDays`, a `Set` of `dayKey:uid` strings) exists because `render()` can be
  triggered by any of several async listeners, not just the user's own tap. When multiple
  kids newly complete in one render the names merge into one popup. A completing tap that
  also mints a badge shows it, known from `writeCompletionFlag`'s return value or from the
  badge already in cache on another device.
- All sounds are **synthesized with Web Audio** (`playChime` on check-off, `playFanfare`
  under the celebration) — never an external audio file; the app stays a single
  self-contained file. Hard-won rules: the shared `audioCtx` is created lazily *inside* a
  click handler (iOS refuses otherwise); every tone fades in/out via gain ramps; avoid
  noise-buffer synthesis (crackles on phone speakers); `playFanfare` bails when no context
  exists or it isn't `running` *and* no chime played in the last few seconds
  (`lastChimeAt`) — the exception covers iOS's async `resume()` on first tap, the bail
  stops a tapless popup from queuing a sound that blares on the next tap. Every audio path
  is try/catch-wrapped so it can never block a state write or popup.
