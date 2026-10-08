# Design: Per-Account Row Colors in Budget Overview

Date: 2026-10-09
Status: approved

## Problem

`BudgetOverviewView` currently colors a row gold (`.mismatch`) when its **account**
has `Σ pots ≠ Σ flows`. Two consequences:

1. The gold is account-scoped, so on a multi-row account every row goes gold. It says
   "this account is off" but not which pot pairs with which move.
2. Matched rows are plain text. There is no way to trace a pot to its move by eye, so
   a user who wants to check a pairing has to read the Account cell on every row.

The user wants each account to carry its own color across all three tables, so that a
pot row, an expense line row, and a move row on the same account are visually the same
family. The mismatch signal must survive without fighting the account color for the
text color.

## Goal

Every row with an `account_id` shows that account's hue: a 3px left bar plus a colored
Account cell. Matching rows and mismatching rows look the same family. Mismatch is
carried by a `⚠` marker only. The moves header summary agrees with the `⚠` markers.

## Non-goals

- No legend strip, no account color chips in section headers.
- No checkbox accent tinting.
- Rows with **no** account stay plain and uncolored, per current behavior. They are
  also invisible to `mismatchedAccounts()` (`:357`, `:362`), so they never get a `⚠`
  either — even though the header's grand total counts them. That inconsistency is
  pre-existing and out of scope here.
- No change to `syncFlowsForAccount`, the sync tiers, or any write path.
- No new DB column. Colors are derived, never stored.

## Approach

### Palette and assignment

New module `src/ui/account-colors.ts`:

```ts
export const ACCOUNT_HUES: readonly string[];      // 12 hex values, dark theme
export const ACCOUNT_HUES_LIGHT: readonly string[]; // 12 hex values, light theme
export function hueIndexForAccount(
  accounts: Map<number, AccountRow>,
  id: number | null | undefined
): number | null;
export function huePairForAccount(
  accounts, id
): { hue: string; hueLight: string } | null;
```

Assignment is by **rank in the `sort_order`-sorted account list**, not by `account_id`.
`listAccounts` already returns accounts sorted by `sort_order` (`src/dao/accounts.ts:20`),
so the rank is the index of the account's `id` in `[...accounts.values()]`.

Why rank over `account_id`: appending an account at the end of the list gives it a new
hue without recoloring any existing account. Using the raw id would reshuffle colors
whenever an account is inserted mid-list.

Past 12 accounts the palette cycles (`index % ACCOUNT_HUES.length`), so two accounts may
share a hue. Acceptable: the left bar is a pairing aid, not a uniqueness guarantee.

`hueIndexForAccount` returns `null` when `id` is `null`/`undefined` **or** when the id is
absent from the map (a dangling `account_id`, or a row whose account was hard-deleted).
Both cases render plain. The lookup is a `Map.get` plus one index scan over up to a
dozen entries — cheap enough to call per row without caching.

Colors live in this module, **not** in `src/styles/ext-tokens.css` — that file is a
vendored snapshot from the host app and is overwritten by
`node D:/finance_flow_ai/scripts/sdk/cli.mjs refresh .` (AGENTS.md §1, §10). Editing it
would be silently reverted.

### Light theme

The host toggles `body.light-theme` on the app document (`ext-tokens.css:64`). The
overview renders inside a Lit shadow root, so that selector cannot reach the component's
own rules. The panel is Electron/Chromium, so `:host-context()` is available:

```css
/* dark defaults */
.hist-table tr.acct td:first-child{box-shadow:inset 3px 0 0 var(--hue,#888)}
.hist-table tr.acct td.acct-cell{color:var(--hue,#888)}

:host-context(body.light-theme) .hist-table tr.acct td:first-child{
  box-shadow:inset 3px 0 0 var(--hue-light,#666)}
:host-context(body.light-theme) .hist-table tr.acct td.acct-cell{
  color:var(--hue-light,#666)}
```

Each `<tr>` sets **both** custom properties from TS:

```ts
style=${hp ? `--hue:${hp.hue};--hue-light:${hp.hueLight}` : ''}
```

where `hue` / `hueLight` come from parallel `ACCOUNT_HUES` / `ACCOUNT_HUES_LIGHT`
arrays. The light array is darker than the dark array, since the same hex that reads on
`#1e1e1e` is too pale on `#f8fafc`.

This is verified by eye in `npm run dev` — both themes, three tables.

### Rendering

One class and one custom property per row, so there are two CSS rules rather than 24:

```ts
// budget-overview-view.ts, rowHtml and moveRowHtml
const hp = huePairForAccount(this.accountLabels, row.account_id);
const classes = [checked ? 'selected' : '', hp ? 'acct' : ''].filter(Boolean).join(' ');
return html`<tr class=${classes} style=${hp ? `--hue:${hp.hue};--hue-light:${hp.hueLight}` : ''}> ... `;
```

```css
/* replaces the current .mismatch text rule at :74 — see Light theme below for
   the full rule set including the :host-context overrides */
.hist-table tr.acct td:first-child{box-shadow:inset 3px 0 0 var(--hue,#888)}
.hist-table tr.acct td.acct-cell{color:var(--hue,#888)}
```

