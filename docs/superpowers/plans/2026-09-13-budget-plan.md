# Budget Extension SDK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the standalone `budget` extension (plan diary with re-allocation history) via the SDK, installable into the app.

**Architecture:** Single `budget` tab + Lit `budget-orchestrator` (view state + `pushFinance` + `mount-update` retarget, salary/mortgage shape); `dao` wrappers + `services` (dated-row close+insert, atomic re-allocate pair, balance check, per-item yearly); thin Lit children; `budget` domain service for per-item FY totals; income live from `pay` with `budget_income` fallback.

**Tech Stack:** TypeScript strict, Lit 3, Vite lib (`finance` external), `finance-logger` bundled, Vitest + happy-dom (where runnable standalone), SDK `cli.mjs` init/build.

## Global Constraints

- TypeScript `strict: true`; no implicit `any`.
- `finance` type-only (`import type { FinanceApi } from 'finance'`); never bundle `finance`; never import Electron/Node APIs in extension code.
- Host stays DOM-free: `registerUIComponents()` early-returns when `typeof HTMLElement === 'undefined'`; no top-level `./ui/index.js` import in `src/main.ts`.
- Extension id `budget`; tables `budget_*`; settings keys `budget.*` / `core.*` reads only.
- One `views[]` entry (`budget`); extra screens are orchestrator children, never extra views.
- Current-row rule: `effective_to IS NULL` = current; one current row per key; history never overwritten/deleted (no delete path by design).
- Yearly = `weekly × 52`, derived on read, never stored.
- `pay` service calls degrade to manual fallback; `budget` service returns `null` when missing — never throw across extensions.
- Version: bump patch `+0.0.1` (top-level + `financeExtension.version` in sync) + `git commit` before each reinstall.
- SDK scaffolding: `node D:/finance_flow_ai/scripts/sdk/cli.mjs init budget D:/finance_flow_ext`, work in `D:/finance_flow_ext/budget`.

---

### Task 1: Scaffold + manifest + seed data

**Files (in `D:/finance_flow_ext/budget`):**
- Modify: `package.json` (tables §4, views/commands/navigation per spec §8)
- Modify: `src/main.ts` (activate + seed + `budget` service skeleton)
- Test: manual `npm run build` artifact check

**Interfaces:**
- Consumes: spec §2 seed values, §4 table JSON, §8 manifest shape.
- Produces: installable `build/extension/{budget.js,package.json}` + seeded tables.

- [ ] **Step 1: Scaffold the project**

Run: `node D:/finance_flow_ai/scripts/sdk/cli.mjs init budget D:/finance_flow_ext`
Expected: `D:/finance_flow_ext/budget/` with `package.json`, `src/main.ts`, `src/ui/*`, `AGENTS.md`.

Run: `cd D:/finance_flow_ext/budget && npm install`
Expected: installs clean.

- [ ] **Step 2: Write the manifest**

In `D:/finance_flow_ext/budget/package.json`, set `financeExtension` to:

