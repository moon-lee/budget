# Per-Account Row Colors in Budget Overview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every Budget Overview row with an `account_id` its account's own color — a 3px left bar plus a colored Account cell — across the Savings pots, Expense lines, and Pay-day moves tables, with mismatch carried only by a `⚠` marker.

**Architecture:** A new pure module `src/ui/account-colors.ts` maps an account id to a palette entry, indexed by the account's rank in the `sort_order`-sorted list so appending an account never recolors existing ones. The Lit view sets one `.acct` class plus two CSS custom properties per row; a pair of CSS rules turns those into the bar and the cell color. The existing `mismatchedAccounts()` rollup is unchanged and now feeds only the `⚠` glyph and the moves-header `.warn`, replacing the ungrouped grand-total comparison that could disagree with it.

**Tech Stack:** TypeScript (strict), Lit 3 web components (shadow DOM), plain CSS custom properties, `node:test` + `node:assert/strict` (no test framework), Prettier with `--single-quote`.

**Spec:** `docs/superpowers/specs/2026-10-09-account-row-colors-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/ui/account-colors.ts` | **New.** The two palettes and the account → hue-pair lookup. Pure, no Lit import, so it compiles under `tsconfig.test.json` and is directly unit-testable. |
| `src/ui/budget-overview-view.ts` | **Modified.** Renders the `acct` class + custom properties; deletes the `.mismatch` gold rule; adds the bar/cell/light-theme CSS; hoists `mismatchedAccounts()`; derives the moves-header `off` from it. |
| `tests/account-colors.test.mjs` | **New.** Unit tests for the palette lookup. |
| `tsconfig.test.json` | **Modified.** Add the one new `src/ui` path so it compiles to `build/test/ui/`. |
| `package.json` | **Modified.** Version `0.2.2` → `0.2.3` in both fields. |

**Why the new module is separate:** the existing view is 450 lines and already owns render, state, and load logic. The palette is data + one pure function with no DOM dependency, so extracting it is what makes it testable at all — `mismatchedAccounts()` itself is a private method on a Lit element and cannot be reached without a DOM.

---

## Background the implementer needs

### Current state of `budget-overview-view.ts`

- Line 18–75: `static styles`, a Lit `css` tagged template. The last two rules are:
  - `:73` `.hist-table tr.selected td{background:var(--ff-bg-input,#3c3c3c)}`
  - `:74` `.hist-table tr.mismatch td{color:var(--ff-warning-text,#ffd866)}` ← **this rule is deleted by Task 3**
- Line 77–105: instance fields. `accountLabels` is `Map<number, any>`.
- Line 118: `this.accountLabels = await accountById(this.finance);`
- Line 228–230: `private static sumWeekly(rows)` — rounds to 2dp.
- Line 280–298: `summaryHtml(...)` renders the Savings pots and Expense lines tables. Line 295 is `<tbody>${rows.map((p) => this.rowHtml(p, sel, this.mismatchedAccounts()))}</tbody>`
- Line 300–309: `rowHtml(p, sel?, bad?)` — renders a pot/expense row. Line 303 builds the class list; line 306 renders the Account cell and appends `' ⚠'`.
- Line 311–319: `moveRowHtml(f, bad?)` — renders a move row. Line 313 builds the class list; line 316 renders the Account cell and appends `' ⚠'`.
- Line 321–351: `movesHtml()`. Line 325–327 computes `planned` / `gap` / `off`. Line 337 applies `.warn` to the three `<b>` totals. Line 348 is the second `this.mismatchedAccounts()` call inside `.map()`.
- Line 353–371: `private mismatchedAccounts(): Set<number>` — the comparator. **Do not change its arithmetic.**

### Test setup facts (verified, do not re-derive)

