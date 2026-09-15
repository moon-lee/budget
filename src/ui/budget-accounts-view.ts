import { LitElement, css, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import { listAccounts } from '../dao/accounts.js';

const Base = typeof HTMLElement !== 'undefined' ? LitElement : (class {} as unknown as typeof LitElement);

/**
 * Accounts view (spec §3.3, mortgage accounts-view shape):
 * table (bank, key, label, active toggle) + inline Add/Edit.
 * Key is the stable identity (read-only on edit); bank + label editable.
 * Dispatches account-create / account-edit / account-toggle to the orchestrator.
 */
export class BudgetAccountsView extends Base {
  static override styles = typeof HTMLElement !== 'undefined' ? [sharedStyles, css`
    .hist-table{width:100%;border-collapse:collapse;table-layout:fixed}
    .hist-table thead th{font-size:var(--ff-font-sm);font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--ff-text-muted,#858585);text-align:left;padding:8px 10px;border-bottom:1px solid var(--ff-border,#3e3e3e);white-space:nowrap}
    .hist-table tbody td{padding:9px 10px;border-bottom:1px solid var(--ff-border,#3e3e3e);font-size:var(--ff-font-base);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .hist-table tbody tr:nth-child(even){background:var(--ff-bg-subpanel,#2a2a2a)}
    .hist-table tbody tr:hover{background:var(--ff-bg-input-hover,#4a4a4a)}
    .hist-table tr.inactive td{opacity:.55}
    .status-on{font-weight:700;color:var(--ff-teal,#4ec9b0)}
    .status-off{font-weight:700;color:var(--ff-text-muted,#858585)}
  `] as any : [];

  finance: any = null;
  rows: any[] = [];
  editing: any = null;
  error = '';

  async setFinance(f: any): Promise<void> {
    this.finance = f;
    await this.load();
  }

  async load(): Promise<void> {
    if (!this.finance) return;
    try {
      this.error = '';
      this.rows = await listAccounts(this.finance);
      this.editing = null;
    } catch (e: any) {
      this.error = String(e?.message || e);
    }
    (this as any).requestUpdate?.();
  }

  private emit(name: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  private readForm(): any {
    const root = (this as any).renderRoot as ShadowRoot | undefined;
    const v = (id: string): string => (root?.querySelector(id) as HTMLInputElement)?.value ?? '';
    return { account_key: v('#a-key').trim(), bank: v('#a-bank').trim() || null, label: v('#a-label').trim() };
  }

  override render(): unknown {
    if (typeof HTMLElement === 'undefined') return html``;
    const active = this.rows.filter((r: any) => r.is_active).length;
    return html`
      <div class="view-scroll">
      <div class="topbar"><div class="topbar-inner"><span class="crumb-current">Budget · Accounts</span><div class="spacer"></div>
        <button class="filter-btn" @click=${() => { this.editing = { mode: 'add' }; (this as any).requestUpdate?.(); }}>Add account</button></div></div>
      <div class="view-container"><div class="view-container-inner">
        <h1>Accounts</h1>
        ${this.error ? html`<p class="field-error">Error: ${this.error}</p>` : ''}
        <div class="section">
          <div class="section-header"><h3 class="section-title">Bank accounts</h3><span class="section-badge">${active} active</span></div>
          <div class="table-wrap"><table class="hist-table">
            <colgroup><col style="width:18%"><col style="width:20%"><col style="width:28%"><col style="width:12%"><col style="width:22%"></colgroup>
            <thead><tr><th>Key</th><th>Bank</th><th>Label</th><th>Status</th><th></th></tr></thead>
            <tbody>${this.rows.map((r: any) => html`<tr class=${r.is_active ? '' : 'inactive'}>
              <td>${r.account_key}</td><td>${r.bank ?? '—'}</td><td>${r.label}</td>
              <td class=${r.is_active ? 'status-on' : 'status-off'}>${r.is_active ? 'Active' : 'Inactive'}</td>
              <td class="actions"><button class="btn-link" @click=${() => { this.editing = { mode: 'edit', row: r }; (this as any).requestUpdate?.(); }}>Edit</button><button class="btn-link" @click=${() => this.emit('account-toggle', { id: r.id, active: !r.is_active })}>${r.is_active ? 'Deactivate' : 'Activate'}</button></td>
            </tr>`)}</tbody>
          </table></div>
        </div>
        ${this.editing ? html`<div class="section">
          <div class="section-header"><h3 class="section-title">${this.editing.mode === 'add' ? 'Add account' : 'Edit account'}</h3></div>
          <div class="section-body">
            <div class="grid-2">
              ${this.editing.mode === 'add' ? html`
                <div class="field"><label>Key <span class="label-sub">e.g. 5272, unique, immutable</span></label><input id="a-key" type="text"></div>
                <div class="field"><label>Bank <span class="label-sub">e.g. NAB SAVING, optional</span></label><input id="a-bank" type="text"></div>` : html`
                <div class="field"><label>Key <span class="label-sub">stable identity, read-only</span></label><input id="a-key" type="text" .value=${this.editing.row.account_key} disabled></div>
                <div class="field"><label>Bank <span class="label-sub">e.g. NAB SAVING, optional</span></label><input id="a-bank" type="text" .value=${this.editing.row.bank ?? ''}></div>`}
              <div class="field"><label>Label</label><input id="a-label" type="text" .value=${this.editing.mode === 'edit' ? this.editing.row.label : ''}></div>
            </div>
            <div class="footer">
              <button class="btn btn-secondary" @click=${() => { this.editing = null; (this as any).requestUpdate?.(); }}>Cancel</button>
              <button class="btn btn-primary" @click=${() => {
                if (this.editing.mode === 'add') this.emit('account-create', this.readForm());
                else this.emit('account-edit', { id: this.editing.row.id, label: (this as any).renderRoot.querySelector('#a-label').value, bank: (this as any).renderRoot.querySelector('#a-bank').value });
              }}>Save</button>
            </div>
          </div>
        </div>` : ''}
        <p class="empty">Accounts are never deleted — deactivated ones stay readable in history.</p>
      </div></div>
      </div>
    `;
  }
}