```json
{
  "id": "budget",
  "displayName": "Budget",
  "version": "0.1.0",
  "description": "Plan diary with re-allocation history (CashFlow sheet parity)",
  "themeColor": "#22C55E",
  "activationEvents": ["onStartup", "onView:budget"],
  "contributions": {
    "views": [{ "id": "budget", "name": "Budget", "icon": "assets/icon.svg" }],
    "commands": [
      { "id": "budget.show-overview", "title": "Budget: Overview" },
      { "id": "budget.show-flows", "title": "Budget: Flow Planner" },
      { "id": "budget.show-accounts", "title": "Budget: Accounts" }
    ],
    "navigation": [
      { "id": "budget-overview", "label": "Overview", "command": "budget.show-overview", "group": "Budget" },
      { "id": "budget-flows", "label": "Flow Planner", "command": "budget.show-flows", "group": "Budget" },
      { "id": "budget-accounts", "label": "Accounts", "command": "budget.show-accounts", "group": "Budget" }
    ],
    "configuration": [
      { "key": "budget.themeColor", "type": "string", "label": "Accent color (hex).", "default": "#22C55E", "pattern": "^#[0-9A-Fa-f]{6}$", "formatHint": "#RRGGBB", "placeholder": "#22C55E" }
    ],
    "allowedCommands": ["budget.show-overview", "budget.show-flows", "budget.show-accounts"],
    "allowedUiEvents": ["pot-add-request", "pot-create", "pot-edit-request", "pot-edit", "pot-form-cancel", "flow-add-request", "flow-create", "flow-edit-request", "flow-edit", "flow-form-cancel", "realloc-request", "realloc-save", "realloc-cancel", "account-create", "account-edit", "account-toggle"]
  },
  "tables": [<spec §4.0 budget_accounts JSON>, <spec §4.1 budget_pots JSON>, <spec §4.2 budget_flows JSON>, <spec §4.4 budget_income JSON>],
  "main": "src/main.ts"
}
```

(Paste the four table blocks verbatim from `docs/superpowers/specs/2026-09-13-budget-design.md` §4: §4.0 `budget_accounts`, §4.1 `budget_pots`, §4.2 `budget_flows`, §4.4 `budget_income`.)

- [ ] **Step 3: Write activate + seed + service skeleton**

In `src/main.ts` (follow `scripts/sdk/templates/src/main.ts.template` single-panel shape + spec §7–§9):

```ts
import type { FinanceApi } from 'finance';
import { ExtensionLogger } from 'finance-logger';
import './styles/ext-tokens.css';

const logger = new ExtensionLogger('budget');
export async function registerUIComponents(): Promise<void> {
  if (typeof window !== 'undefined') await import('./ui/index.js');
}

const openView = (finance: FinanceApi, childTag: string): (() => Promise<void>) => async () => {
  await finance.ui?.requestMount('budget', { view: childTag });
};

export async function activate(finance: FinanceApi, ctx: { viewId?: string } & Record<string, unknown> = {}): Promise<void> {
  finance.commands.registerCommand('budget.show-overview', 'Budget: Overview', () => openView(finance, 'budget-overview')());
  finance.commands.registerCommand('budget.show-flows', 'Budget: Flow Planner', () => openView(finance, 'budget-flows')());
  finance.commands.registerCommand('budget.show-accounts', 'Budget: Accounts', () => openView(finance, 'budget-accounts')());
  finance.services.register('budget', {
    potYearly: async (p: any) => (await import('./services/budget-service.js')).potYearly(finance as any, p?.key),
    flowYearly: async (p: any) => (await import('./services/budget-service.js')).flowYearly(finance as any, p?.key),
    totals: async () => (await import('./services/budget-service.js')).totals(finance as any),
  });
  await (await import('./services/seed.js')).seedBudget(finance as any);
  if (typeof window !== 'undefined') await import('./ui/index.js');
  if (ctx.viewId && typeof document !== 'undefined') {
    const app = document.getElementById('app');
    if (app) {
      const { BudgetOrchestrator } = await import('./ui/budget-orchestrator.js');
      const el = document.createElement('budget-orchestrator') as any;
      app.innerHTML = '';
      app.appendChild(el);
      const baseData = { viewId: ctx.viewId, ...(ctx as Record<string, unknown>) };
      queueMicrotask(() => void el.init(finance, baseData));
      setTimeout(() => { if (el.finance == null) void el.setFinance(finance); }, 50);
      app.addEventListener('mount-update', (e: Event) => {
        void el.init(finance, { ...baseData, ...((e as CustomEvent).detail ?? {}) });
      });
    }
  }
}

export function deactivate(): void {}
```

Seed file `src/services/seed.ts`: inserts the 11 `budget_accounts` rows (spec §4.0) first, then the 20 `budget_pots` + 13 `budget_flows` rows from spec §2 with `account_id` resolved by `account_key` lookup (`NULL` where §2 names no account) and `effective_from` = first plan date, guarded by `count({}) === 0` per table (never re-seed).