The Account cell gains `class="acct-cell"` in both renderers (`:306`, `:316`) so only
that cell takes the hue; label and weekly cells keep default text color.

`.mismatch` and its gold text rule are **removed**. No other rule references
`.mismatch`, so this is a clean deletion.

Selected rows keep `.selected`'s background (`:73`). `box-shadow` on the first cell
paints over the zebra stripe (`:24`) and over `.selected`, so the bar stays visible in
all three row states.

### Mismatch is now marker-only

`mismatchedAccounts()` is unchanged — it still returns `Set<number>` of account ids with
`round2(Σ pot.weekly_amount) ≠ round2(Σ flow.weekly_amount)`. It feeds only the `⚠`
glyph now, at `:306` and `:316`.

The `⚠` keeps its current placement: appended to the Account cell text. Because the
Account cell text is already the account hue, the `⚠` inherits that hue rather than
standing out in gold. If that reads too quietly, the follow-up is a `.mismatch` rule
that colors only the `⚠` span — that is a one-line addition, deliberately deferred so
the first render can be judged on its own.

### Header agrees with the markers

Today `movesHtml` (`:325-327`) computes `off` from ungrouped grand totals:

```ts
const planned = BudgetOverviewView.sumWeekly(this.pots);
const gap = Math.round((planned - combined) * 100) / 100;
const off = gap !== 0;
```

Two accounts off by +$50 and −$50 cancel, so `off` is `false` while both accounts show
`⚠`. New:

```ts
const bad = this.mismatchedAccounts();
const off = bad.size > 0;
```

`.warn` at `:337` then fires exactly when at least one `⚠` is on screen.

The signed grand-total `gap` is **kept**, because the `Moves` card at `:377` and `:422`
uses it to distinguish "unallocated" from "over-moved". That card keeps its own logic;
only the header chip changes.

### Hoist the per-row recomputation

`mismatchedAccounts()` is currently called inside `.map()` at `:295` and `:348`, so the
full O(pots + flows) rollup runs once per rendered row. Hoist to one call per render in
`render()`, store in a field, and pass it down like the existing `sel` / `bad` params.

## Data flow

```
load()  → this.pots, this.flows, this.accountLabels
render() → this.mismatchedAccounts()      → Set<account_id>  (once)
        → huePairForAccount(labels, id)   → {hue, hueLight} (per row)
rowHtml / moveRowHtml
        → <tr class="selected? acct" style="--hue:…;--hue-light:…">
              [checkbox] [label] [account hue + ⚠?] [weekly]
```

No new async work, no new DB reads. `accountLabels` is already loaded (`:118`).

## Edge cases

| Case | Behavior |
|---|---|
| `account_id` null | Plain row, no bar, no hue. Never in `bad`, so never `⚠`. |
| `account_id` not in map | Plain row, no bar, no hue. The `⚠` still appears if the id is in `bad` — correct, since the account is genuinely unresolved. |
| >12 accounts | Hues cycle. |
| Account deleted mid-session | `listAccounts` drops it; its rows go plain. `referenceByCurrentRow` blocks deactivation of referenced accounts (`dao/accounts.ts:89-103`) but not deletion — worth noting, not fixing here. |
| Row selected | Bar and hue persist over `.selected` background. |
| Light theme | Handled by `:host-context(body.light-theme)` + a second palette array. See "Light theme". |

## Testing

New `tests/account-colors.test.mjs` (plain `.mjs`, matching the existing test style —
no test framework in the repo):

1. `hueIndexForAccount` returns `null` for null / unknown id.
2. Rank-based stability: two maps differing only by an account appended at the end
   return the same index for a shared account.
3. Cycling: 13 accounts yield index `0` again for the 13th.
4. `huePairForAccount` returns a `hue` in `ACCOUNT_HUES` and a `hueLight` in
   `ACCOUNT_HUES_LIGHT` at the same index.
5. `ACCOUNT_HUES` and `ACCOUNT_HUES_LIGHT` are the same length.

`mismatchedAccounts()` itself is a private method on the Lit element and is not
directly testable without a DOM. The refactor does not change its arithmetic; the
header change is verified by hand in `npm run dev`.

## Files touched

| File | Change |
|---|---|
| `src/ui/account-colors.ts` | New. Both palettes, rank lookup, `huePairForAccount`. |
| `src/ui/budget-overview-view.ts` | Hoist `mismatchedAccounts()`; `acct` class + `--hue`/`--hue-light` + `acct-cell`; header `off` from `bad.size`; delete `.mismatch` CSS; add `:host-context` light rules. |
| `tests/account-colors.test.mjs` | New. |
| `package.json` | Version bump `0.2.2` → `0.2.3` (both `version` and `financeExtension.version`) before rebuild. |

## Versioning

Per AGENTS.md §9, bump patch `+0.0.1` on both version fields and commit before
`npm run build` → Install Folder, since the installer rejects downgrades.