- `npm test` runs `tsc -p tsconfig.test.json && node --test "tests/*.test.mjs"`. All 38 tests currently pass.
- `tsconfig.test.json` has `"include": ["src/dao", "src/services", "src/mock"]`. It uses `module: NodeNext`, so **imports in testable `src/` modules must use explicit `.js` extensions**.
- Adding a specific file path to that `include` array compiles it to `build/test/<same path>`. Verified: adding `src/ui/__probe.ts` produced `build/test/ui/__probe.js`. Use the specific file path, NOT the whole `src/ui` directory — the other UI files import `lit` and use `?raw` CSS imports that `tsc` cannot resolve under this config.
- Tests import compiled output, not TS: `import { potYearly } from '../build/test/services/budget-service.js';`

### Prettier reality check (verified)

`npx prettier --check --single-quote "src/ui/**/*.ts"` **already fails on 9 existing files** on a clean `dev` branch, before any of this work. That is pre-existing, not something these tasks introduce. This plan scopes Prettier to **only the new file** and does not reformat `budget-overview-view.ts`, so the pre-existing failures are neither fixed nor worsened. Do not run a blanket `--write` across `src/ui/**`.

---

## Task 1: Account color palette module

**Files:**
- Create: `src/ui/account-colors.ts`
- Modify: `tsconfig.test.json` (`include` array)
- Test: `tests/account-colors.test.mjs`

- [ ] **Step 1: Make `src/ui/account-colors.ts` compilable by the test config**

In `tsconfig.test.json`, change:

```json
  "include": ["src/dao", "src/services", "src/mock"]
```

to:

```json
  "include": ["src/dao", "src/services", "src/mock", "src/ui/account-colors.ts"]
```

- [ ] **Step 2: Create the module with the palettes and lookup**

Create `src/ui/account-colors.ts`:

```ts
/**
 * Per-account row colors for the Budget Overview.
 *
 * Each account gets one hue from a fixed palette so a pot row, an expense line
 * row, and a move row on the same account are visually the same family. The
 * hue is chosen by the account's RANK in the sort_order-sorted list — not by
 * `account_id` — so appending an account gives it a new color without
 * recoloring any existing one.
 *
 * Two parallel palettes: the dark set is tuned for the app's `--ff-bg-base`
 * (#1e1e1e), the light set for `body.light-theme` (#f8fafc). Same hexes do not
 * read on both, so the light variants are darker.
 *
 * Lives here rather than in `styles/ext-tokens.css` because that file is a
 * vendored snapshot overwritten by the host app's `refresh` command
 * (AGENTS.md §1, §10).
 */

/** 12 hues for dark theme surfaces. Index = account rank. */
export const ACCOUNT_HUES: readonly string[] = [
  '#4ec9b0', // teal
  '#569cd6', // blue
  '#c586c0', // pink
  '#dcdcaa', // sand
  '#6a9955', // green
  '#e5c07b', // amber
  '#9cdcfe', // sky
  '#c8c8c8', // silver
  '#b5cea8', // mint
  '#f28b82', // salmon
  '#d18f52', // clay
  '#7fdbca', // aqua
];

/** Darker variants of the same 12 hues, for `body.light-theme`. */
export const ACCOUNT_HUES_LIGHT: readonly string[] = [
  '#0f766e', // teal
  '#1d4ed8', // blue
  '#a21caf', // pink
  '#854d0e', // sand
  '#3f6212', // green
  '#b45309', // amber
  '#0369a1', // sky
  '#64748b', // silver
  '#4d7c0f', // mint
  '#be123c', // salmon
  '#c2410c', // clay
  '#0f766e', // aqua
];

export interface HuePair {
  /** Dark-theme hex. */
  hue: string;
  /** Light-theme hex. */
  hueLight: string;
}

/**
 * Palette index for an account, or null when there is nothing to color.
 *
 * Index is the account's position in the (already sort_order-sorted) map's
 * values. Cycles past the palette size, so two accounts may share a hue — the
 * bar is a pairing aid, not a uniqueness guarantee.
 */
export function hueIndexForAccount(
  accounts: Map<number, { sort_order: number }>,
  id: number | null | undefined
): number | null {
  if (id == null) return null;
  let index = 0;
  for (const key of accounts.keys()) {
    if (Number(key) === Number(id)) return index % ACCOUNT_HUES.length;
    index++;
  }
  return null;
}

/**
 * Dark and light hexes for an account's row, or null when the row has no
 * account (or references an account that no longer exists). Callers render
 * `null` as an uncolored row.
 */
export function huePairForAccount(
  accounts: Map<number, { sort_order: number }>,
  id: number | null | undefined
): HuePair | null {
  const index = hueIndexForAccount(accounts, id);
  if (index == null) return null;
  return { hue: ACCOUNT_HUES[index], hueLight: ACCOUNT_HUES_LIGHT[index] };
}
```