- [ ] **Step 4: Build the artifact**

Run: `cd D:/finance_flow_ext/budget && npm run build`
Expected: `build/extension/budget.js` + `package.json` (+ icon asset copy log).

- [ ] **Step 5: Commit**

```bash
cd D:/finance_flow_ext/budget && git add -A && git commit -m "feat(budget): scaffold, manifest, seed"
```

---

### Task 2: DAO + services (dated rows, re-allocate, totals)

**Files:**
- Create: `D:/finance_flow_ext/budget/src/dao/accounts.ts`, `src/dao/pots.ts`, `src/dao/flows.ts`, `src/dao/income.ts`
- Create: `D:/finance_flow_ext/budget/src/services/budget-service.ts`
- Test: `npm run dev` manual list check (or vitest if scaffolded)

**Interfaces:**
- Consumes: `finance.db.table('budget_accounts' | 'budget_pots' | 'budget_flows' | 'budget_income')`, `finance.services.invoke('pay', ...)`.
- Produces: `listActiveAccounts()`, `createAccount()`, `renameAccount()`, `setAccountActive()` (blocked while referenced by a current pot/flow row), `resolveAccountLabel()` join helper, `listCurrentPots()`, `savePot()` (close+insert), `listCurrentFlows()`, `saveFlow()`, `reallocate()`, `balanceCheck()`, `potYearly()`, `flowYearly()`, `totals()`, `incomeWeekly()` consumed by orchestrator + `budget` service.

- [ ] **Step 1: Write DAO wrappers**

`dao/pots.ts`:

```ts
export async function listCurrentPots(finance: any): Promise<any[]> {
  const rows = await finance.db.table('budget_pots').find({});
  return (rows as any[]).filter((r) => r.effective_to == null);
}
export async function savePot(finance: any, key: string, patch: Record<string, unknown>, start: string): Promise<void> {
  const rows = await finance.db.table('budget_pots').find({ pot_key: key });
  const cur = (rows as any[]).find((r) => r.effective_to == null);
  if (cur) await finance.db.table('budget_pots').update({ id: cur.id }, { effective_to: start });
  await finance.db.table('budget_pots').insert({ ...cur, ...patch, id: undefined, pot_key: key, effective_from: start, effective_to: null });
}
```

Mirror for `dao/flows.ts` (`flow_key`, `budget_flows`) and `dao/income.ts` (`finance_year`, `budget_income`).

`dao/accounts.ts` (mortgage `dao/accounts.ts` shape + `bank`): `listAccounts()` (sorted by `sort_order`), `listActiveAccounts()`, `createAccount({account_key, bank, label})` (reject duplicate key), `renameAccount(id, label)`, `setAccountActive(id, active)` — deactivation throws when any current `budget_pots`/`budget_flows` row (`effective_to IS NULL`) references the id; history rows keep the FK. `savePot`/`saveFlow` reject `account_id` values with no matching `budget_accounts` row.

- [ ] **Step 2: Write services**

`services/budget-service.ts`:

