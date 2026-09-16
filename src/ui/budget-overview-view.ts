import { LitElement, css, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import { accountById, resolveAccountLabel } from '../dao/accounts.js';
import { listPotHistory } from '../dao/pots.js';
import { balanceCheck } from '../services/budget-service.js';
import { listCurrentPots } from '../dao/pots.js';
import { listCurrentFlows } from '../dao/flows.js';
import { CANONICAL_SECTION_ORDER, normalizeSectionOrder, type OverviewSectionId } from './overview-sections.js';

const Base = typeof HTMLElement !== 'undefined' ? LitElement : (class {} as unknown as typeof LitElement);

/**
 * Budget Overview (spec §3.1): income & balance cards, savings + expense
 * tables, per-row history + plan-trace section.
 * Thin: loads via services, dispatches pot and flow requests.
 */
export class BudgetOverviewView extends Base {
  static override styles = typeof HTMLElement !== 'undefined' ? [sharedStyles, css`
    .hist-table{width:100%;border-collapse:collapse;table-layout:fixed}
    .hist-table thead th{font-size:var(--ff-font-sm);font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--ff-text-muted,#858585);text-align:left;padding:8px 10px;border-bottom:1px solid var(--ff-border,#3e3e3e);white-space:nowrap}
    .hist-table thead th.num{text-align:right}
    .hist-table tbody td{padding:9px 10px;border-bottom:1px solid var(--ff-border,#3e3e3e);font-size:var(--ff-font-base);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .hist-table tbody td.num{text-align:right;font-variant-numeric:tabular-nums}
    .hist-table tbody tr:nth-child(even){background:var(--ff-bg-subpanel,#2a2a2a)}
    .hist-table tbody tr:hover{background:var(--ff-bg-input-hover,#4a4a4a)}
    .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:4px}
    .card{background:var(--ff-bg-subpanel,#2a2a2a);border:1px solid var(--ff-border,#3e3e3e);border-radius:8px;padding:12px 14px}
    .card .k{font-size:var(--ff-font-sm);color:var(--ff-text-muted,#858585);text-transform:uppercase;letter-spacing:.5px}
    .card .v{font-size:20px;font-weight:700;font-variant-numeric:tabular-nums}
    .card .s{font-size:var(--ff-font-sm);opacity:.7}
    .income-edit{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
    .income-edit input{width:110px;background:var(--ff-bg-input,#3c3c3c);border:1px solid var(--ff-border,#3e3e3e);border-radius:4px;color:var(--ff-text,#d4d4d4);font-size:var(--ff-font-sm);padding:4px 8px}
    .card{position:relative}
    .card-menu-btn{position:absolute;top:8px;right:8px;background:transparent;border:0;color:var(--ff-text-muted,#858585);cursor:pointer;font-size:16px;line-height:1;padding:6px 10px;border-radius:4px}
    .card-menu-btn:hover,.card-menu-btn.open{color:var(--ff-text,#d4d4d4);background:var(--ff-bg-input,#3c3c3c)}
    .card-menu{position:absolute;top:36px;right:8px;min-width:190px;background:var(--ff-bg-panel,#252526);border:1px solid var(--ff-border,#3e3e3e);border-radius:8px;padding:4px;z-index:50;box-shadow:0 8px 24px rgba(0,0,0,.45)}
    .card-menu button{display:block;width:100%;text-align:left;background:transparent;border:0;color:var(--ff-text,#d4d4d4);font-size:var(--ff-font-base);padding:8px 10px;border-radius:6px;cursor:pointer;white-space:nowrap}
    .card-menu button:hover{background:var(--ff-bg-input-hover,#4a4a4a)}
    .card-menu .sub{display:block;font-size:var(--ff-font-sm);color:var(--ff-text-muted,#858585)}
    .ok{color:var(--ff-teal,#4ec9b0)}
    .bad{color:var(--ff-danger,#f48771)}
    .warn{color:var(--ff-warning-text,#ffd866)}
    .tag{display:inline-block;font-size:11px;font-weight:700;padding:1px 9px;border-radius:10px;border:1px solid var(--ff-border,#3e3e3e);margin-left:8px}
    .trace{font-size:var(--ff-font-sm);opacity:.75}
    .section-header .spacer{flex:1}
    .group-head{display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;margin:0 0 8px;background:var(--ff-bg-subpanel,#2a2a2a);border:1px solid var(--ff-border,#3e3e3e);border-radius:8px;color:var(--ff-text,#d4d4d4);font-size:var(--ff-font-base);cursor:pointer;text-align:left}
    .group-head:hover{background:var(--ff-bg-input-hover,#4a4a4a)}
    .group-head .chev{display:inline-flex;flex:0 0 auto;color:var(--ff-text-muted,#858585);transition:transform .12s ease}
    .group-head .chev svg{display:block}
    .group-head.open .chev{transform:rotate(90deg)}
    .group-head .t{font-weight:700}
    .group-head .sum{margin-left:auto;font-variant-numeric:tabular-nums;color:var(--ff-text-muted,#858585);font-size:var(--ff-font-sm)}
    .group-head .sum b{color:var(--ff-text,#d4d4d4)}
    .group-head .sum b.warn{color:var(--ff-warning-text,#ffd866)}
    .day-pick{display:flex;align-items:center;gap:8px;margin:0 0 8px}
    .chip{border:1px solid var(--ff-border,#3e3e3e);background:transparent;color:var(--ff-text-muted,#858585);border-radius:12px;padding:3px 12px;font-size:var(--ff-font-sm);cursor:pointer}
    .chip.on{background:var(--ff-bg-input,#3c3c3c);color:var(--ff-text,#d4d4d4);border-color:var(--ff-accent,#007acc)}
    .add-wrap{position:relative}
    .add-menu{position:absolute;right:0;top:calc(100% + 4px);min-width:170px;background:var(--ff-bg-panel,#252526);border:1px solid var(--ff-border,#3e3e3e);border-radius:8px;padding:4px;z-index:50;box-shadow:0 8px 24px rgba(0,0,0,.45)}
    .add-menu button{display:block;width:100%;text-align:left;background:transparent;border:0;color:var(--ff-text,#d4d4d4);font-size:var(--ff-font-base);padding:8px 10px;border-radius:6px;cursor:pointer;white-space:nowrap}
    .add-menu button:hover{background:var(--ff-bg-input-hover,#4a4a4a)}
    .add-menu .sub{display:block;font-size:var(--ff-font-sm);color:var(--ff-text-muted,#858585)}
    .two-col{display:grid;grid-template-columns:1fr 1fr;gap:0 16px;align-items:start}
    @media (max-width:900px){.two-col{grid-template-columns:1fr}}
    .order-stack{display:flex;flex-direction:column}
    .sel-bar{display:flex;align-items:center;gap:8px;margin:0 0 8px;font-size:var(--ff-font-sm);color:var(--ff-text-muted,#858585)}
    .sel-bar .count{font-weight:700;color:var(--ff-text,#d4d4d4)}
    .sel-bar .btn-link:disabled{opacity:.4;cursor:not-allowed;text-decoration:none}
    .sel-bar .btn-link:disabled:hover{text-decoration:none}
    .sel-bar .ask{font-weight:700;color:var(--ff-danger,#f48771)}
    .sel-bar .btn-link.danger{color:var(--ff-danger,#f48771)}
    .hist-table input[type=checkbox]{accent-color:var(--ff-accent,#007acc);width:14px;height:14px;cursor:pointer}
    .hist-table tr.selected td{background:var(--ff-bg-input,#3c3c3c)}
    .hist-table tr.mismatch td{color:var(--ff-warning-text,#ffd866)}
  `] as any : [];

  finance: any = null;
  pots: any[] = [];
  flows: any[] = [];
  accountLabels = new Map<number, any>();
  incomeManual = false;
  balance: any = null;
  trace: any[] = [];
  error = '';
  showSavings = true;
  showExpenses = true;
  showMoves = true;
  moveDay: 'all' | 'friday' | 'sunday' = 'all';
  addOpen = false;
  /** Host-computed live income from mountData (openCommand path). */
  liveIncome: number | null = null;
  incomeEditing = false;
  incomeMenuOpen = false;
  incomeYear = '';
  sectionOrder: OverviewSectionId[] = [...CANONICAL_SECTION_ORDER];
  selSavings = new Set<string>();
  selExpenses = new Set<string>();
  selMoves = new Set<string>();
  showTrace = false;
  /** Which selection is mid-confirm: null | 'savings' | 'expenses' | 'moves'. */
  private confirmKey: string | null = null;
  /** Bumped on every selection change so checkbox bindings re-apply. */
  private selRev = 0;

  async setFinance(f: any): Promise<void> {
    this.finance = f;
    await this.load();
  }

  async load(): Promise<void> {
    if (!this.finance) return;
    try {
      this.error = '';
      this.confirmKey = null;      this.pots = await listCurrentPots(this.finance);
      this.flows = await listCurrentFlows(this.finance);
      this.accountLabels = await accountById(this.finance);
      // Drop selections for rows that no longer exist (e.g. after archive).
      this.pruneSel(this.selSavings, this.pots.filter((p: any) => p.kind === 'saving').map((p: any) => p.pot_key));
      this.pruneSel(this.selExpenses, this.pots.filter((p: any) => p.kind === 'expense').map((p: any) => p.pot_key));
      this.pruneSel(this.selMoves, this.flows.map((f: any) => f.flow_key));
      // income source: Host-computed liveIncome (openCommand mount) wins;
      // else probe `pay` (works in Host context, no-op in panel sandbox),
      // else manual fallback (spec §6)
      this.incomeManual = true;
      const hostLive = Number(this.liveIncome ?? NaN);
      if (Number.isFinite(hostLive) && hostLive > 0) {
        this.incomeManual = false;
      } else {
        try {
          const stats = (await this.finance.services?.invoke?.('pay', 'getPayslipStats')) as any;
          const avg = Number(stats?.avgNet ?? NaN);
          if (Number.isFinite(avg) && avg > 0) this.incomeManual = false;
        } catch { /* manual fallback */ }
      }
      this.balance = await balanceCheck(this.finance, undefined, Number.isFinite(hostLive) && hostLive > 0 ? hostLive : undefined);
      // plan trace: closed rows across all keys, newest first (cap 30)
      const all = (await this.finance.db.table('budget_pots').find({})) as any[];
      this.trace = all
        .filter((r) => r.effective_to != null)
        .sort((a, b) => (a.effective_to < b.effective_to ? 1 : -1))
        .slice(0, 30);
    } catch (e: any) {
      this.error = String(e?.message || e);
    }
    (this as any).requestUpdate?.();
  }

  private sectionIndex(id: OverviewSectionId): number {
    const order = normalizeSectionOrder(this.sectionOrder);
    const i = order.indexOf(id);
    return i < 0 ? 99 : i;
  }

  private emit(name: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  /** Default FY from today's date assuming a July start (matches sheet convention). */
  private static defaultFinanceYear(todayIso?: string): string {
    const d = new Date((todayIso ?? new Date().toISOString().slice(0, 10)) + 'T00:00:00Z');
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    return m >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
  }

  private startIncomeEdit(): void {
    this.incomeYear = BudgetOverviewView.defaultFinanceYear();
    this.incomeEditing = true;
    this.incomeMenuOpen = false;
    (this as any).requestUpdate?.();
  }

  private saveManualIncome(): void {
    const root = (this as any).renderRoot as ShadowRoot | undefined;
    const amount = (root?.querySelector('#income-amount') as HTMLInputElement)?.value ?? '';
    const year = ((root?.querySelector('#income-year') as HTMLInputElement)?.value ?? '').trim()
      || BudgetOverviewView.defaultFinanceYear();
    this.incomeEditing = false;
    this.incomeMenuOpen = false;
    this.emit('income-save', { financeYear: year, weeklyAmount: Number(amount) });
  }

  private static aud(n: unknown): string {
    const v = Number(n);
    return Number.isFinite(v) ? '$' + v.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
  }

  private rows(kind: string): any[] {
    return this.pots.filter((p: any) => p.kind === kind);
  }

  private flowsForDay(day: 'friday' | 'sunday'): any[] {
    return this.flows.filter((f: any) => f.day === day);
  }

  private visibleMoves(): any[] {
    if (this.moveDay === 'all') return this.flows;
    return this.flows.filter((f: any) => f.day === this.moveDay);
  }

  private static sumWeekly(rows: any[]): number {
    return Math.round(rows.reduce((n: number, p: any) => n + Number(p.weekly_amount || 0), 0) * 100) / 100;
  }

  private bumpSel(): void {
    this.selRev++;
    (this as any).requestUpdate?.();
  }

  private toggleSel(set: Set<string>, key: string): void {
    if (set.has(key)) set.delete(key);
    else set.add(key);
    this.bumpSel();
  }

  private toggleAll(set: Set<string>, rows: any[], keyOf: (r: any) => string): void {
    if (rows.every((r) => set.has(keyOf(r)))) set.clear();
    else rows.forEach((r) => set.add(keyOf(r)));
    this.bumpSel();
  }

  private clearSel(set: Set<string>): void {
    set.clear();
    this.bumpSel();
  }

  private pruneSel(set: Set<string>, validKeys: string[]): void {
    const valid = new Set(validKeys);
    let changed = false;
    for (const k of [...set]) {
      if (!valid.has(k)) { set.delete(k); changed = true; }
    }
    if (changed) this.selRev++;
  }

  /** Selection action bar: Edit (exactly 1) + two-step Archive confirm. */
  private selBarHtml(sel: Set<string>, editEvent: string, archiveEvent: string, bulkEvent: string, ckey: string): unknown {
    if (sel.size === 0) return '';
    const keys = [...sel];
    const label = sel.size === 1 ? 'Archive' : `Archive (${sel.size})`;
    const confirming = this.confirmKey === ckey;
    return html`<div class="sel-bar"><span class="count">${sel.size} selected</span>
      <button class="btn-link" ?disabled=${sel.size !== 1} title=${sel.size !== 1 ? 'Select one row to edit' : ''} @click=${() => { if (sel.size === 1) this.emit(editEvent, { key: keys[0] }); }}>Edit</button>
      ${confirming
        ? html`<span class="ask">Archive ${sel.size === 1 ? 'this row' : `${sel.size} rows`}?</span>
          <button class="btn-link danger" @click=${() => { this.confirmKey = null; this.emit(sel.size === 1 ? archiveEvent : bulkEvent, sel.size === 1 ? { key: keys[0] } : { keys }); }}>Yes, archive</button>
          <button class="btn-link" @click=${() => { this.confirmKey = null; (this as any).requestUpdate?.(); }}>Keep</button>`
        : html`<button class="btn-link" @click=${() => { this.confirmKey = ckey; (this as any).requestUpdate?.(); }}>${label}</button>`}
      <button class="btn-link" @click=${() => { this.confirmKey = null; this.clearSel(sel); }}>Clear</button>
    </div>`;
  }

  private summaryHtml(title: string, colLabel: string, rows: any[], shown: boolean, toggle: () => void, sel: Set<string>, editEvent: string, archiveEvent: string, bulkEvent: string, ckey: string) {
    const total = BudgetOverviewView.sumWeekly(rows);
    const keyOf = (p: any) => p.pot_key;
    const allOn = rows.length > 0 && rows.every((p) => sel.has(keyOf(p)));
    return html`<div class="section">
      <button class="group-head ${shown ? 'open' : ''}" @click=${toggle} aria-expanded=${shown ? 'true' : 'false'}>
        <span class="chev"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 2l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        <span class="t">${title}</span>
        <span class="section-badge">${rows.length}</span>
        <span class="sum"><b>${BudgetOverviewView.aud(total)}</b> / week · ${BudgetOverviewView.aud(total * 52)} / year</span>
      </button>
      ${shown ? html`${this.selBarHtml(sel, editEvent, archiveEvent, bulkEvent, ckey)}
      <div class="table-wrap"><table class="hist-table slim" data-selrev=${this.selRev}>
        <colgroup><col style="width:8%"><col style="width:36%"><col style="width:32%"><col style="width:24%"></colgroup>
        <thead><tr><th><input type="checkbox" ?checked=${allOn} .checked=${allOn} @change=${() => this.toggleAll(sel, rows, keyOf)} aria-label="Select all"></th><th>${colLabel}</th><th>Account</th><th class="num">Weekly</th></tr></thead>
        <tbody>${rows.map((p) => this.rowHtml(p, sel, this.mismatchedAccounts()))}</tbody>
      </table></div>` : ''}
    </div>`;
  }

  private rowHtml(p: any, sel?: Set<string>, bad?: Set<number>) {
    const acct = resolveAccountLabel(this.accountLabels, p.account_id);
    const checked = sel?.has(p.pot_key) ?? false;
    const classes = [checked ? 'selected' : '', bad?.has(Number(p.account_id)) ? 'mismatch' : ''].filter(Boolean).join(' ');
    return html`<tr class=${classes}>
      ${sel ? html`<td><input type="checkbox" ?checked=${checked} .checked=${checked} @change=${() => this.toggleSel(sel, p.pot_key)} aria-label="Select ${p.label}"></td>` : ''}
      <td>${p.label}</td><td>${acct ?? '—'}${bad?.has(Number(p.account_id)) ? ' ⚠' : ''}</td>
      <td class="num">${BudgetOverviewView.aud(p.weekly_amount)}</td>
    </tr>`;
  }

  private moveRowHtml(f: any, bad?: Set<number>) {
    const checked = this.selMoves.has(f.flow_key);
    const classes = [checked ? 'selected' : '', bad?.has(Number(f.account_id)) ? 'mismatch' : ''].filter(Boolean).join(' ');
    return html`<tr class=${classes}>
      <td><input type="checkbox" ?checked=${checked} .checked=${checked} @change=${() => this.toggleSel(this.selMoves, f.flow_key)} aria-label="Select ${f.label}"></td>
      <td>${f.label}</td><td>${f.day === 'friday' ? 'Friday' : 'Sunday'}</td><td>${resolveAccountLabel(this.accountLabels, f.account_id) ?? '—'}${bad?.has(Number(f.account_id)) ? ' ⚠' : ''}</td>
      <td class="num">${BudgetOverviewView.aud(f.weekly_amount)}</td>
    </tr>`;
  }

  private movesHtml() {
    const friday = BudgetOverviewView.sumWeekly(this.flowsForDay('friday'));
    const sunday = BudgetOverviewView.sumWeekly(this.flowsForDay('sunday'));
    const combined = Math.round((friday + sunday) * 100) / 100;
    const planned = BudgetOverviewView.sumWeekly(this.pots);
    const gap = Math.round((planned - combined) * 100) / 100;
    const off = gap !== 0;
    const rows = this.visibleMoves();
    const shown = this.showMoves;
    const toggle = () => { this.showMoves = !this.showMoves; (this as any).requestUpdate?.(); };
    const setDay = (d: 'all' | 'friday' | 'sunday') => { this.moveDay = d; (this as any).requestUpdate?.(); };
    return html`<div class="section">
      <button class="group-head ${shown ? 'open' : ''}" @click=${toggle} aria-expanded=${shown ? 'true' : 'false'}>
        <span class="chev"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 2l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        <span class="t">Pay-day moves</span>
        <span class="section-badge">${rows.length}</span>
        <span class="sum">Fri <b class=${off ? 'warn' : ''}>${BudgetOverviewView.aud(friday)}</b> · Sun <b class=${off ? 'warn' : ''}>${BudgetOverviewView.aud(sunday)}</b> · Total <b class=${off ? 'warn' : ''}>${BudgetOverviewView.aud(combined)}</b> / week</span>
      </button>
      ${shown ? html`<div class="day-pick" @click=${(e: Event) => e.stopPropagation()}>
        <button class="chip ${this.moveDay === 'all' ? 'on' : ''}" @click=${() => setDay('all')}>All</button>
        <button class="chip ${this.moveDay === 'friday' ? 'on' : ''}" @click=${() => setDay('friday')}>Friday</button>
        <button class="chip ${this.moveDay === 'sunday' ? 'on' : ''}" @click=${() => setDay('sunday')}>Sunday</button>
      </div>
      ${this.selBarHtml(this.selMoves, 'flow-edit-request', 'flow-archive-request', 'flow-archive-bulk', 'moves')}
      <div class="table-wrap"><table class="hist-table" data-selrev=${this.selRev}>
        <colgroup><col style="width:6%"><col style="width:22%"><col style="width:12%"><col style="width:38%"><col style="width:22%"></colgroup>
        <thead><tr><th><input type="checkbox" ?checked=${rows.length > 0 && rows.every((f: any) => this.selMoves.has(f.flow_key))} .checked=${rows.length > 0 && rows.every((f: any) => this.selMoves.has(f.flow_key))} @change=${() => this.toggleAll(this.selMoves, rows, (f: any) => f.flow_key)} aria-label="Select all"></th><th>Move</th><th>Day</th><th>Account</th><th class="num">Weekly</th></tr></thead>
        <tbody>${rows.map((f) => this.moveRowHtml(f, this.mismatchedAccounts()))}</tbody>
      </table></div>` : ''}
    </div>`;
  }

  /** Account ids whose planned (pots) total differs from moved (flows) total. */
  private mismatchedAccounts(): Set<number> {
    const planned = new Map<number, number>();
    for (const p of this.pots) {
      if (p.account_id == null) continue;
      planned.set(Number(p.account_id), (planned.get(Number(p.account_id)) ?? 0) + Number(p.weekly_amount || 0));
    }
    const moved = new Map<number, number>();
    for (const f of this.flows) {
      if (f.account_id == null) continue;
      moved.set(Number(f.account_id), (moved.get(Number(f.account_id)) ?? 0) + Number(f.weekly_amount || 0));
    }
    const bad = new Set<number>();
    for (const id of new Set<number>([...planned.keys(), ...moved.keys()])) {
      const gap = Math.round(((planned.get(id) ?? 0) - (moved.get(id) ?? 0)) * 100) / 100;
      if (gap !== 0) bad.add(id);
    }
    return bad;
  }

  override render(): unknown {
    if (typeof HTMLElement === 'undefined') return html``;
    const b = this.balance ?? { income_weekly: 0, savings_weekly: 0, expenses_weekly: 0, balance_weekly: 0, moves_weekly: 0, moves_gap_weekly: 0 };
    const balanced = Number(b.balance_weekly) >= 0;
    const gap = Math.round(Number(b.moves_gap_weekly || 0) * 100) / 100;
    const reconciled = gap === 0;
    const savings = this.rows('saving');
    const expenses = this.rows('expense');
    return html`
      <div class="view-scroll">
      <div class="topbar"><span class="crumb-current">Budget · Overview</span><div class="spacer"></div>
        <button class="filter-btn" @click=${() => this.emit('reorder-sections')}>⇅ Sections</button>
        <div class="add-wrap">
          <button class="filter-btn" @click=${() => { this.addOpen = !this.addOpen; (this as any).requestUpdate?.(); }}>Add ▾</button>
          ${this.addOpen ? html`<div class="add-menu">
            <button @click=${() => { this.addOpen = false; this.emit('pot-add-request'); }}>Pot / expense line<span class="sub">Savings or expense row</span></button>
            <button @click=${() => { this.addOpen = false; this.emit('flow-add-request'); }}>Pay-day move<span class="sub">Friday or Sunday</span></button>
          </div>` : ''}
        </div>
      </div>
      <div class="view-container"><div class="view-container-inner">
        <h1>Budget Overview</h1>
        ${this.error ? html`<p class="field-error">Error: ${this.error}</p>` : ''}
        <div class="order-stack">
        <div class="section" style="order:${this.sectionIndex('income')}"><div class="section-header"><h3 class="section-title">Income & balance</h3>
          ${this.incomeManual ? html`<span class="tag">Edited by hand</span>` : html`<span class="tag">Live from Salary</span>`}</div>
          <div class="cards">
            <div class="card"><div class="k">In / week</div><div class="v">${BudgetOverviewView.aud(b.income_weekly)}</div>
              <div class="s">Yearly ≈ ${BudgetOverviewView.aud(Number(b.income_weekly) * 52)}</div>
              ${this.incomeManual
                ? this.incomeEditing
                  ? html`<div class="income-edit">
                      <input id="income-amount" type="text" inputmode="decimal" placeholder="$ / week" .value=${String(b.income_weekly ?? '')}>
                      <input id="income-year" type="text" inputmode="numeric" placeholder="YYYY-YYYY" .value=${this.incomeYear}>
                      <button class="btn-link" @click=${() => this.saveManualIncome()}>Save</button>
                      <button class="btn-link" @click=${() => { this.incomeEditing = false; this.incomeMenuOpen = false; (this as any).requestUpdate?.(); }}>Cancel</button>
                    </div>`
                  : html`<button class="card-menu-btn ${this.incomeMenuOpen ? 'open' : ''}" title="Income options"
                      @click=${() => { this.incomeMenuOpen = !this.incomeMenuOpen; (this as any).requestUpdate?.(); }}
                      @mouseenter=${() => { if (!this.incomeMenuOpen) { this.incomeMenuOpen = true; (this as any).requestUpdate?.(); } }}>⋮</button>
                    ${this.incomeMenuOpen ? html`<div class="card-menu" @mouseleave=${() => { this.incomeMenuOpen = false; (this as any).requestUpdate?.(); }}>
                      <button @click=${() => this.startIncomeEdit()}>Set manually<span class="sub">Type a weekly figure</span></button>
                    </div>` : ''}`
                : ''}</div>
            <div class="card"><div class="k">Out / week</div><div class="v">${BudgetOverviewView.aud(Number(b.savings_weekly) + Number(b.expenses_weekly))}</div>
              <div class="s">Savings ${BudgetOverviewView.aud(b.savings_weekly)} + Expenses ${BudgetOverviewView.aud(b.expenses_weekly)}</div></div>
            <div class="card"><div class="k">Balance</div><div class="v ${balanced ? 'ok' : 'bad'}">${BudgetOverviewView.aud(b.balance_weekly)}</div>
              <div class="s">${balanced ? 'Balanced' : 'Over budget'}</div></div>
            <div class="card"><div class="k">Moves</div><div class="v ${reconciled ? 'ok' : 'warn'}">${BudgetOverviewView.aud(b.moves_weekly)}</div>
              <div class="s">${reconciled ? 'Matches planned out' : `${BudgetOverviewView.aud(Math.abs(gap))}/wk ${gap > 0 ? 'unallocated' : 'over-moved'}`}</div></div>
          </div>
        </div>
        <div class="two-col" style="order:${this.sectionIndex('plans')}">
        ${this.summaryHtml('Savings pots', 'Pot', savings, this.showSavings, () => { this.showSavings = !this.showSavings; (this as any).requestUpdate?.(); }, this.selSavings, 'pot-edit-request', 'pot-archive-request', 'pot-archive-bulk', 'savings')}
        ${this.summaryHtml('Expense lines', 'Line', expenses, this.showExpenses, () => { this.showExpenses = !this.showExpenses; (this as any).requestUpdate?.(); }, this.selExpenses, 'pot-edit-request', 'pot-archive-request', 'pot-archive-bulk', 'expenses')}
        </div>
        <div style="order:${this.sectionIndex('moves')}">${this.movesHtml()}</div>
        ${this.trace.length ? html`<div class="section" style="order:${this.sectionIndex('trace')}">
          <button class="group-head ${this.showTrace ? 'open' : ''}" @click=${() => { this.showTrace = !this.showTrace; (this as any).requestUpdate?.(); }} aria-expanded=${this.showTrace ? 'true' : 'false'}>
            <span class="chev"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 2l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
            <span class="t">Plan trace</span>
            <span class="section-badge">${this.trace.length}</span>
            <span class="sum">Closed history rows</span>
          </button>
          ${this.showTrace ? html`<div class="table-wrap"><table class="hist-table">
            <thead><tr><th>Item</th><th class="num">Weekly</th><th>From</th><th>To</th><th>Note</th></tr></thead>
            <tbody>${this.trace.map((r: any) => html`<tr class="trace">
              <td>${r.label}</td><td class="num">${BudgetOverviewView.aud(r.weekly_amount)}</td>
              <td>${r.effective_from}</td><td>${r.effective_to}</td><td>${r.notes ?? ''}</td>
            </tr>`)}</tbody>
          </table></div>` : ''}
        </div>` : ''}
        </div>
      </div></div>
      </div>
    `;
  }
}
