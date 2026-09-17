# AGENTS.md — Budget (budget)

> **For agentic workers:** This file is the agent entrypoint for this standalone Finance Flow AI extension. Read it before editing. `README.md` is user-facing; this file is agent-facing.

## 1. What this project is
- Standalone extension `budget` (`package.json` `financeExtension.id`). Runs in two processes:
  - **Host (Node `utilityProcess`)** — `src/main.ts` `activate(finance, ctx)` registers commands/services, owns DB access.
  - **Panel (WebContentsView)** — `src/ui/sample-view.ts` (`budget-view` Lit element) renders inside `finance-shell://panel/budget/bootstrap.js` (`src/main/resources/panel-bootstrap.ts` in main app).
- `src/finance.d.ts`, `vite-env.d.ts`, `src/vendor/logger.ts`, `src/styles/tokens.css`/`ext-layout.css`/`shared-styles.ts` are **vendored snapshots** from `D:\finance_flow_ai` at `init` time. Re-synced by `node D:/finance_flow_ai/scripts/sdk/cli.mjs refresh .` (overwrites only `src/finance.d.ts`/`vendor/logger.ts`/`styles/*`, never your code). `assets/icon.svg` is author-owned after `init`; `refresh` never overwrites it.

## 2. How to work
```bash
npm run dev    # Vite http://localhost:5173 with src/mock/finance-mock.ts (in-memory FinanceApi, HMR)
npm run build  # node D:/finance_flow_ai/scripts/sdk/cli.mjs build . → build/extension/budget.js + package.json
# then in app: Extensions → Install Folder/Zip → pick build/extension → restart (all lifecycle actions auto-restart)
node D:/finance_flow_ai/scripts/sdk/cli.mjs refresh .  # after app updates finance.d.ts (types/styles/logger only; your icon and package.json are untouched)
```
- `dev` mock DB is ephemeral; real SQLite (`better-sqlite3`, `TableSchemaRegistry`) only after Install+restart.
- Install artifact = folder with `package.json` (`financeExtension`) + `budget.js` (+ `ui-*.js` if code-split). Validated by `ExtensionInstaller` (`src/main/services/extension-installer.ts:62`).

## 3. Key files & constraints (self-contained — no need to open other extensions)
- `package.json` `financeExtension` is source of truth: `id` lowercase `a-z0-9-`, `version` semver, `activationEvents`, `contributions.views/commands/navigation`, `tables`, `allowedCommands`/`allowedUiEvents`, `main: "src/main.ts"`. Views accept a legacy one/two-character `icon` or a relative `assets/*.svg`/`assets/*.png` path (`assets/icon.svg` is scaffolded by `init` and copied by `build` into `build/extension`). Scaffold starts with **no** `tables` (in-memory only). To add persistence, edit `package.json` and add:
  ```json
  "financeExtension": {
    "id": "budget",
    "tables": [{ "name": "budget_records", "columns": [
      { "name": "title", "type": "text", "nullable": false }
    ]}],
    "main": "src/main.ts"
  }
  ```
  Name tables as `budget_anything` (`budget` = `budget` with `-`→`_`, e.g. `my-ext`→`my_ext_records`, `budget`→`budget_records`). Example `budget_items` from `todo-list` test is just one naming — use your domain (e.g. `invoice`, `order`, `event`). `todo-list` is a minimal test extension, not a pattern for complex domains. Column types: `integer`/`real`/`text`/`date`/`datetime`/`boolean` with `nullable`/`default`/`min`/`max`/`enumOptions` (see `src/finance.d.ts` `ColumnManifest`). `id`/`created_at`/`updated_at` are auto-added by `table-ddl.ts:18`, don't declare them. After editing `tables`, bump `version` `+0.0.1` (both top-level and `financeExtension.version`), `git commit`, then `npm run build` → Install Folder.
- `tables` name **must** start with `budget_` — enforced at `manifest-schema.ts:177` `^[a-z][a-z0-9_]*$` and at install (`extension-installer.ts:80`). Hyphens in `budget` → underscores in table name.
- `finance` is type-only: `import type { FinanceApi } from 'finance'` (Vite `external: ['finance']`, never bundled). `finance-logger` shim is bundled (`src/vendor/logger.ts`).

## 4. Finance API (use this, not raw SQL)
```ts
finance.db.table(name).find(query?) / findOne / count / insert(payload) / update(where,payload) / delete(query) // async, throws typed errors
finance.settings.get(key) / set(key,value) // key must start with "budget." (assertExtensionKey)
finance.commands.registerCommand(id,title,handler,keybinding?) / execute(id,...args)
finance.ui.requestMount(viewId,mountData?) / setDirty / autoSaveDraft / onBeforeUnmount
finance.services.register(name,impl) / unregister / invoke(name,method,params?) // cross-extension (see §7)
finance.events.on/off/emit
```