```ts
export async function reallocate(finance: any, sourceKey: string, targetKey: string, amountPerWeek: number, start: string): Promise<void> {
  const pots = await finance.db.table('budget_pots').find({});
  const src = (pots as any[]).find((r) => r.pot_key === sourceKey && r.effective_to == null);
  const tgt = (pots as any[]).find((r) => r.pot_key === targetKey && r.effective_to == null);
  if (!src || !tgt) throw new Error('pot not found');
  const note = `realloc ${start} ${sourceKey}→${targetKey} $${amountPerWeek}/wk`;
  // Close both first, then insert both (pair stays traceable via notes).
  await finance.db.table('budget_pots').update({ id: src.id }, { effective_to: start });
  await finance.db.table('budget_pots').update({ id: tgt.id }, { effective_to: start });
  const stamp = `${start}T00:00:00`;
  await finance.db.table('budget_pots').insert({ ...src, id: undefined, weekly_amount: Number(src.weekly_amount) - amountPerWeek, effective_from: start, effective_to: null, notes: note, created_at: stamp, updated_at: stamp });
  await finance.db.table('budget_pots').insert({ ...tgt, id: undefined, weekly_amount: Number(tgt.weekly_amount) + amountPerWeek, effective_from: start, effective_to: null, notes: note, created_at: stamp, updated_at: stamp });
}

export async function balanceCheck(finance: any): Promise<{ income_weekly: number; savings_weekly: number; expenses_weekly: number; balance_weekly: number }> {
  const income = await incomeWeekly(finance);
  const pots = await listCurrentPots(finance);
  const s = pots.filter((p: any) => p.kind === 'saving').reduce((n: number, p: any) => n + Number(p.weekly_amount || 0), 0);
  const e = pots.filter((p: any) => p.kind === 'expense').reduce((n: number, p: any) => n + Number(p.weekly_amount || 0), 0);
  return { income_weekly: income, savings_weekly: s, expenses_weekly: e, balance_weekly: Math.round((income - s - e) * 100) / 100 };
}

export async function potYearly(finance: any, key: string): Promise<{ key: string; weekly_amount: number; yearly_amount: number } | null> {
  const pots = await listCurrentPots(finance);
  const row = pots.find((p: any) => p.pot_key === key);
  if (!row) return null;
  const w = Number(row.weekly_amount || 0);
  return { key, weekly_amount: w, yearly_amount: Math.round(w * 52 * 100) / 100 };
}
```

Plus `flowYearly` (mirror on flows), `totals()` (balanceCheck shaped for consumers), `incomeWeekly()` (try `pay` invoke → weekly run-rate; catch/null → `budget_income` current row or 0). Never throw across the service boundary — catch and return `null`.

- [ ] **Step 3: Verify in dev**

Run: `npm run dev` → dropdown views load with mock; check console for no errors.
Expected: no crash (mock DB empty until seed path tested after install).

- [ ] **Step 4: Commit**

```bash
git add src/dao src/services && git commit -m "feat(budget): dao and plan-history services"
```

---

### Task 3: UI (orchestrator + 3 views + 3 forms)

**Files:**
- Create: `D:/finance_flow_ext/budget/src/ui/budget-orchestrator.ts`, `src/ui/budget-overview-view.ts`, `src/ui/budget-flows-view.ts`, `src/ui/budget-accounts-view.ts`, `src/ui/budget-pot-form.ts`, `src/ui/budget-flow-form.ts`, `src/ui/budget-realloc-form.ts`
- Modify: `D:/finance_flow_ext/budget/src/ui/index.ts`
- Test: `npm run dev` visual check

**Interfaces:**
- Consumes: Task 2 services; `finance` injected via `pushFinance`.
- Produces: `budget-orchestrator` element consumed by `src/main.ts` panel branch.

- [ ] **Step 1: Write the orchestrator**

Mirror `extensions/salary-history/src/ui/salary-orchestrator.ts`: `BudgetOrchestrator extends Base`, `view: 'budget-overview' | 'budget-flows' | 'budget-accounts' | 'budget-pot-form' | 'budget-flow-form' | 'budget-realloc-form'`, `init` mapping `mount.view ?? mount.viewId` (default `budget-overview`), `pushFinance` injecting `finance` + calling child `load()`, `connectedCallback` listeners for the 16 `allowedUiEvents`, handlers calling Task 2 services then `navigate(returnTo)` + refresh. Re-allocate handler calls `reallocate()` (pair-write, §5 atomicity). Account handlers call `createAccount` / `renameAccount` / `setAccountActive` from `dao/accounts.ts`.

- [ ] **Step 2: Write the views**

