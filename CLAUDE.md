# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## The app in one paragraph

**Klusjes-PWA v17** (`VERSION` = `klusjes-pwa v17.1`): a Dutch-language family chores app —
multi-family, Firebase Auth (parent + child login), rotating tasks (flat ring+pointer model)
and completion-driven "shift" turn tasks, streaks & badges, and a daily push reminder. The
app itself is **one static file, `index.html`** (inline CSS + one `<script type="module">`),
zero dependencies, no build step, hosted on GitHub Pages from `main`. Push notifications add a
few companion files (see **Push notifications**): `manifest.json` + `icon-*.png`,
`firebase-messaging-sw.js` (service worker), and a `scripts/` + `.github/workflows/` server
side. Other companion files: `firebase-rules-v16.json` (RTDB security rules, paste-ready for
the Firebase Console), `PLAN-v16.md` / `PLAN-v17-meldingen.md` (build logs — deep background),
`CHANGELOG.md` (what changed per version).

## Workflow for every change (checklist)

1. **Work on a feature branch** — never directly on `main` (`main` = the live app).
2. Make the change in `index.html` (the only app file).
3. New inline `onclick` handler? → add it to the **`Object.assign(window, {...})`** export
   at the bottom of the script, or it silently does nothing.
4. **Verify against the fake Firebase backend** (see Commands) — never against production
   data, never via the real ⚙️ Beheer / 👨‍👩‍👧 Gezin flows.
5. **Bump `VERSION`** in the same commit, following the version policy below.
6. **Add a `CHANGELOG.md` entry** (Dutch, one short bullet list per version).
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

There is no build, lint, or test tooling — the app is a single static file. `.gitignore` is
unused boilerplate (no `package.json`, no `node_modules`).

- **Production / deploy**: **GitHub Pages serves the `main` branch** — every push to `main`
  auto-deploys via the built-in "pages build and deployment" workflow (live within a couple
  of minutes, plus up to ~10 min HTTP cache). The family uses an iOS home-screen bookmark;
  a fully closed-and-reopened app picks up a deploy automatically; the footer `VERSION`
  verifies the build. Pages on the free plan requires a public repo, so **making this repo
  private would take the app offline**.
- **Firebase project**: `klusjesv2` (config inline in `index.html`; the visible apiKey is a
  public identifier, not a secret — access control lives in Auth + the rules), with Auth
  (email/password) enabled and the rules from `firebase-rules-v16.json` applied.
- **Run locally**: open `index.html` directly (`file://`). No server. The app shows an
  **auth screen first** — there's no data until you log in (or use the fake backend below).
- **Manual verification (the standard way)**: headless Playwright against a hand-rolled
  **in-memory fake Firebase SDK**: intercept the three
  `https://www.gstatic.com/firebasejs/.../firebase-{app,database,auth}.js` CDN imports via
  `page.route().fulfill()` and load the real file via `file://`. The **database** fake
  exposes `initializeApp, getDatabase, ref, onValue, get, set, update, remove, push` backed
  by a plain JS object + pub/sub; the **auth** fake exposes `getAuth, setPersistence,
  browserLocalPersistence, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, updatePassword, deleteApp`. Fake-SDK gotchas
  learned the hard way: (1) `val()` must return dense integer-keyed nodes as **arrays**
  (like real RTDB), or every `Array.isArray(weekdays)` check silently falls back to "every
  day"; (2) the fake must notify listeners **asynchronously and coalesced** — a synchronous
  notify inside a write causes re-entrant renders with stale caches that the real
  (always-async) SDK can't produce (this once caused an infinite completion-flag loop);
  (3) child-account creation uses a **second app instance**, so fake auth must keep
  per-instance state. There is no committed test suite; scratchpad `test-*.js` harnesses
  are regenerated per session. A quick logic-only smoke test also works in Node: extract
  the `<script type="module">`, stub the imports/DOM as globals, and call the pure helpers.
