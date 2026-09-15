import { LitElement, css, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import { accountById, resolveAccountLabel } from '../dao/accounts.js';
import { listCurrentFlows } from '../dao/flows.js';

const Base = typeof HTMLElement !== 'undefined' ? LitElement : (class {} as unknown as typeof LitElement);

/**
 * Flow Planner (spec §3.2): Friday + Sunday pay-day moves as editable rows.
 * Thin: loads via Task 2 services, dispatches flow-* requests.
 */
export class BudgetFlowsView extends Base {
  static override styles = typeof HTMLElement !== 'undefined' ? [sharedStyles, css`
    .hist-table{width:100%;border-collapse:collapse;table-layout:fixed}
    .hist-table thead th{font-size:var(--ff-font-sm);font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--ff-text-muted,#858585);text-align:left;padding:8px 10px;border-bottom:1px solid var(--ff-border,#3e3e3e);white-space:nowrap}
    .hist-table thead th.num{text-align:right}
    .hist-table tbody td{padding:9px 10px;border-bottom:1px solid var(--ff-border,#3e3e3e);font-size:var(--ff-font-base);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .hist-table tbody td.num{text-align:right;font-variant-numeric:tabular-nums}
    .hist-table tbody tr:nth-child(even){background:var(--ff-bg-subpanel,#2a2a2a)}
    .hist-table tbody tr:hover{background:var(--ff-bg-input-hover,#4a4a4a)}
  `] as any : [];

  finance: any = null;
  flows: any[] = [];
  accountLabels = new Map<number, any>();
  error = '';

  async setFinance(f: any): Promise<void> {
    this.finance = f;
    await this.load();
  }

  async load(): Promise<void> {
    if (!this.finance) return;
    try {
      this.error = '';
      this.flows = await listCurrentFlows(this.finance);
      this.accountLabels = await accountById(this.finance);
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

  private dayTable(day: string, title: string) {
    const rows = this.flows.filter((f: any) => f.day === day);
    return html`<div class="section"><div class="section-header"><h3 class="section-title">${title}</h3><span class="section-badge">${rows.length}</span></div>
      <div class="table-wrap"><table class="hist-table">
        <colgroup><col style="width:28%"><col style="width:16%"><col style="width:26%"><col style="width:12%"><col style="width:18%"></colgroup>
        <thead><tr><th>Move</th><th class="num">Weekly</th><th>Account</th><th>Since</th><th></th></tr></thead>
        <tbody>${rows.map((f: any) => html`<tr>
          <td>${f.label}</td><td class="num">${BudgetFlowsView.aud(f.weekly_amount)}</td>
          <td>${resolveAccountLabel(this.accountLabels, f.account_id) ?? '—'}</td>
          <td>${f.effective_from}</td>
          <td class="actions"><button class="btn-link" @click=${() => this.emit('flow-edit-request', { key: f.flow_key })}>Edit</button><button class="btn-link" @click=${() => this.emit('flow-archive-request', { key: f.flow_key })}>Archive</button></td>
        </tr>`)}</tbody>
      </table></div></div>`;
  }

  override render(): unknown {
    if (typeof HTMLElement === 'undefined') return html``;
    return html`
      <div class="view-scroll">
      <div class="topbar"><span class="crumb-current">Budget · Flow Planner</span><div class="spacer"></div>
        <button class="filter-btn" @click=${() => this.emit('flow-add-request')}>Add move</button></div>
      <div class="view-container"><div class="view-container-inner">
        <h1>Flow Planner</h1>
        ${this.error ? html`<p class="field-error">Error: ${this.error}</p>` : ''}
        ${this.dayTable('friday', 'Friday — pay day')}
        ${this.dayTable('sunday', 'Sunday — weekly moves')}
      </div></div>
      </div>
    `;
  }
}
