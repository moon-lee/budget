---
version: 0.1.0
created: 2026-09-13
last_updated: 2026-09-15T12:00:00+10:00
status: approved
---

# Budget Extension — View Design

Source: `docs/Tax Brackets_2026_2027.xlsx`, sheet `CashFlow` (`A1:P1005`).
Reference pattern: `extensions/salary-history` (orchestrator + dao + services + ui views, single-tab `mount-update` retarget) and `extensions/dashboard` (aggregator card via `services.invoke`).
SDK target: standalone extension built with `node D:/finance_flow_ai/scripts/sdk/cli.mjs` (`init` → `dev` → `build` → Install Folder).

## 1. Main rule (approved): the plan diary with re-allocation

The Budget extension manages the user's **plan and its history** — never actual money moved.

- The user sets a plan: income → savings pots + expense lines + Friday/Sunday pay-day moves.
- When life changes, the user changes the plan. Every add, edit, and delete is saved as history: adds open a new dated row; edits close the old row and open a new one; deletes archive (close with an end date) instead of erasing. Old rows are closed with an end date, never overwritten or erased.
- **Re-allocation** (moving money between pots, e.g. Child $10 → $0 and Emergency $250 → $260) is a first-class action: one form writes the matching pair of dated rows together, so the trace never breaks.
- The Overview always shows the **current** plan; the full trace (what was the plan in July? when did this pot change?) is readable underneath.
- Actual spending history is out of scope — actuals live in Salary / Mortgage / bill detail sheets.

## 2. Sheet map (CashFlow values read 2026-09-13)

| Sheet area | Rows | Contents |
|---|---|---|
| Income | Row 2 | One line, weekly $1,337.06 / yearly $69,526.93. Formulas: `='2026-2027'!D15` (weekly avg) and `='2026-2027'!D14` (52×avg forecast). Source = Salary payslips. |
| Savings pots | Rows 5–14 | 10 pots, $820/wk = $42,640/yr (`=SUM(C5:C15)`). Each: name + bank + weekly amount + account suffix: Emergency NAB SAVING $250 (5272), Child $10 (0743), Solar $50 (8107), Investment $50 (4323), New Car $20 (3545), Family Fund BOQ $10, Home Expenses MACQUARIE $10, Emergency 3 UBANK $10, Emergency 2 $10, Mortgage NAB OFFSET $400. |
| Expense lines | Rows 19–28 | 10 lines, $500/wk = $26,000/yr (`=SUM(C19:C28)`): Power Bill $50, Car Rego & Insurance $100, Rates and Water $100, Home Insurance $30, Internet $27, Mobile $42, Medibank $28, Union Fee $20, Fitness Pass $53, Car Fuel $50. |
| Balance check | Row 32 | `=C16+C30` → $1,320/wk in vs out ($68,640/yr). Balances exactly. Right side: `=H6+H14+H18` → $1,310 vs $1,320, labeled "not over". |
| Friday flow | Col G/H rows 2–6 | Pay-day moves on pay Friday: Mortgage $400 (NAB OFFSET), Bill-Big4 `=SUM(C19:C22)` (NAB OFFSET), Car Fuel `=C28` (NAB SAVING 3564), Bills `=SUM(C23:C27)` (NAB SAVING 3564). |
| Sunday flow | Col G/H rows 8–19 | Weekly moves every Sunday: Solar $50 (8107), Emergency $240 (5272), Investment $50 (4323), Emergency 2 `=C13` (9722), Car `=C9` (3545), Child $10 (0743), Home $10 (MACQUARIE), Family $10 (BOQ), Emergency $10 (UBANK). |
| Detail sheets | — | Power Bill / Car Expense / Other Income / My Budget plan track actuals per year — future consumer extensions, not this design. |

## 3. Screens (3 total: 2 approved + Accounts amendment 2026-09-15)

Single tab: `views: [{ id: budget, name: Budget }]`, `activationEvents: ["onStartup", "onView:budget"]` (`onStartup` keeps the `budget` service registered for Dashboard-style consumers, same cold-start lesson as salary). Three `navigation` commands retarget the open panel via `mount-update` (salary/mortgage single-tab shape).