- **Manual acceptance on a real device**: append `?test` to the URL. `BASE_ROOT` becomes
  `'test/'` and **every** database path — the family subtree, the two top-level pointers,
  and the keys of root-level multi-path updates — lives under `/test/...`, self-seeded by
  the normal flows; the footer shows a red TESTMODUS marker. `?test` only works if the RTDB
  rules include the `/test` rule. Cleanup = delete `/test`.
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
  all paths (`settings/…`, `days/…`, `streaks/…`) nest under the family automatically.
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
  gebruikersnaam?, kleur, actief, magVerschuiven? }`. `activeKids()` returns active child
  members (sorted by uid — stable across renames); kid colors come from the member record.
  Removing a child is a **soft-delete** (`actief:false`) so history/streaks survive; the
  login account itself can't be deleted client-side. `magVerschuiven` is the per-kid
  permission flag "may move own shift turns" (absent = no): it lives on the member record
  deliberately — no extra listener (membersCache already loads) and the security rules read
  the same flag server-side, so toggling it off is actually enforced, not just hidden UI.
  Read via `kidMayMove(uid)`; the combined "may the *logged-in* user move kid X's turn"
  check is `mayMoveShiftOf(uid)` (parent: always; child: own turn + flag).
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
days/{yyyy-M-d}/checks/{uid}/{taskId}: boolean         // per-day checked state, incl. 'shift-{shiftId}' for turn tasks
days/{yyyy-M-d}/snap/{uid}/{taskId}: { label, order, weekdays?, members?, … }   // frozen one-off, written at check-off
days/{yyyy-M-d}/shift/{shiftId}: { uid, line }         // frozen turn-task history
streaks/{uid}/days/{yyyy-M-d}: true                    // completion flag: that kid finished everything that day
streaks/{uid}/badges/b{n}: 'yyyy-M-d'                  // n-th badge (ordinal key), value = earn-day; permanent

/familyCodes/{CODE6}: familyId    // top-level pointer (baseRef)
/userIndex/{uid}: familyId        // top-level pointer (baseRef)
```
- Each independent piece of remote state gets its **own permanent `onValue` listener** plus
  its own `*Loaded` boolean gate (`tasksLoaded`, `vacuumLoaded` [covers the shifts
  listener], `dayLoaded`, `streaksLoaded`, `metaLoaded`, `membersLoaded`), all of which
  `render()` waits on. These listeners start in `initFamily()` **after** login + family
  resolution (not at module load). A new piece of synced state should follow this pattern.
  `teardownFamily()` (on logout) detaches them all and resets caches/gates/`DB_ROOT`, so
  re-login starts clean.
- The `/streaks` listener is deliberately **non-fatal**: an absent node means "nothing
  earned yet" (marks loaded without seeding), and a *read error* falls back to an empty
  cache and still flips `streaksLoaded` — a missing `/streaks` rule degrades to "no badges
  yet" instead of hanging the app. Badges are a layer on top and must never take the core
  down. The tasks/shifts/day/members listeners are fatal (errors set `loadError` →
  connection-error screen).
- The day listener (`attachDayListener`) is torn down and reattached on every
  `changeDay`/`goToday`, using an incrementing `dayListenerToken` to make stale callbacks
  no-ops. Any new per-day-scoped listener should reuse this token pattern, not the day-key.
- `weekdays: number[]` (0=zondag..6=zaterdag, matches `Date.getDay()` and `WD`): **absent =
  every day** (how legacy/seeded records behave — schema-additive extensions need no
  migration); **explicit `[]` = never active**. See `taskWeekdays`/`shiftWeekdays`.
- **Backward-compat, in memory:** an older DB with A/B/uid task *buckets* is detected
  (`looksLikeBuckets`) and converted on load (`migrateTaskBuckets`: A→pointer 0,
  B→pointer 1, uid-bucket→`members:[uid]`), then written flat **once** by the first parent
  (`maybeMigrateTasks`).

### Task semantics (flat rotation model — `settings/tasks/{taskId}`)
A/B buckets are **gone**. Rotation is a per-task **ring + pointer**:
- `taskRing(t)` = the participant order. `members` empty/absent = all active kids;
  otherwise exactly that subset (filtered to still-active kids). **One participant = a
  fixed task** (`isFixedTask`, shows the 👤 marker).
- `taskAssignee(t, dayIdx)` = `ring[((pointer + steps) % n + n) % n]`, with `steps =
  interval === 'weekly' ? floor((dayIdx - anchorIdx)/7) : (dayIdx - anchorIdx)`. Two kids
  with pointer 0 vs 1 = exactly the old A/B daily flip; 3+ kids rotate cleanly.
  `anchorIdx`/`pointer` are adjustable (admin ⏮/⏭ via
  `advanceTaskPointer`/`rewindTaskPointer`).