## 5. UI patterns — standalone but matches app
- Lit: `const Base = typeof HTMLElement !== 'undefined' ? LitElement : class {}` guard (`src/ui/budget-view.ts:3`), `static styles = typeof HTMLElement !== 'undefined' ? [sharedStyles] : []`, `if (typeof customElements !== 'undefined') customElements.define(...)` (`src/ui/index.ts`).
- Styles: `sharedStyles` from `src/styles/shared-styles.ts` (`unsafeCSS` of `ext-layout.css`) + `ext-tokens.css` (`--ff-*`, `--activity-bar-*`, light-theme overrides). All tokens/layout are **vendored inside this project** (`src/styles/*`), no need to open main repo.
- Layout (self-contained): `src/ui/budget-view.ts` (generated from `sample-view.ts.template`) already uses the canonical pattern from the app:
  ```html
  <div class="topbar"><span class="crumb-current">Budget</span><div class="spacer"></div><button class="filter-btn">Action</button></div>
  <div class="view-container"><div class="view-container-inner"><h1>Budget</h1> ... </div></div>
  ```
  Use `.topbar`/`.view-container`/`.view-container-inner`/`.table-wrap`/`.section` from `src/styles/ext-layout.css`. Don't hardcode colors — use `var(--ff-*)`. The scaffold's topbar is the reference; duplicate it for new views.
- View gets `finance` via `activate` → `createElement` → `viewEl.finance = finance` / `setFinance(f)` after `await import('./ui/index.js')` (see §6). Change `<h1>Budget</h1>` and crumb to your name; rename `SampleView` class but keep `budget-view` tag (defined in `src/ui/index.ts`).
- **Growth:** when `src/ui/budget-view.ts` (~ from `sample-view.ts`) > ~150 lines or you have >1 table/view or cross-extension `services.invoke` consumers, split like `extensions/salary-history`:
  ```
  src/
    main.ts              # activate → registers commands + services, seeds data
    ui/budget-orchestrator.ts  # Lit host, owns view state + mountData, injects finance into child views
    dao/<table>.ts       # typed wrapper: table('budget_items').find/insert/update/delete + validation
    services/<domain>.ts # business logic: validate, aggregate, sum/count (wraps dao)
    ui/<view>.ts         # Lit element, thin: calls service.list()/create(), dispatches CustomEvent to orchestrator
  ```
  Start with `src/ui/budget-view.ts` in-view DB; extract to `dao`/`services` when you add validation/derived fields; add an orchestrator when you need 2+ child views under ONE tab (see §5b) or `finance.ui.requestMount` navigation. `extensions/salary-history/src/ui/salary-orchestrator.ts` + `dao/pay-slips.ts` + `services/pay-service.ts` are the reference — copy that layout only when needed.

## 5b. Adding a second child view under the SAME tab (e.g. `budget-detail`)

Single-tab rule: `package.json` keeps ONE `views[]` entry (`budget` → one Activity Bar button, one tab). Extra screens are child views inside the tab, driven by a Lit orchestrator — never extra `views[]` entries (extra entries open extra tabs).

### Files to touch

| File | Change |
|------|--------|
| `package.json` `financeExtension.contributions` | Add to `commands[]`, `navigation[]`, `allowedCommands[]`, `allowedUiEvents[]` — do NOT add to `views[]` |
| `src/ui/budget-detail-view.ts` | New Lit element (copy `budget-view.ts` as starter) |
| `src/ui/budget-orchestrator.ts` | New Lit host: `view` state + `init(f, mount)` mapping `mount.view` → child tag + `pushFinance()` injecting `finance` into `#child` + `connectedCallback` event listeners; `render()` switches on `view` (see `extensions/salary-history/src/ui/salary-orchestrator.ts`) |
| `src/ui/index.ts` | Import detail view + orchestrator; `customElements.define` for both |
| `src/main.ts` | Commands call `finance.ui?.requestMount('budget', { view: '<child-tag>' })` (single panel identity; child rides in `mountData.view`); panel branch creates `budget-orchestrator` and listens for `mount-update` → `el.init(finance, {...base, ...detail})` for in-place retarget |
| `index.html` | Add entry to the `VIEWS` array (dropdown auto-populates) |

### Dev mode — switch views with the dropdown

`index.html` includes a `<select>` dropdown (top-right) listing every view in the `VIEWS` array. When you add a new view:

1. Create `src/ui/budget-detail-view.ts` and register it in `src/ui/index.ts`
2. Add to the `VIEWS` array in `index.html`:
   ```js
   const VIEWS = [
     { tag: 'budget-view',         label: 'Budget' },
     { tag: 'budget-detail-view',  label: 'Detail View' },  // <-- add this
   ];
   ```
3. `npm run dev` — use the dropdown to switch views, no restart needed

No revert needed before `npm run build` — `index.html` is dev-only and ignored by the Vite lib build.