- [ ] **Step 3: Write the failing test**

Create `tests/account-colors.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCOUNT_HUES,
  ACCOUNT_HUES_LIGHT,
  hueIndexForAccount,
  huePairForAccount,
} from '../build/test/ui/account-colors.js';

/** Build an account map the way `accountById` does: already sort_order-sorted. */
const mapOf = (ids) => new Map(ids.map((id, i) => [id, { id, sort_order: i + 1 }]));

describe('account palettes', () => {
  it('has the same number of dark and light hues', () => {
    assert.equal(ACCOUNT_HUES.length, ACCOUNT_HUES_LIGHT.length);
  });

  it('uses 6-digit hex for every hue', () => {
    for (const hex of [...ACCOUNT_HUES, ...ACCOUNT_HUES_LIGHT]) {
      assert.match(hex, /^#[0-9a-f]{6}$/i, `bad hue ${hex}`);
    }
  });
});

describe('hueIndexForAccount', () => {
  it('returns the rank of the account in the sorted map', () => {
    const accounts = mapOf([10, 20, 30]);
    assert.equal(hueIndexForAccount(accounts, 10), 0);
    assert.equal(hueIndexForAccount(accounts, 20), 1);
    assert.equal(hueIndexForAccount(accounts, 30), 2);
  });

  it('returns null for a null or undefined account id', () => {
    const accounts = mapOf([10]);
    assert.equal(hueIndexForAccount(accounts, null), null);
    assert.equal(hueIndexForAccount(accounts, undefined), null);
  });

  it('returns null for an id that is not in the map', () => {
    assert.equal(hueIndexForAccount(mapOf([10, 20]), 99), null);
  });

  it('is stable when an account is appended at the end', () => {
    const before = mapOf([10, 20, 30]);
    const after = mapOf([10, 20, 30, 40]);
    for (const id of [10, 20, 30]) {
      assert.equal(hueIndexForAccount(after, id), hueIndexForAccount(before, id));
    }
  });

  it('cycles back to the first hue past the palette size', () => {
    const size = ACCOUNT_HUES.length;
    const ids = Array.from({ length: size + 2 }, (_, i) => i + 1);
    const accounts = mapOf(ids);
    // ids[i] sits at rank i, so rank `size` wraps to hue 0 and `size + 1` to hue 1.
    assert.equal(hueIndexForAccount(accounts, ids[size]), 0);
    assert.equal(hueIndexForAccount(accounts, ids[size + 1]), 1);
  });

  it('matches a string id against numeric keys', () => {
    assert.equal(hueIndexForAccount(mapOf([10, 20]), '20'), 1);
  });
});

describe('huePairForAccount', () => {
  it('returns matching dark and light hexes at the same index', () => {
    const accounts = mapOf([10, 20, 30]);
    const pair = huePairForAccount(accounts, 20);
    assert.equal(pair.hue, ACCOUNT_HUES[1]);
    assert.equal(pair.hueLight, ACCOUNT_HUES_LIGHT[1]);
  });

  it('returns null when there is no account to color', () => {
    assert.equal(huePairForAccount(mapOf([10]), null), null);
    assert.equal(huePairForAccount(mapOf([10]), 99), null);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test`

