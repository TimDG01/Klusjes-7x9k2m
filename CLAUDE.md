# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

There is no build, lint, or test tooling in this repo — it's a single static file with zero dependencies. `.gitignore` is a generic boilerplate template; none of it is actually in use (no `package.json`, no `node_modules`).

- **Run the app**: open `index.html` directly in a browser (double-click, or `file://` URL). No server, no build step.
- **Manual verification**: this app talks to a live production Firebase project (config is inline in the file), so don't interact with the real "⚙️ Beheer" admin flows or task data against production during testing. Verify changes with a headless browser (Playwright) against a hand-rolled **in-memory fake Firebase SDK** instead: intercept the two `https://www.gstatic.com/firebasejs/.../firebase-{app,database}.js` CDN imports via `page.route().fulfill()` with a fake module exposing `initializeApp, getDatabase, ref, onValue, set, update, remove, push` backed by a plain JS object + pub/sub, then load the real file via `file://`. This is the only way changes have been tested so far — there is no committed test suite.
- Outbound network to `gstatic.com`/Firebase may be blocked in sandboxed environments (proxy 403) — this doesn't affect the fake-backend testing approach above, which never hits the network.

## Architecture

Everything lives in one file, `index.html`: inline CSS, then a single `<script type="module">` containing all app logic. No framework, no bundler — UI is built by string-templating HTML into `#app`'s `innerHTML` on every state change (a full `render()` call), with `onclick="handler(...)"` attributes wired to plain functions.

**Because the script is a module, none of its top-level functions are implicitly global.** Every function referenced from an inline `onclick` string must be explicitly re-exported via the single `Object.assign(window, {...})` call near the bottom of the script — forgetting to add a new handler there is the most common way to introduce a silent (console-error-only) bug.

### Data model (Firebase Realtime Database)
```
/days/{yyyy-M-d}/{kid}-{taskId}: boolean       // per-day checked state, kid = 'lies' | 'lenn'
/settings/tasks/{role}/{taskId}: { label, recurring, order, weekdays? }   // role = 'A' | 'B'
/settings/vacuum: { weekdays: number[] }
```
- Each independent piece of remote state gets its **own permanent `onValue` listener** plus its own `*Loaded` boolean gate (`tasksLoaded`, `vacuumLoaded`, `dayLoaded`), all of which `render()` waits on before showing real content. This is the established pattern — a new piece of synced state should follow it rather than being folded into an existing listener.
- The day listener (`attachDayListener`) is the one exception that gets torn down and reattached (on every `changeDay`/`goToday`), using an incrementing `dayListenerToken` to make stale/in-flight callbacks from a previously-replaced listener into no-ops. Any new per-day-scoped listener should reuse this token pattern, not the day-key itself (a token survives revisiting the *same* day, a key comparison doesn't).
- `weekdays: number[]` (0=zondag..6=zaterdag, matches `Date.getDay()` and the `WD` array): **field absent = every day** (this is how legacy/seeded task records without the field behave — no migration is ever needed when extending the schema this way); **explicit `[]` = never active**. This absent-vs-empty distinction is load-bearing — always check `Array.isArray(t.weekdays)` (see `taskWeekdays`/`vacuumWeekdays`), never a truthiness/length check that would conflate the two.
- Writes to array-shaped fields (`weekdays`) always replace the whole array in one `update()` call — never write to a nested numeric index — to avoid Firebase's sparse-array-to-object coercion.

### Task semantics
- `recurring:true` = shows on every day matching its `weekdays`. `recurring:false` (one-off) = same visibility rule, but the moment it's checked (on any allowed day), it's `remove()`d from `settings/tasks` entirely — gone from every day, permanently, not just "done for today."
- Role A/B ownership alternates daily and automatically (`getRoles`, even/odd day index) — this is independent of and untouched by weekday scheduling.
- Vacuuming (`getVacuum`) is a third, separate concept: not tied to Role A/B at all. It has its own admin-editable weekday schedule (`settings/vacuum`) plus an automatic kid+floor rotation computed by counting how many configured vacuum-days have occurred since `START` — changing the schedule retroactively recomputes this count for *all* days (including already-viewed/completed ones), which is a known, accepted trade-off, not a bug to fix reflexively.

### Admin page
Password-gated (`ADMIN_PASSWORD` constant, checked client-side via `prompt()`) — this is a UI-level deterrent only, not real security; Firebase rules for `days`/`settings` are open read/write. All admin mutations are `prompt()`/`confirm()`-based, matching the app's no-forms style — don't introduce HTML `<form>`/inline-editable-input patterns for a single field when a `prompt()` will do, but note a 7-way multi-select (weekday pickers) is exactly where this style hits its limit, which is why weekday selection is done via 7 individual toggle buttons (click-to-flip-and-write, like `toggleRecurring`) rather than a dialog.

### Other conventions worth knowing
- `escapeHtml()` must wrap any admin-entered free text (task labels) before it's interpolated into an `innerHTML` template — labels are stored raw and only escaped at render time. This app has previously shipped a stored-XSS bug here; don't reintroduce it when adding new places that render a label.
- The celebration popup (`showCelebration`) has an anti-repeat guard (`celebratedDays`, a `Set` of day-keys) specifically because `render()` can be triggered by any of several independent async listeners, not just the user's own action — a naive "DOM node already exists" check is not sufficient once state changes can arrive from elsewhere (another tab, an unrelated settings edit) while the popup is already dismissed.