| # | View | Sheet source | Contents |
|---|---|---|---|
| 1 | Budget Overview | Rows 1–32 | Income card (auto from Salary `pay` service, manual fallback row when missing); savings pots table (10 pots, account + weekly + yearly `×52`, current rows only; Add / Edit / Archive per row); expense lines table (10 lines, same Add / Edit / Archive); balance-check card (in vs out weekly/yearly, green balanced / red over + amount). History shown per row (effective dates) with a plan-trace section. Owns the Add / Edit / Archive + Re-allocate actions. |
| 2 | Flow Planner | Col G/H + rows 2–19 | Friday moves + Sunday moves as editable rows: day (`friday`/`sunday`), name, weekly amount, account dropdown. Same dated-row style; re-allocation can move amounts between flows. |
| 3 | Accounts | §4.0 | Bank account master list (bank + suffix + label): Add / Rename / Deactivate; dropdown source for pot/flow forms (amendment 2026-09-15). |

## 4. Data model (copy-paste manifest JSON)

Extension id: `budget` (display name `Budget`); tables use the `budget_` prefix. Money = `real`, `min: 0`; `date` = `YYYY-MM-DD`. Current = row with `effective_to IS NULL` (same convention as `salary_history_rate_history`); only one current row per pot/flow key (service-enforced, manifest has no `unique`). Pots/flows reference `budget_accounts` by `account_id` FK (nullable — most expense lines have no bank); reads join the label/bank for display.

### 4.0 `budget_accounts` — bank account lookup (sheet banks + suffixes in §2)

Stable master list (mortgage `mortgage_accounts` shape + `bank` for sheet grouping). No dated rows — rename any time; deactivate via `is_active`; deactivation blocked while a current pot/flow row references the account. Seed 11 rows on `activate()` (guarded by `count({}) === 0`):

| account_key | bank | label |
|---|---|---|
| 5272 | NAB SAVING | Emergency |
| 0743 | NULL | Child |
| 8107 | NULL | Solar |
| 4323 | NULL | Investment |
| 3545 | NULL | New Car |
| 9722 | NULL | Emergency 2 |
| 3564 | NAB SAVING | Bills hub |
| nab-offset | NAB OFFSET | Mortgage / Bills hub |
| boq | BOQ | Family Fund |
| macquarie | MACQUARIE | Home Expenses |
| ubank | UBANK | Emergency 3 |

```json
{
  "name": "budget_accounts",
  "columns": [
    { "name": "id", "type": "integer", "primary": true, "autoIncrement": true },
    { "name": "account_key", "type": "text", "nullable": false, "description": "Stable key: sheet suffix e.g. 5272, or slug when none e.g. nab-offset" },
    { "name": "bank", "type": "text", "nullable": true, "description": "e.g. NAB SAVING, NAB OFFSET, BOQ; empty when sheet names none" },
    { "name": "label", "type": "text", "nullable": false },
    { "name": "sort_order", "type": "integer", "nullable": false, "default": 0, "min": 0 },
    { "name": "is_active", "type": "boolean", "nullable": false, "default": true }
  ]
}
```

### 4.1 `budget_pots` — savings pots + expense lines (sheet rows 5–28)

One table for both kinds (`kind: saving | expense`); 20 seed rows from §2 on `activate()`.

```json
{
  "name": "budget_pots",
  "columns": [
    { "name": "id", "type": "integer", "primary": true, "autoIncrement": true },
    { "name": "pot_key", "type": "text", "nullable": false, "description": "Stable key, e.g. emergency, child, solar, power-bill" },
    { "name": "label", "type": "text", "nullable": false },
    { "name": "kind", "type": "text", "nullable": false, "enumOptions": ["saving", "expense"] },
    { "name": "weekly_amount", "type": "real", "nullable": false, "default": 0, "min": 0 },
    { "name": "account_id", "type": "integer", "nullable": true, "index": true, "references": "budget_accounts.id", "description": "FK to budget_accounts; NULL when the line has no bank (most expense lines)" },
    { "name": "effective_from", "type": "date", "nullable": false, "index": true },
    { "name": "effective_to", "type": "date", "nullable": true, "description": "NULL = current plan row" },
    { "name": "notes", "type": "text", "nullable": true },
    { "name": "created_at", "type": "datetime", "nullable": false, "default": "now" },
    { "name": "updated_at", "type": "datetime", "nullable": false, "default": "now" }
  ]
}
```