Expected: FAIL. The compiler reports `Cannot find module '../build/test/ui/account-colors.js'` — or, if `tsc` emits before failing, the test run reports a module-not-found error. Either failure is correct; the point is the test cannot pass yet.

- [ ] **Step 5: Run the test to verify it passes**

The module was written in Step 2, so the source is already correct. Run: `npm test`

Expected: `ℹ tests 48`, `ℹ pass 48`, `ℹ fail 0`. (38 pre-existing + 10 new: 2 palette, 6 `hueIndexForAccount`, 2 `huePairForAccount`.)

If it fails, the most likely cause is the import extension — `account-colors.ts` must import nothing from other `src/` modules (it defines its own minimal `sort_order` shape, so it has no imports at all), and the test must import from `'../build/test/ui/account-colors.js'`.

- [ ] **Step 6: Format only the new file**

```bash
npx prettier --write --single-quote "src/ui/account-colors.ts"
```

Expected: rewrites the file with single quotes if needed. Then re-run `npm test` and confirm it still passes.

- [ ] **Step 7: Commit**

```bash
git add src/ui/account-colors.ts tests/account-colors.test.mjs tsconfig.test.json
git commit -m "feat(budget): per-account hue palette with rank-stable lookup"
```

---

## Task 2: Paint rows with the account hue

**Files:**
- Modify: `src/ui/budget-overview-view.ts` (imports ~line 3–8, `rowHtml` 300–309, `moveRowHtml` 311–319, CSS 73–74)

This task adds the color. It deliberately leaves `⚠` and the gold rule alone so the change is visually reviewable on its own.

- [ ] **Step 1: Add the import**

In `src/ui/budget-overview-view.ts`, after the existing import of `resolveAccountLabel` on line 3, add:

```ts
import { huePairForAccount } from './account-colors.js';
```

- [ ] **Step 2: Add the CSS rules**

In `static styles`, replace the current line 73–74 pair:

```css
    .hist-table tr.selected td{background:var(--ff-bg-input,#3c3c3c)}
    .hist-table tr.mismatch td{color:var(--ff-warning-text,#ffd866)}
```

with:

```css
    .hist-table tr.selected td{background:var(--ff-bg-input,#3c3c3c)}
    .hist-table tr.acct td:first-child{box-shadow:inset 3px 0 0 var(--hue,#888)}
    .hist-table tr.acct td.acct-cell{color:var(--hue,#888)}
    :host-context(body.light-theme) .hist-table tr.acct td:first-child{box-shadow:inset 3px 0 0 var(--hue-light,#64748b)}
    :host-context(body.light-theme) .hist-table tr.acct td.acct-cell{color:var(--hue-light,#64748b)}
```

Notes on why this shape:

- One class + two custom properties instead of 12 duplicated class rules.
- `:host-context(body.light-theme)` is required because the host toggles `light-theme` on the app `document.body` (`ext-tokens.css:64`), which cannot reach into this component's shadow root. `:host-context()` bridges that, and the panel is Electron/Chromium so it is supported.
- The `.mismatch` gold rule stays for now — Task 3 removes it. Leaving it here means Task 2's rows show hue + gold together, which is the expected intermediate state.

- [ ] **Step 3: Update `rowHtml`**

Replace lines 300–309 with:

```ts
  private rowHtml(p: any, sel?: Set<string>, bad?: Set<number>) {
    const hp = huePairForAccount(this.accountLabels, p.account_id);
    const acct = resolveAccountLabel(this.accountLabels, p.account_id);
    const checked = sel?.has(p.pot_key) ?? false;
    const classes = [checked ? 'selected' : '', hp ? 'acct' : ''].filter(Boolean).join(' ');
    return html`<tr class=${classes} style=${hp ? `--hue:${hp.hue};--hue-light:${hp.hueLight}` : ''}>
      ${sel ? html`<td><input type="checkbox" ?checked=${checked} .checked=${checked} @change=${() => this.toggleSel(sel, p.pot_key)} aria-label="Select ${p.label}"></td>` : ''}
      <td>${p.label}</td><td class="acct-cell">${acct ?? '—'}${bad?.has(Number(p.account_id)) ? ' ⚠' : ''}</td>
      <td class="num">${BudgetOverviewView.aud(p.weekly_amount)}</td>
    </tr>`;
  }
```

