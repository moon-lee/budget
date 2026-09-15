import { LitElement, css, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import { accountById, resolveAccountLabel } from '../dao/accounts.js';
import { listPotHistory } from '../dao/pots.js';
import { balanceCheck } from '../services/budget-service.js';
import { listCurrentPots } from '../dao/pots.js';
import { listCurrentFlows } from '../dao/flows.js';

const Base = typeof HTMLElement !== 'undefined' ? LitElement : (class {} as unknown as typeof LitElement);

/**
 * Budget Overview (spec §3.1): income & balance cards, savings + expense
 * tables, per-row history + plan-trace section.
 * Thin: loads via Task 2 services, dispatches pot and realloc requests.
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
    .ok{color:var(--ff-teal,#4ec9b0)}
    .bad{color:var(--ff-danger,#f48771)}
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
    .day-pick{display:flex;align-items:center;gap:8px;margin:0 0 8px}
    .chip{border:1px solid var(--ff-border,#3e3e3e);background:transparent;color:var(--ff-text-muted,#858585);border-radius:12px;padding:3px 12px;font-size:var(--ff-font-sm);cursor:pointer}
    .chip.on{background:var(--ff-bg-input,#3c3c3c);color:var(--ff-text,#d4d4d4);border-color:var(--ff-accent,#007acc)}
    .day-pick .filter-btn{margin-left:auto}
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

  async setFinance(f: any): Promise<void> {
    this.finance = f;
    await this.load();
  }

  async load(): Promise<void> {
    if (!this.finance) return;
    try {
      this.error = '';
      this.pots = await listCurrentPots(this.finance);
      this.flows = await listCurrentFlows(this.finance);
      this.accountLabels = await accountById(this.finance);
      // income source tag: live `pay` present and positive → Salary, else manual (spec §6)
      this.incomeManual = true;
      try {
        const stats = (await this.finance.services?.invoke?.('pay', 'getPayslipStats')) as any;
        const avg = Number(stats?.avgNet ?? NaN);
        if (Number.isFinite(avg) && avg > 0) this.incomeManual = false;
      } catch { /* manual fallback */ }
      this.balance = await balanceCheck(this.finance);
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

  private emit(name: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
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

  private summaryHtml(title: string, colLabel: string, rows: any[], shown: boolean, toggle: () => void, colGroup: unknown) {
    const total = BudgetOverviewView.sumWeekly(rows);
    return html`<div class="section">
      <button class="group-head ${shown ? 'open' : ''}" @click=${toggle} aria-expanded=${shown ? 'true' : 'false'}>
        <span class="chev"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 2l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        <span class="t">${title}</span>
        <span class="section-badge">${rows.length}</span>
        <span class="sum"><b>${BudgetOverviewView.aud(total)}</b> / week · ${BudgetOverviewView.aud(total * 52)} / year</span>
      </button>
      ${shown ? html`<div class="table-wrap"><table class="hist-table">
        <colgroup>${colGroup}</colgroup>
        <thead><tr><th>${colLabel}</th><th>Account</th><th class="num">Weekly</th><th class="num">Yearly ×52</th><th>Since</th><th></th></tr></thead>
        <tbody>${rows.map((p) => this.rowHtml(p))}</tbody>
      </table></div>` : ''}
    </div>`;
  }

  private rowHtml(p: any) {
    const acct = resolveAccountLabel(this.accountLabels, p.account_id);
    return html`<tr>
      <td>${p.label}</td><td>${acct ?? '—'}</td>
      <td class="num">${BudgetOverviewView.aud(p.weekly_amount)}</td>
      <td class="num">${BudgetOverviewView.aud(Number(p.weekly_amount || 0) * 52)}</td>
      <td>${p.effective_from}</td>
      <td class="actions"><button class="btn-link" @click=${() => this.emit('pot-edit-request', { key: p.pot_key })}>Edit</button><button class="btn-link" @click=${() => this.emit('pot-archive-request', { key: p.pot_key })}>Archive</button></td>
    </tr>`;
  }

  private moveRowHtml(f: any) {
    return html`<tr>
      <td>${f.label}</td><td>${f.day === 'friday' ? 'Friday' : 'Sunday'}</td><td>${resolveAccountLabel(this.accountLabels, f.account_id) ?? '—'}</td>
      <td class="num">${BudgetOverviewView.aud(f.weekly_amount)}</td>
      <td class="num">${BudgetOverviewView.aud(Number(f.weekly_amount || 0) * 52)}</td>
      <td>${f.effective_from}</td>
      <td class="actions"><button class="btn-link" @click=${() => this.emit('flow-edit-request', { key: f.flow_key })}>Edit</button><button class="btn-link" @click=${() => this.emit('flow-archive-request', { key: f.flow_key })}>Archive</button></td>
    </tr>`;
  }

  private movesHtml() {
    const friday = BudgetOverviewView.sumWeekly(this.flowsForDay('friday'));
    const sunday = BudgetOverviewView.sumWeekly(this.flowsForDay('sunday'));
    const rows = this.visibleMoves();
    const shown = this.showMoves;
    const toggle = () => { this.showMoves = !this.showMoves; (this as any).requestUpdate?.(); };
    const setDay = (d: 'all' | 'friday' | 'sunday') => { this.moveDay = d; (this as any).requestUpdate?.(); };
    return html`<div class="section">
      <button class="group-head ${shown ? 'open' : ''}" @click=${toggle} aria-expanded=${shown ? 'true' : 'false'}>
        <span class="chev"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 2l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        <span class="t">Pay-day moves</span>
        <span class="section-badge">${rows.length}</span>
        <span class="sum">Fri <b>${BudgetOverviewView.aud(friday)}</b> · Sun <b>${BudgetOverviewView.aud(sunday)}</b> / week</span>
      </button>
      ${shown ? html`<div class="day-pick" @click=${(e: Event) => e.stopPropagation()}>
        <button class="chip ${this.moveDay === 'all' ? 'on' : ''}" @click=${() => setDay('all')}>All</button>
        <button class="chip ${this.moveDay === 'friday' ? 'on' : ''}" @click=${() => setDay('friday')}>Friday</button>
        <button class="chip ${this.moveDay === 'sunday' ? 'on' : ''}" @click=${() => setDay('sunday')}>Sunday</button>
        <button class="filter-btn" @click=${() => this.emit('flow-add-request')}>Add move</button>
      </div>
      <div class="table-wrap"><table class="hist-table">
        <colgroup><col style="width:18%"><col style="width:10%"><col style="width:20%"><col style="width:11%"><col style="width:11%"><col style="width:10%"><col style="width:20%"></colgroup>
        <thead><tr><th>Move</th><th>Day</th><th>Account</th><th class="num">Weekly</th><th class="num">Yearly ×52</th><th>Since</th><th></th></tr></thead>
        <tbody>${rows.map((f) => this.moveRowHtml(f))}</tbody>
      </table></div>` : ''}
    </div>`;
  }

  override render(): unknown {
    if (typeof HTMLElement === 'undefined') return html``;
    const b = this.balance ?? { income_weekly: 0, savings_weekly: 0, expenses_weekly: 0, balance_weekly: 0 };
    const balanced = Number(b.balance_weekly) >= 0;
    const savings = this.rows('saving');
    const expenses = this.rows('expense');
    return html`
      <div class="view-scroll">
      <div class="topbar"><span class="crumb-current">Budget · Overview</span><div class="spacer"></div>
        <button class="filter-btn" @click=${() => this.emit('pot-add-request')}>Add line</button>
        <button class="filter-btn" @click=${() => this.emit('realloc-request')}>Re-allocate</button></div>
      <div class="view-container"><div class="view-container-inner">
        <h1>Budget Overview</h1>
        ${this.error ? html`<p class="field-error">Error: ${this.error}</p>` : ''}
        <div class="section"><div class="section-header"><h3 class="section-title">Income & balance</h3>
          ${this.incomeManual ? html`<span class="tag">Edited by hand</span>` : html`<span class="tag">Live from Salary</span>`}</div>
          <div class="cards">
            <div class="card"><div class="k">In / week</div><div class="v">${BudgetOverviewView.aud(b.income_weekly)}</div>
              <div class="s">Yearly ≈ ${BudgetOverviewView.aud(Number(b.income_weekly) * 52)}</div></div>
            <div class="card"><div class="k">Out / week</div><div class="v">${BudgetOverviewView.aud(Number(b.savings_weekly) + Number(b.expenses_weekly))}</div>
              <div class="s">Savings ${BudgetOverviewView.aud(b.savings_weekly)} + Expenses ${BudgetOverviewView.aud(b.expenses_weekly)}</div></div>
            <div class="card"><div class="k">Balance</div><div class="v ${balanced ? 'ok' : 'bad'}">${BudgetOverviewView.aud(b.balance_weekly)}</div>
              <div class="s">${balanced ? 'Balanced' : 'Over budget'}</div></div>
          </div>
        </div>
        ${this.summaryHtml('Savings pots', 'Pot', savings, this.showSavings, () => { this.showSavings = !this.showSavings; (this as any).requestUpdate?.(); }, html`<col style="width:20%"><col style="width:20%"><col style="width:12%"><col style="width:12%"><col style="width:12%"><col style="width:24%">`)}
        ${this.summaryHtml('Expense lines', 'Line', expenses, this.showExpenses, () => { this.showExpenses = !this.showExpenses; (this as any).requestUpdate?.(); }, html`<col style="width:20%"><col style="width:20%"><col style="width:12%"><col style="width:12%"><col style="width:12%"><col style="width:24%">`)}
        ${this.movesHtml()}
        ${this.trace.length ? html`<div class="section"><div class="section-header"><h3 class="section-title">Plan trace</h3><span class="section-badge">${this.trace.length}</span></div>
          <div class="table-wrap"><table class="hist-table">
            <thead><tr><th>Item</th><th class="num">Weekly</th><th>From</th><th>To</th><th>Note</th></tr></thead>
            <tbody>${this.trace.map((r: any) => html`<tr class="trace">
              <td>${r.label}</td><td class="num">${BudgetOverviewView.aud(r.weekly_amount)}</td>
              <td>${r.effective_from}</td><td>${r.effective_to}</td><td>${r.notes ?? ''}</td>
            </tr>`)}</tbody>
          </table></div></div>` : ''}
      </div></div>
      </div>
    `;
  }
}