### 4.2 `budget_flows` — Friday/Sunday pay-day moves (sheet col G/H)

Seed rows from §2 (Friday 4 + Sunday 9 moves).

```json
{
  "name": "budget_flows",
  "columns": [
    { "name": "id", "type": "integer", "primary": true, "autoIncrement": true },
    { "name": "flow_key", "type": "text", "nullable": false, "description": "Stable key, e.g. friday-mortgage, sunday-emergency" },
    { "name": "day", "type": "text", "nullable": false, "enumOptions": ["friday", "sunday"] },
    { "name": "label", "type": "text", "nullable": false },
    { "name": "weekly_amount", "type": "real", "nullable": false, "default": 0, "min": 0 },
    { "name": "account_id", "type": "integer", "nullable": true, "index": true, "references": "budget_accounts.id", "description": "FK to budget_accounts; destination account of the pay-day move" },
    { "name": "effective_from", "type": "date", "nullable": false, "index": true },
    { "name": "effective_to", "type": "date", "nullable": true, "description": "NULL = current plan row" },
    { "name": "notes", "type": "text", "nullable": true },
    { "name": "created_at", "type": "datetime", "nullable": false, "default": "now" },
    { "name": "updated_at", "type": "datetime", "nullable": false, "default": "now" }
  ]
}
```

### 4.4 `budget_income` — manual income fallback (sheet row 2 shape)

Only used when the Salary `pay` service is missing. One current row per `finance_year`.

```json
{
  "name": "budget_income",
  "columns": [
    { "name": "id", "type": "integer", "primary": true, "autoIncrement": true },
    { "name": "finance_year", "type": "text", "nullable": false, "index": true },
    { "name": "weekly_amount", "type": "real", "nullable": false, "default": 0, "min": 0 },
    { "name": "source", "type": "text", "nullable": false, "default": "manual", "enumOptions": ["manual"] },
    { "name": "notes", "type": "text", "nullable": true },
    { "name": "created_at", "type": "datetime", "nullable": false, "default": "now" },
    { "name": "updated_at", "type": "datetime", "nullable": false, "default": "now" }
  ]
}
```

Yearly = `weekly × 52` (sheet convention `=C*52`), derived on read, never stored.

## 5. Plan-history + re-allocation rules

- **Dated rows (add / edit / archive):** adds insert a new row (`effective_from = start`, `effective_to = NULL`); edits close the current row (`effective_to = new_start`) and insert the new row; deletes archive by closing the current row (`effective_to = end_date`) with no replacement — the item leaves the current plan and totals but stays in history and can be re-added later. One current row per key; nothing is ever erased.
- **Re-allocate action (first-class form):** user picks source pot, target pot, amount/week, start date. Service writes both sides together (source new weekly = old − amount, target new weekly = old + amount) with the same `effective_from`. If either write fails, neither commits. The trace shows the pair (notes link both rows, e.g. `realloc 2026-09-13 child→emergency $10/wk`).
- **Balance check (derived):** income weekly (Salary live or fallback) vs `SUM(current savings)` + `SUM(current expenses)`. Balanced → green; over → red with the over amount (sheet "not over" check, row 20).
- **Yearly FY totals (derived):** per-item `weekly × 52`; served to other extensions per item (see §7), never summed into one big number.
- **Accounts (stable master, no dates):** `budget_accounts` rows are never closed by date — rename any time; deactivate sets `is_active = false` (hidden from pot/flow dropdowns). Deactivation is blocked while any current pot/flow row references the account; history rows keep their `account_id` so the trace still resolves labels. Reads join `account_id` → label/bank for display.

## 6. Income (Salary link + fallback)