## 6. Lifecycle & gotchas
- `activate(finance, ctx:{viewId?})` is called in **both** Host Node (no `document`/`window`) and panel browser (`panel-bootstrap.ts:294` `await bundle.activate(finance,{viewId,...mountData})` after `await bundle.registerUIComponents()`). Guard: `if (typeof window !== 'undefined') await import('./ui/index.js')`; `if (ctx.viewId && typeof document !== 'undefined') { createElement ... queueMicrotask(()=>setFinance) }`. Host crash at `todo-list.js:105` `HTMLElement is not defined` was top-level `import './ui/index.js'` + Lit in Node.
- `registerUIComponents(): Promise<void>` is awaited in panel before `activate`; keep it as `if (typeof window !== 'undefined') await import('./ui/index.js')`.
- `deactivate()` cleanup; `onBeforeUnmount` for dirty check.

## 7. Data ownership & sharing (must read)
- **Ownership:** you own only `budget_*` tables (if you added `tables` in §3). `TableSchemaRegistry.registerExtensionTables` + `DAOService` enforce prefix; `finance.db.table('other_ext_*')` throws `TableAccessDenied` (`src/shared/json-rpc.ts`). `accounts` shared table is read-only (`SharedTableReadOnly`).
- **No direct cross-table access.** Don't `SELECT` another extension's tables.
- **Sharing via Domain Services (upper layer, ADR-0005):** scaffold registers `finance.services.register('budget', { hello: async (p)=> \`Hello from budget: \${JSON.stringify(p)}\` })` (`src/main.ts:14`, `src/main/services/domain-service-registry.ts`, `src/extension-host/api/services.ts`); consumer `await finance.services.invoke('budget','hello', { foo: 1 })`. When you add `tables` (e.g. `budget_records`), add DB methods: `{ count: async ()=> finance.db.table('budget_records').count({}), findByTitle: async (p)=> finance.db.table('budget_records').find(p) }`. `todo-list` `count`/`sum` is just a test — design services from consumer need, not from `todo-list`. Example: `salary-history` `public-pay-adapter.ts` `pay` service. Add `services` only when needed.

## 8. Logging, styling, settings, allowlists
- **Log:** `import { ExtensionLogger } from 'finance-logger'; const log = new ExtensionLogger('budget'); log.info/warn/error` (`src/vendor/logger.ts` posts `host.log` → `src/main/services/logger.ts` JSONL + DevTools). Don't use raw `console.log` in shipped code.
- **Settings:** `contributes.configuration` entries `key:"budget.myKey"` with `type/default/placeholder/pattern` (`src/extension-host/manifest-schema.ts`). Block-write validation shows inline `Format: ...` in `settings-screen.ts`.
- **Allowlists:** list every command in `allowedCommands` and every `CustomEvent` name in `allowedUiEvents`; otherwise `command-allowlist.ts`/`ui-event-allowlist.ts` drops them.

## 9. Build & error handling
- `vite` lib `rollupOptions.external: ['finance']`; never `require("finance")`; bundle size <200KB (`sdk-build.test.ts`).
- Errors: `TableNotFound`/`TableAccessDenied`/`ValidationFailed`/`SharedTableReadOnly` (`src/shared/json-rpc-methods.ts`). Always `try/catch` `insert/update` and surface in UI (as `budget-view.ts:10` red `Error: ...`).
- Versioning: `package.json` `version` semver (`0.1.0` on `init`). After **every** change that you `build`+Install, bump **patch** `+0.0.1` (`0.1.2`→`0.1.3`, `0.2.0`→`0.2.1` — never reset) and `git commit` before reinstall. `ExtensionInstaller` (`extension-installer.ts:87` `compareVersions` + `src/shared/semver.ts`) rejects downgrades (`0.1.3` installed → `0.1.2` `build` will be rejected on Install with `a newer version is already installed`). Keep `financeExtension.version` and top-level `version` in sync.

## 10. Checklist before `build`
1) `npm run dev` → Add works with mock 2) no `HTMLElement` at top-level 3) `tables` prefix correct 4) `finance` only `import type` 5) test `build` → Install Folder → restart → panel Add + DB `SELECT * FROM budget_items` → `Delete Data` → `DROP` verified.6) Prettier-format check — always run before `git commit` (repo standard is `prettier --single-quote`):
```bash
npx prettier --check --single-quote "src/main.ts" "src/dao/**/*.ts" "src/services/**/*.ts" "src/ui/**/*.ts" "src/utils/**/*.ts" "src/mock/**/*.ts" "src/shared/**/*.ts" "scripts/**/*.mjs" "vite.config.ts" "index.html"
# if anything fails the check, fix with the same file list and --write instead of --check
```
Never format vendored snapshots (`src/finance.d.ts`, `src/vite-env.d.ts`, `src/vendor/**`, `src/styles/**`) — they are overwritten by `refresh` and must stay byte-identical to upstream.

## 11. Out of scope — what to do
If this file doesn't cover your case: check `D:\finance_flow_ai\docs/extension-api.md` + `D:\finance_flow_ai\src/types/finance.d.ts` (canonical API/types), and `extensions/salary-history` / `extensions/dashboard` as working references. For product decisions (new `tables`, cross-extension `services.invoke`, breaking changes after `refresh`), ask the owner — don't guess the table/service contract.