- [ ] **Step 4: Update `moveRowHtml`**

Replace lines 311–319 with:

```ts
  private moveRowHtml(f: any, bad?: Set<number>) {
    const hp = huePairForAccount(this.accountLabels, f.account_id);
    const checked = this.selMoves.has(f.flow_key);
    const classes = [checked ? 'selected' : '', hp ? 'acct' : ''].filter(Boolean).join(' ');
    return html`<tr class=${classes} style=${hp ? `--hue:${hp.hue};--hue-light:${hp.hueLight}` : ''}>
      <td><input type="checkbox" ?checked=${checked} .checked=${checked} @change=${() => this.toggleSel(this.selMoves, f.flow_key)} aria-label="Select ${f.label}"></td>
      <td>${f.label}</td><td>${f.day === 'friday' ? 'Friday' : 'Sunday'}</td><td class="acct-cell">${resolveAccountLabel(this.accountLabels, f.account_id) ?? '—'}${bad?.has(Number(f.account_id)) ? ' ⚠' : ''}</td>
      <td class="num">${BudgetOverviewView.aud(f.weekly_amount)}</td>
    </tr>`;
  }
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc -p tsconfig.json --noEmit`

Expected: no errors. If `style=${...}` on a `<tr>` errors under Lit's types, the fix is to keep the attribute binding but build the string first:

```ts
const style = hp ? `--hue:${hp.hue};--hue-light:${hp.hueLight}` : null;
```

and use `style=${style}` — Lit renders a `null` attribute binding as absent, which is the same result.

- [ ] **Step 6: Verify visually in dev**

Run `npm run dev`, open the Budget Overview, and confirm:

1. Rows sharing an account show the **same** left-bar color and Account-cell color across Savings pots, Expense lines, and Pay-day moves.
2. Two different accounts show **different** colors.
3. A row with no account shows `—`, no bar, no colored cell.
4. Selecting a checkbox keeps the bar visible over the selection background.
5. Rows for accounts that are mismatched currently show hue **and** gold text (intermediate state — Task 3 removes the gold).

- [ ] **Step 7: Commit**

```bash
git add src/ui/budget-overview-view.ts
git commit -m "feat(budget): paint overview rows with their account hue"
```

---

## Task 3: Mismatch becomes marker-only, header agrees

**Files:**
- Modify: `src/ui/budget-overview-view.ts` (CSS line ~74, `movesHtml` 321–351)

- [ ] **Step 1: Delete the gold rule**

In `static styles`, delete this line:

```css
    .hist-table tr.mismatch td{color:var(--ff-warning-text,#ffd866)}
```

No `.mismatch` class is added anywhere in the codebase — `:303` and `:313` only ever produced the string for the gold rule, so removing the rule is sufficient. Verify with:

```bash
Select-String -Path "src/ui/*.ts" -Pattern "mismatch" | Select-String -NotMatch "mismatchedAccounts"
```

Expected: no output.

- [ ] **Step 2: Derive the header `off` from `mismatchedAccounts()`**

In `movesHtml()`, replace lines 325–327:

```ts
    const planned = BudgetOverviewView.sumWeekly(this.pots);
    const gap = Math.round((planned - combined) * 100) / 100;
    const off = gap !== 0;
```

with:

```ts
    const off = this.mismatchedAccounts().size > 0;
```

`gap` and `planned` are deleted here because nothing else in `movesHtml` used them. The `Moves` **card** at lines ~375–378 and ~421–422 keeps its own signed `gap` — it reads `this.balance.moves_gap_weekly`, a different value, and still needs it to say "unallocated" vs "over-moved". Leave that block untouched.

