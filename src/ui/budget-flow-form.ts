import { LitElement, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import { listActiveAccounts } from '../dao/accounts.js';

const Base = typeof HTMLElement !== 'undefined' ? LitElement : (class {} as unknown as typeof LitElement);

/**
 * Flow form (spec §3.2): add or edit a Friday/Sunday pay-day move.
 * Dispatches flow-create / flow-edit with {key, patch, start};
 * flow-form-cancel returns without saving.
 */
export class BudgetFlowForm extends Base {
  static override styles = typeof HTMLElement !== 'undefined' ? [sharedStyles] as any : [];

  finance: any = null;
  /** Prefill for edit mode: {key, row?}. Absent = add mode. */
  edit: any = null;
  accounts: any[] = [];
  error = '';

  async setFinance(f: any): Promise<void> {
    this.finance = f;
    await this.load();
  }

  async init(f: any, edit: any = null): Promise<void> {
    this.finance = f;
    this.edit = edit;
    await this.load();
  }

  async load(): Promise<void> {
    if (!this.finance) return;
    try {
      this.error = '';
      this.accounts = await listActiveAccounts(this.finance);
    } catch (e: any) {
      this.error = String(e?.message || e);
    }
    (this as any).requestUpdate?.();
  }

  private emit(name: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  private collect(): any {
    const root = (this as any).renderRoot as ShadowRoot | undefined;
    const v = (id: string): string => (root?.querySelector(id) as HTMLInputElement)?.value ?? '';
    const acct = v('#f-account');
    return {
      key: (this.edit?.key ?? v('#f-key')).trim(),
      patch: {
        label: v('#f-label').trim(),
        day: v('#f-day'),
        weekly_amount: Number(v('#f-amount')),
        account_id: acct === '' ? null : Number(acct),
        notes: v('#f-notes').trim() || null,
      },
      start: v('#f-start'),
    };
  }

  override render(): unknown {
    if (typeof HTMLElement === 'undefined') return html``;
    const row = this.edit?.row ?? {};
    const isEdit = Boolean(this.edit?.key);
    const today = new Date().toISOString().slice(0, 10);
    return html`
      <div class="view-scroll">
      <div class="topbar"><div class="topbar-inner"><span class="crumb-current">Budget · ${isEdit ? 'Edit move' : 'Add move'}</span></div></div>
      <div class="view-container"><div class="view-container-inner">
        <h1>${isEdit ? 'Edit move' : 'Add move'}</h1>
        ${this.error ? html`<p class="field-error">Error: ${this.error}</p>` : ''}
        <div class="section"><div class="section-body">
          <div class="grid-2">
            ${isEdit ? '' : html`<div class="field"><label>Key <span class="label-sub">stable, e.g. friday-mortgage</span></label><input id="f-key" type="text"></div>`}
            <div class="field"><label>Label</label><input id="f-label" type="text" .value=${row.label ?? ''}></div>
            <div class="field"><label>Day</label><select id="f-day">
              <option value="friday" ?selected=${(row.day ?? 'friday') === 'friday'}>Friday — pay day</option>
              <option value="sunday" ?selected=${row.day === 'sunday'}>Sunday — weekly</option>
            </select></div>
            <div class="field"><label>Weekly amount <span class="label-sub">$ / week</span></label><input id="f-amount" type="text" inputmode="decimal" .value=${row.weekly_amount ?? ''}></div>
            <div class="field"><label>Account <span class="label-sub">destination</span></label><select id="f-account">
              <option value="">— No account —</option>
              ${this.accounts.map((a: any) => html`<option value=${a.id} ?selected=${Number(row.account_id) === a.id}>${a.bank ? a.bank + ' ' : ''}${a.label}</option>`)}
            </select></div>
            <div class="field"><label>Effective from</label><input id="f-start" type="date" .value=${today}></div>
            <div class="field field-full"><label>Notes</label><input id="f-notes" type="text" .value=${row.notes ?? ''}></div>
          </div>
          <div class="footer">
            <button class="btn btn-secondary" @click=${() => this.emit('flow-form-cancel')}>Cancel</button>
            <button class="btn btn-primary" @click=${() => this.emit(isEdit ? 'flow-edit' : 'flow-create', this.collect())}>Save</button>
          </div>
        </div></div>
      </div></div>
      </div>
    `;
  }
}