- `tasksForKidDay(uid, idx, dow)` picks a kid's tasks for a day: assignee must match, then
  either the `onDay` exact-date pin (below) or the weekday filter.
- `recurring:false` (one-off): same visibility rule, but the moment it's checked it's
  `remove()`d from `settings/tasks` — gone from every other day. Check-off first
  **freezes** the task into `days/{key}/snap/{uid}/{taskId}` (label/order + full rotation
  via `copyRotation`), *then* removes the definition; `daySnapsFor()` merges frozen rows
  back at render time. Un-checking restores the definition from the snapshot and deletes
  the snapshot. Both directions are each a **single root-level multi-path
  `rootUpdate({...})`** — keep them atomic. Restoring a definition is a settings write, so
  **un-checking a frozen one-off is parent-only**; the child UI explains this.
- **`onDay: 'yyyy-M-d'`** pins a task to one exact day instead of a weekday pattern
  (absent = normal weekday behavior; schema-additive). Its *effective* day self-heals:
  `onDayEffIdx(t)` returns `max(onDayIdx, todayIdx)`, so a lapsed unchecked pin slides
  forward to today instead of vanishing (same idea as a shift's past `override`).
  **`fromShift: shiftId`** tags a task as a detached turn (see Shifts): `renderAdminTasks`
  hides it from Beheer, and `renderCard` draws it via `owedShiftRow` (a movable beurt row)
  instead of a plain `taskRow`. Both fields are carried through freeze/restore by
  `copyRotation`.

### Shift tasks (turn tasks — `settings/shifts/{shiftId}`)
Vacuuming ("Stofzuigen") is no longer hardcoded — it's the first of possibly several
**shift tasks**: a chore that rotates one *person* + one *line* (the old "floors") per
turn, **completion-driven**. `settings/shifts/{shiftId}/next` holds the one open turn as
`{uid, lineIdx}`; it only advances (person steps through the ring, line cycles) when the
turn is checked off. The pointer stores the **uid** (robust across member changes), not an
index. Empty `members` = all active kids; the ring is always filtered to still-active
kids. Key functions: `shiftPendingDay`, `shiftEffectiveNext`, `shiftAdvance`, `shiftForDay`
(returns mode `done`/`pending`/`projected`), `shiftsForKid`, `toggleShift`.
- Exactly **one** interactive ("pending") turn exists across all days. `shiftPendingDay()`
  picks the day: an `override` date wins over the weekday schedule, but an override that
  has slipped into the *past* is **clamped forward to today** (read-path only, self-heals
  each render, no write) so a lapsed turn stays visible and clickable today; a day matching
  `lastDone` is skipped. Future scheduled days show a dimmed **projection** (excluded from
  the progress bar) that **is** clickable — checking it completes that projected turn and
  jumps the pointer past it, letting an earlier open turn lapse silently (a parent covering
  a skipped turn must not block the rotation). Past days render from the frozen
  `days/{key}/shift/{shiftId}` snapshot.
- Per-kid check-off writes `days/{key}/checks/{uid}/shift-{shiftId}`. **A child can
  complete their own turn** (rules allow member writes to `checks/{uid}`, `days/.../shift`,
  and the shift pointer fields `next`/`override`/`lastDone`). The two move buttons
  (⏮ `shiftPrepone` one day earlier, ⏭ `shiftPostpone` one day later) are gated by
  `mayMoveShiftOf(uid)`: parents always, a child only for its **own** turn and only when
  its `magVerschuiven` member flag is on (the Beheer "Instellingen" toggle). The same check
  guards the handlers themselves, not just the buttons. (There is no "pull to today"
  button — stepping is enough.)
- Un-checking a turn only rewinds the pointer when the day matches `lastDone` (the
  just-completed turn); older checked days toggle freely. That rewind also restores
  `override` to the day (check-off clears it), so a moved turn doesn't snap back to the
  next scheduled weekday and appear to vanish.
- **⏭ postpone = detach + keep rotating (the fix for the "beurt draait niet meer door"
  problem).** The old ⏭ merely moved the single turn's `override` one day later while
  keeping the same person as "next" — so the rotation *stalled*. Now `shiftPostpone`
  instead, in one atomic `rootUpdate`: (1) creates a **regular `recurring:false` one-off
  task** for that person on the next day — `{ label:'🔁 {name}: {line}', recurring:false,
  members:[uid], onDay:<nextday>, fromShift:<shiftId>, order }` — reusing the whole one-off
  freeze/restore machinery (and the child-completable rules path); and (2) **advances the
  shift pointer** (`next = shiftAdvance(...,1)`, `override:null`) so the next scheduled day
  gives the turn to the next person. Net effect: the turn becomes a standalone owed chore
  the original person still holds, and the rotation keeps running. ⏮ on the *pending* row
  is unchanged (it pulls the turn one day earlier).
- A detached turn is **not** a plain personal task — it stays **movable**. `owedShiftRow`
  draws it as a beurt row with ⏮/⏭ (gated by `mayMoveShiftOf`, like the pending row), and
  `moveOwedShift(taskId, ±1)` re-pins its `onDay` (never before today, computed from the
  self-healed effective day). So it can keep being postponed day after day, and if ignored
  it slides to today (via `onDayEffIdx`) rather than disappearing. It still participates in
  day completion/streaks and, when checked off, freezes into `snap` + removes its
  definition like any one-off (a child may do this under the existing `recurring===false`
  rule).
- **Admin** (`renderAdminShifts`): one section per shift with name / weekdays / lines
  (CRUD) / members (per-kid on-off) / next turn with ⏮/⏭
  (`rewindShiftTurn`/`advanceShiftTurn`), plus create/delete a shift task. There is no live
  legacy calendar fallback in the render path — every shift on `klusjesv2` starts fresh
  with a valid pointer (a one-time historical migration set it; see `PLAN-v16.md` fase 8).

### Streaks & badges
- **Day complete** for a kid = the exact id-set `render()` uses for the celebration
  (rotating tasks + fixed tasks + frozen one-off snaps + any non-projected shift turn), all
  checked, ≥1 present. When true, `render()` writes `streaks/{uid}/days/{dayKey}` — a
  deliberate write-on-the-read-path, kept safe by being idempotent and transition-guarded
  (an already-present flag is never rewritten). On **past** days the flag is add-only
  (backfills a genuinely-complete old day — the "kid forgot to tap" repair; newly added
  tasks must never retro-break old days); only on **today** is an unearned flag removed
  again; future days never get one. A logged-in child writes this **only for its own uid**
  (its kids-list is just its own card — the streaks rule rejects sibling writes).
- **Streak-start is a launch floor**: streaks/badges count only from `settings/streakStart`
  onward (both the write/backfill guard and the `simulateStreak` walk start at
  `streakStartIdx()`). Editable in Beheer ("Reeksen & badges" → `editStreakStart`, a
  `dd-mm-jjjj` prompt); `streakStartKey` holds it, defaulting to `DEFAULT_STREAK_START`
  (9 juli 2026). Its listener has **no load gate and is non-fatal**. It sits *above*
  `START` (the day-index anchor), never below.
- Streak math (`simulateStreak`) is a **pure read-path forward walk** over the flags,
  recomputed every render: days where the kid has zero scheduled tasks
  (`kidScheduledCount`, which uses *current* settings for history and deliberately
  **excludes shift turns** — a rolled-forward turn must not break a past streak) neither
  count nor break; today-in-progress never breaks; one missed task-day per 7-day cycle is
  forgiven (the joker ❤️/💔, reset on badge or break); a miss with no running streak burns
  nothing.
- A **badge** is earned each time the streak count hits a multiple of 7, written in the
  **same root-level multi-path update as the completion flag**. Badges are permanent:
  unchecking drops the streak but never a badge. **Badges are keyed by ordinal**
  (`badges/b{n}`, value = earn-day for display), NOT by earn-day — the day a streak crosses
  a 7-multiple isn't stable (completing a forgotten earlier day shifts it), and a day-keyed
  scheme minted stale duplicates. Badge count = `simulateStreak().earnDays.length`
  (monotonic); `writeCompletionFlag` tops up `b{have+1..want}`, never removing. A badge
  shows its rank mapped over the **13** `BADGES` entries (`kidBadgeList`, `badgeDesign`),
  ending in the heart "Trots op jou"; past 13 the ladder wraps with a level chip so it
  never runs out.
- The gallery (`screen === 'badges'`) has two entry points via `openBadges(kidKey?)` (sets
  module-level `badgesFilter`): a kid's **streak strip** opens that kid alone; the **🏆
  footer button** opens everyone. `renderBadges` filters by `badgesFilter` (reset every
  call). Medals are hand-drawn inline SVGs (`badgeSVG`: ribbon tails, scalloped rim
  `scallopPath`, `c1→c2` gradient ring with an optional iridescent `c3`, radial sheen,
  recessed disc, a white `MOTIFS[idx]` centerpiece). `MOTIFS` runs index-parallel to
  `BADGES` — a new badge needs an entry in **both**. Gradient ids are uniqued per instance
  via `svgUid`. Badge names are code constants (skip `escapeHtml`); anything
  task-label-derived still must not.

### Admin & members screens
No client-side password — access is the **parent role** (`isParent()`; children don't see
the buttons and the `openAdmin`/`openMembers` routes are guarded). **Beheer**
(`renderAdmin`) has one **Taken** section (`renderAdminTasks` — per task: participant chips
`toggleTaskMember`, interval toggle `toggleTaskInterval`, pointer ⏮/⏭, label edit,
recurring/one-off, delete; `fromShift` tasks are filtered out), one section per shift
(`renderAdminShifts`), an **Instellingen** section (`renderAdminSettings` — currently one
row of per-kid chips toggling `magVerschuiven` via `toggleKidMayMove`; new per-kid flags
belong here), and **Reeksen & badges** (`renderAdminStreak`). The separate **Gezin** screen
(`renderMembers`) manages children (add/rename/color/PIN/pause/delete) and shows the family
code. All mutations are `prompt()`/`confirm()`-based to match the no-forms style; the
exception is weekday selection, done via 7 individual toggle buttons
(`renderWeekdayPicker`, click-to-flip-and-write) because a 7-way multi-select is where
`prompt()` hits its limit. Admin handlers take `(taskId)` / `(shiftId)` — no per-bucket
logic.

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
  flipping the Beheer toggle off revokes this server-side. A child may write its own
  `days/.../checks/{uid}`, `days/.../snap/{uid}`, `days/.../shift`, and `streaks/{uid}` —
  nothing else.
- `/familyCodes` is a targeted lookup (not enumerable, write-once); `/userIndex/{uid}` is
  strict self-only; `/test` is fully open to any authenticated user (the sandbox — the
  strict family rules reference `root.child('families')`, which wouldn't match under
  `test/families`).
- **Shipping a rules change means telling the user to re-paste the file in the Console**
  (checklist step 9) — e.g. the kid-driven move feature works for ⏮ only (⏭ fails silently
  for a child) until the updated rules are pasted.
- There are no `.validate` rules, so records are trusted by shape (a child could only fudge
  its own family's gamification).
- The **notifications** feature adds one exception: a member may write its own
  `members/{uid}/fcmTokens` (own push tokens), otherwise `members` stays parent-only. The
  RTDB allow-cascade (a deeper `.write:true`) grants it without loosening the node.

### Push notifications (daily evening reminder — v17)
A kid with unfinished chores gets a push on their phone **even when the app is closed**. A
push to a closed device can't be done client-side, so this splits into a device half and a
server half. Full build log + manual-setup steps: **`PLAN-v17-meldingen.md`**.
- **Device half (in `index.html` + companion files):** `manifest.json` + `icon-192/512.png`
  (installable PWA — iOS 16.4+ web push requires an installed PWA with a manifest);
  `firebase-messaging-sw.js` (service worker, at repo root; uses the compat SDK via
  `importScripts` and shows the notification in `onBackgroundMessage`; **data-only messages**
  so we control title/body and avoid a double notification). In the app: a "🔔 Meldingen aan"
  footer button (`enableNotifications()`) that requests permission (must be a user gesture —
  iOS) and stores the FCM token under `members/{uid}/fcmTokens/{sanitizedKey}: token` (token as
  **value** since a raw token isn't a valid RTDB key). `VAPID_PUBLIC_KEY` near the config is a
  public Web-Push key the user pastes from the Console. All push code is soft/try-caught —
  never blocks the app. `?test` note: GitHub Pages serves this app on a **subpath**, so all
  SW/manifest/icon paths are **relative** (no leading `/`).
- **Reminder time** is per family: `settings/notifyTime` (`"HH:MM"` on the whole/half hour —
  `editNotifyTime` only accepts `:00`/`:30` since the server polls every 30 min — or `"uit"`,
  default `"19:00"`), set by a parent in Beheer → Instellingen (`editNotifyTime`), read via a
  no-gate/non-fatal listener like `streakStart`. `settings/lastNotified` (`"yyyy-M-d"`) is a
  server-written dedup flag.
- **Server half (`scripts/notify.js` + `.github/workflows/klusjes-herinnering.yml`):** a
  GitHub Action runs **every 30 min**; the script (Firebase Admin SDK) sends, for each family
  where Brussels-now ≥ `notifyTime` and it hasn't sent today, an FCM push to every active kid
  with ≥1 open chore. **No Blaze/credit card** — FCM + RTDB reads are free on Spark. The
  service-account JSON is the GitHub secret `FIREBASE_SERVICE_ACCOUNT`.
- **⚠️ Logic duplication — keep in sync.** The DB stores task *definitions* + rotation *state*
  + `checks` (what's *done*), **not** a ready-made "today's chores" list — the app computes it
  each render, so `notify.js` must recompute it too. The pure helpers there (`dayIndex`,
  `taskRing`/`taskAssignee`/`tasksForKidDay` + `onDay`, `shiftPendingDay`/`shiftEffectiveNext`/
  `shiftForDay`) are **verbatim copies** of the `index.html` versions, adapted to take a `ctx`
  object. Change the chore/shift math in `index.html` → update `notify.js` too. A Node
  cross-check test (fake data, no network) asserts `notify.js` and the app agree.
- **Gotcha:** GitHub scheduled workflows (`on: schedule`) only fire from the **default branch
  (`main`)**; on a feature branch only `workflow_dispatch` (manual run, pick the branch) works.

### Other conventions worth knowing
- The schedule is **open-ended with a fixed lower bound**: `START` (26 juni 2026) anchors
  all day-index math (`dayIndex`, `taskAssignee` rotation, `simulateStreak`) and navigation
  refuses `idx < 0` / clamps `goToday` to `START` — no end date. Anything that scans
  forward for a matching weekday iterates a rolling `SEARCH_HORIZON` (~370 days) as an
  infinite-loop guard for empty/weird weekday sets.
- Color-emoji glyphs ignore CSS `color`, so any icon that must be tinted (red delete
  buttons) or stay legible on the dark card background (the skip arrows, near-black as
  emoji) is an inline outline SVG with `stroke="currentColor"` — `TRASH_ICON`,
  `SKIP_FWD_ICON`, `SKIP_BACK_ICON`, colored via `.danger`/`.accent`/`.postpone-btn`.
  Reach for these, not an emoji, when a glyph needs a specific color. Emoji are fine where
  color is irrelevant (🧹/🔁/✏️ labels).
- The celebration popup (`showCelebration`) fires **per kid**, the moment that kid's tasks
  are all done — and only while viewing **today** (`isToday` gate). Its anti-repeat guard
  (`celebratedDays`, a `Set` of `dayKey:uid` strings) exists because `render()` can be
  triggered by any of several async listeners, not just the user's own tap. When multiple
  kids newly complete in one render the names merge into one popup. A completing tap that
  also mints a badge shows it ("Nieuwe badge: …") — known from `writeCompletionFlag`'s
  return value, or from the badge already in cache on another device.
- All sounds are **synthesized with Web Audio** (`playChime` on check-off, `playFanfare`
  under the celebration) — never an external audio file; the app stays a single
  self-contained file. Hard-won rules: the shared `audioCtx` is created lazily *inside* a
  click handler (iOS refuses otherwise); every tone fades in/out via gain ramps; avoid
  noise-buffer synthesis (crackles on phone speakers); `playFanfare` bails when no context
  exists or it isn't `running` *and* no chime played in the last few seconds
  (`lastChimeAt`) — the exception covers iOS's async `resume()` on first tap, the bail
  stops a tapless popup from queuing a sound that blares on the next tap. Every audio path
  is try/catch-wrapped so it can never block a state write or popup.

## Deep background
`PLAN-v16.md` is the frozen, phase-by-phase build log of v16 (design decisions, rules
review, migration details). Consult it for *why* something is the way it is; this file is
the working summary. `CHANGELOG.md` lists what shipped per version.