`budget-overview-view.ts`: income card (live `pay` weekly or fallback + tag), savings table (label, account, weekly, yearly `×52`, dates, Edit), expenses table (same), balance card (in/out/balance, green/red), plan-trace section (closed rows per key). Account column resolves `account_id` → label/bank via Task 2 join helper. Thin: `load()` reads via services; dispatches `pot-*-request` / `realloc-request`.
`budget-flows-view.ts`: Friday table + Sunday table (label, amount, account, dates, Edit). Same layout classes (`.topbar`, `.view-container`, `.table-wrap`, `.section`).
`budget-accounts-view.ts` (mortgage accounts-view shape): table (bank, key, label, active toggle) + Add / Rename inline + Deactivate button; dispatches `account-create` / `account-edit` / `account-toggle`.

- [ ] **Step 3: Write the forms**

Pot/flow forms: fields per table columns with an account `<select>` sourced from active `budget_accounts` rows (empty option = no account); submit dispatches `pot-create`/`pot-edit`/`flow-create`/`flow-edit` with `{key, patch, start}` where `patch.account_id` is a number or `null`. Re-alloc form: source select, target select, amount/week, start date → `realloc-save`.

- [ ] **Step 4: Register + verify**

`src/ui/index.ts`: import + `customElements.define` for all 7 tags. `npm run dev` → switch views via dropdown, forms dispatch events (check console).

- [ ] **Step 5: Commit**

```bash
git add src/ui && git commit -m "feat(budget): orchestrator, views, forms"
```

---

### Task 4: Build + Install + verify + docs

**Files:**
- Modify: `D:/finance_flow_ai/CHANGELOG.md`, `D:/finance_flow_ai/docs/file-reference.md` (app repo)
- Test: `npm run build` + Install Folder + restart + panel checks

- [ ] **Step 1: Build + install**

Run: `cd D:/finance_flow_ext/budget && npm run build`
Expected: `build/extension/budget.js` + `package.json`.

App: Extensions → Install Folder → pick `build/extension` → restart.

- [ ] **Step 2: Verify in app**

Checklist: Budget tab appears; Overview shows income + 10 pots + 10 lines + balance green; edit a pot → new dated row, old closed; re-allocate Child→Emergency $10 → both rows change with linked notes; Flow Planner Friday/Sunday editable; Accounts view lists 11 seeded accounts + Add/Rename/Deactivate works (deactivate blocked while referenced); pot/flow forms use the account dropdown; disable Salary → income falls back to manual; `SELECT * FROM budget_pots` shows history rows.

- [ ] **Step 3: App-repo docs**

In `D:/finance_flow_ai/CHANGELOG.md` + `docs/file-reference.md`: note the new standalone extension + spec path (no version bump here — budget has its own `0.1.x`).

- [ ] **Step 4: Commit budget repo**

```bash
cd D:/finance_flow_ext/budget && git add -A && git commit -m "feat(budget): install-verified plan diary"
```

---

## Self-Review

- **Spec coverage:** main rule (§1) → Tasks 2–3 (dated rows + re-allocate pair); sheet map (§2) → Task 1 seeds; 3 screens (§3) → Task 3; tables (§4.0–§4.4 incl. accounts master + FK) → Tasks 1–2; history rules (§5, incl. accounts stable-master rule) → Task 2; income (§6) + sharing (§7) → Task 2 services; navigation (§8, 3 commands + account events) → Tasks 1+3; SDK path (§9) → Tasks 1+4. All covered.
- **Amendment 2026-09-15:** `budget_accounts` master + `account_id` FK (spec §4.0, pots/flows §4.1–§4.2, income renumbered §4.4); Task 1 manifest/seed, Task 2 `dao/accounts.ts` + FK validation, Task 3 `budget-accounts-view` + dropdowns, Task 4 checklist updated.
- **Placeholder scan:** no TBD/TODO; every step has exact paths, code, commands, expected output.
- **Type consistency:** `pot_key`/`flow_key`/`finance_year` keys, `weekly_amount` numbers, `MortgageCard`-style per-item returns consistent across tasks.