- [ ] **Step 3: Typecheck**

Run: `npx tsc -p tsconfig.json --noEmit`

Expected: no errors. If `planned` or `gap` is reported as unused, another line in `movesHtml` referenced it — re-read the method and remove only the dead reference.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`

Expected: `ℹ pass 48`, `ℹ fail 0`. These tasks change no tested code path; this confirms nothing regressed.

- [ ] **Step 5: Verify the header/marker agreement in dev**

Run `npm run dev` and check the Pay-day moves section:

1. When every account reconciles, the three totals (`Fri` / `Sun` / `Total`) render in normal text — no `.warn`.
2. Make one account mismatch (edit a pot's weekly amount on an account that has a move). The `⚠` appears on that account's pot, expense, and move rows, **and** the header totals turn amber.
3. Previously the header could read clean while `⚠` rows showed, because two accounts drifting in opposite directions cancelled. Construct that case if you can (add $50 to account A's pot, $50 to account B's pot while subtracting from B's move) and confirm the header now warns.
4. Confirm the `⚠` is legible against its account hue. If it reads too quietly, wrap it in a `<span class="warn">` and add `.hist-table tr.acct td.acct-cell .warn{color:var(--ff-warning-text,#ffd866)}`. This is an optional refinement, not a blocker.

- [ ] **Step 6: Commit**

```bash
git add src/ui/budget-overview-view.ts
git commit -m "refactor(budget): mismatch as marker-only, header derives from rollup"
```

---

## Task 4: Hoist the per-row `mismatchedAccounts()` call

**Files:**
- Modify: `src/ui/budget-overview-view.ts` (`render()` ~373, `summaryHtml` 280–298, `movesHtml` 321–351, the two `.map()` call sites 295 and 348)

Pure performance; no behavior change. Kept separate so the correctness tasks stay reviewable on their own.

- [ ] **Step 1: Add the cached field**

After the existing field `private selRev = 0;` (line ~105), add:

```ts
  /** Mismatched account ids for the current render. Recomputed in render(). */
  private bad: Set<number> = new Set();
```

- [ ] **Step 2: Recompute once in `render()`**

At the very top of `render()`, after the existing `if (typeof HTMLElement === 'undefined') return html``;` guard, add:

```ts
    this.bad = this.mismatchedAccounts();
```

- [ ] **Step 3: Use it at the pot/line call site**

In `summaryHtml()`, replace line 295:

```ts
        <tbody>${rows.map((p) => this.rowHtml(p, sel, this.mismatchedAccounts()))}</tbody>
```

with:

```ts
        <tbody>${rows.map((p) => this.rowHtml(p, sel, this.bad))}</tbody>
```

- [ ] **Step 4: Use it at the move call site**

In `movesHtml()`, replace line 348:

```ts
        <tbody>${rows.map((f) => this.moveRowHtml(f, this.mismatchedAccounts()))}</tbody>
```

with:

```ts
        <tbody>${rows.map((f) => this.moveRowHtml(f, this.bad))}</tbody>
```

- [ ] **Step 5: Reuse it for the header instead of recomputing**

In `movesHtml()`, change:

```ts
    const off = this.mismatchedAccounts().size > 0;
```

to:

```ts
    const off = this.bad.size > 0;
```

`movesHtml()` is called from `render()` **after** line 2 of Step 2, so `this.bad` is already current. Confirm the call order in `render()`: `movesHtml()` is invoked at line ~429 via `this.movesHtml()`, which is after the top-of-`render()` assignment.

- [ ] **Step 6: Typecheck and test**

```bash
npx tsc -p tsconfig.json --noEmit
npm test
```

Expected: no errors, `ℹ pass 48`, `ℹ fail 0`.

- [ ] **Step 7: Verify in dev**

Run `npm run dev`. Confirm the `⚠` markers and header `.warn` are byte-identical to Task 3's verified behavior. This task must be visually a no-op.

- [ ] **Step 8: Commit**

```bash
git add src/ui/budget-overview-view.ts
git commit -m "perf(budget): compute the mismatch rollup once per render"
```

---

## Task 5: Version bump and build check

**Files:**
- Modify: `package.json` (lines 3 and 10)

AGENTS.md §9: bump patch `+0.0.1` on both version fields and commit **before** rebuilding, because `ExtensionInstaller` rejects downgrades.

- [ ] **Step 1: Bump both version fields**

In `package.json`, change line 3:

```json
  "version": "0.2.2",
```

to:

```json
  "version": "0.2.3",
```

and change line 10, inside `financeExtension`:

```json
    "version": "0.2.2",
```

to:

```json
    "version": "0.2.3",
```

Both fields must match — AGENTS.md §9 requires them in sync.

Alternative, using the repo's own helper: `npm run version:bump` (see `scripts/version-bump.mjs`). Use it only if it produces `0.2.3` in both fields; verify before committing.

- [ ] **Step 2: Verify the manifest still parses and the bundle builds**

```bash
npm run build
```

Expected: `build/extension/budget.js` plus `package.json` emitted, no errors. The bundle must stay under 200KB (AGENTS.md §9, enforced by `sdk-build.test.ts` upstream).

- [ ] **Step 3: Final full verification**

```bash
npx tsc -p tsconfig.json --noEmit
npm test
```

Expected: no errors, `ℹ pass 48`, `ℹ fail 0`.

- [ ] **Step 4: Confirm no vendored file was touched**

```bash
git diff --stat HEAD~4 -- src/finance.d.ts src/vite-env.d.ts src/vendor src/styles
```

Expected: no output. Those are vendored snapshots; `refresh` overwrites them and they must stay byte-identical to upstream (AGENTS.md §10).

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "chore(budget): bump version to 0.2.3"
```

- [ ] **Step 6: Install and confirm**

In the app: Extensions → Install Folder → pick `build/extension` → restart. Then open Budget Overview and re-verify the full list from Task 2 Step 6 and Task 3 Step 5 against the real SQLite DB, not just the in-memory dev mock. The dev mock is ephemeral; real `better-sqlite3` tables only exist after Install + restart (AGENTS.md §2).

---

## Verification Summary

Run this before declaring the work done. Every line must be confirmed from actual output, not assumed.

| # | Check | Command / Method | Expected |
|---|---|---|---|
| 1 | Unit tests pass | `npm test` | `pass 48`, `fail 0` |
| 2 | App typechecks | `npx tsc -p tsconfig.json --noEmit` | no output |
| 3 | Bundle builds | `npm run build` | emits `build/extension/budget.js` |
| 4 | Same account = same color | `npm run dev`, all three tables | identical bar + cell color |
| 5 | Different accounts differ | `npm run dev` | visibly different hues |
| 6 | No-account rows plain | `npm run dev` | `—`, no bar, no color |
| 7 | Selection keeps bar | `npm run dev`, check a box | bar still visible |
| 8 | Mismatch shows `⚠` | edit a pot on an account with a move | `⚠` on that account's pot, expense, and move rows |
| 9 | Header agrees with markers | same edit | header totals turn amber |
| 10 | No gold text remains | inspect any mismatched row | Account cell is the hue, not gold |
| 11 | Light theme readable | toggle `light-theme` | bar and cell both legible |
| 12 | Vendored files untouched | `git diff --stat HEAD~4 -- src/finance.d.ts src/vite-env.d.ts src/vendor src/styles` | no output |

**Known accepted limitations** (from the spec, not regressions):

- More than 12 accounts share hues.
- Rows with no account are invisible to `mismatchedAccounts()`, so they get neither a color nor a `⚠`, even though the grand total counts them. Pre-existing, explicitly out of scope.
- The `Moves` card still reports "unallocated" vs "over-moved" from its own signed gap, which can differ from the header's boolean warn. Intentional — the card needs the sign.