- Live: `finance.services.invoke('pay', 'getYearToDateSummary', ...)` / `getPayslipStats` → derive weekly run-rate for the income card (same calls Dashboard uses). Never copied into Budget tables.
- Fallback: when `pay` returns `null` (Salary missing/disabled), Overview shows the `budget_income` manual row for the FY with an "Edited by hand" tag; user edits it like any dated row.
- Mortgage $400 stays a typed pot number (approved as simple); no live loan link.

## 7. Sharing out (per-item FY totals)

Owner `finance.services.register('budget', ...)` in `activate()` (ADR-0005, consumer-driven):

```ts
{
  potYearly: async (p) => { key, finance_year } → { key, weekly_amount, yearly_amount } | null,
  flowYearly: async (p) => { key } → { key, weekly_amount, yearly_amount } | null,
  totals: async () => { income_weekly, savings_weekly, expenses_weekly, balance_weekly } | null,
}
```

Each item total = current-row `weekly × 52` (e.g. `potYearly({key:'power-bill'})` → yearly estimate). No bulk dump; consumers ask per item. Graceful `null` when missing.

## 8. Navigation (manifest + orchestrator)

- Activity Bar: `views: [{ id: budget, name: Budget, icon: assets/icon.svg }]`, `activationEvents: ["onStartup", "onView:budget"]`.
- Sidebar: 3 commands (`budget.show-overview` → `budget-overview`, `budget.show-flows` → `budget-flows`, `budget.show-accounts` → `budget-accounts`) + 3 nav items (group `Budget`); all `requestMount('budget', { view: childTag })` → `mount-update` retarget.
- In-panel: Lit `budget-orchestrator` (`view` state + `pushFinance` + `mount-update`, salary/mortgage shape); children `budget-overview`, `budget-flows`, `budget-accounts`, `budget-pot-form`, `budget-flow-form`, `budget-realloc-form`; form states orchestrator-internal. Pot/flow forms use an account dropdown sourced from active `budget_accounts` rows.
- `allowedUiEvents`: `pot-add-request`, `pot-create`, `pot-edit-request`, `pot-edit`, `pot-form-cancel`, `flow-add-request`, `flow-create`, `flow-edit-request`, `flow-edit`, `flow-form-cancel`, `realloc-request`, `realloc-save`, `realloc-cancel`, `account-create`, `account-edit`, `account-toggle`.

## 9. SDK build path (standalone extension)

```bash
node D:/finance_flow_ai/scripts/sdk/cli.mjs init budget D:/finance_flow_ext
cd D:/finance_flow_ext/budget && npm install && npm run dev
# implement: package.json (id budget, tables §4, views/commands/navigation §8)
# src/main.ts (activate + budget service §7 + seed §2) → dao → services → ui (+ orchestrator)
npm run build  # → build/extension/budget.js + package.json
# app: Extensions → Install Folder → pick build/extension → restart
```

Seed on `activate()`: 11 `budget_accounts` rows (§4.0 table) first, then 20 `budget_pots` + 13 `budget_flows` rows from §2 with `account_id` resolved by `account_key` lookup (`NULL` where §2 names no account); `effective_from` = first plan date; no `budget_income` seed (only on manual fallback use). Bump `version +0.0.1` + `git commit` before each reinstall (installer rejects downgrades).

## 10. Self-review

- No placeholders; all figures cite CashFlow cells read 2026-09-13.
- Consistent: 3 screens match approved shape (Accounts added 2026-09-15); dated-row history + re-allocate pair-write enforce the main rule; income live-with-fallback matches approved answer; per-item sharing matches the clarified need; mortgage number stays typed.
- Scope: single extension design, fits one SDK implementation plan.
- Unambiguous: table JSON is copy-paste manifest; current-row rule (`effective_to IS NULL`) single reading; `weekly × 52` the only yearly math; re-allocate atomicity explicit.
- Amendment 2026-09-15: §4.0 `budget_accounts` master + `account_id` FK replaces free-text bank/suffix (§4.1–§4.2, income renumbered §4.4); stable master with `is_active`, no dated rows; §3/§5/§8/§9 updated to match.
