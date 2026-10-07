import { LitElement, css, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import { listActiveAccounts } from '../dao/accounts.js';
import { monthlyToWeekly, weeklyProvisionYearly } from '../services/budget-service.js';

const Base = typeof HTMLElement !== 'undefined' ? LitElement : (class {} as unknown as typeof LitElement);

/** Toggle + hint styles live here: `src/styles/*` is a vendored snapshot. */
const potFormStyles = typeof HTMLElement !== 'undefined' ? css`
  /* Label and unit toggle share one row so the amount column stays compact. */
  .field-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 20px; }
  .unit-toggle { display: inline-flex; flex: 0 0 auto; border: 1px solid var(--ff-border, #3e3e3e); border-radius: 3px; overflow: hidden; }
  .unit-toggle[hidden] { display: none; }
  .unit-btn { background: transparent; border: 0; color: var(--ff-text-muted, #858585); font-family: inherit; font-size: var(--ff-font-sm); line-height: 1.4; padding: 2px 10px; cursor: pointer; }
  .unit-btn:hover { background: var(--ff-bg-input-hover, #4a4a4a); color: var(--ff-text, #d4d4d4); }
  .unit-btn[aria-pressed="true"] { background: var(--ff-accent, #007acc); color: var(--ff-text-strong, #ffffff); }
  .unit-btn:focus-visible { outline: 1px solid var(--ff-accent, #007acc); outline-offset: -2px; }
  /* Money reads better right-aligned with stable digit widths. */
  #p-amount { text-align: right; font-variant-numeric: tabular-nums; }
  #p-amount-hint { min-height: 14px; text-align: right; font-variant-numeric: tabular-nums; }
` : (undefined as unknown as ReturnType<typeof css>);

/**
 * Pot form (spec §3.1): add or edit a savings pot / expense line.
 * Dispatches pot-create / pot-edit with {key, patch, start};
 * pot-form-cancel returns without saving.
 */
export class BudgetPotForm extends Base {
  static override styles = typeof HTMLElement !== 'undefined' ? [sharedStyles, potFormStyles] as any : [];

  finance: any = null;
  /** Prefill for edit mode: {key, row?}. Absent = add mode. */
  edit: any = null;
  accounts: any[] = [];
  error = '';
  /** Amount entry unit: 'weekly' (default) | 'monthly'. Expense rows only. */
  mode: 'weekly' | 'monthly' = 'weekly';

  async setFinance(f: any): Promise<void> {
    this.finance = f;
    await this.load();
  }

  async init(f: any, edit: any = null): Promise<void> {
    this.finance = f;
    this.edit = edit;
    this.mode = 'weekly';
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

  private root(): ShadowRoot | undefined {
    return (this as any).renderRoot as ShadowRoot | undefined;
  }

  private el(id: string): HTMLElement | null {
    return this.root()?.querySelector(id) ?? null;
  }

  /**
   * Show the unit toggle only for expense rows, and drop back to weekly when
   * the kind changes — saving targets are authored as a weekly transfer.
   * Direct DOM writes rather than a re-render, so values already typed into
   * the other fields are not discarded.
   */
  private syncAmountMode(): void {
    const kind = (this.el('#p-kind') as HTMLSelectElement | null)?.value || 'saving';
    const toggle = this.el('#p-amount-toggle');
    const unit = this.el('#p-amount-unit');
    if (!toggle || !unit) return;
    if (kind !== 'expense') {
      this.mode = 'weekly';
      (toggle as HTMLElement).hidden = true;
    } else {
      (toggle as HTMLElement).hidden = false;
    }
    this.paintAmountMode();
  }

  /** Repaint the unit label, the toggle state and the live weekly hint. */
  private paintAmountMode(): void {
    const unit = this.el('#p-amount-unit');
    const toggle = this.el('#p-amount-toggle');
    const hint = this.el('#p-amount-hint');
    const input = this.el('#p-amount') as HTMLInputElement | null;
    if (unit) unit.textContent = this.mode === 'monthly' ? '$ / month' : '$ / week';
    for (const btn of Array.from(toggle?.querySelectorAll('button') ?? [])) {
      (btn as HTMLElement).setAttribute(
        'aria-pressed',
        String((btn as HTMLElement).dataset.mode === this.mode),
      );
    }
    if (!hint) return;
    if (this.mode !== 'monthly') {
      hint.textContent = '';
      return;
    }
    const entered = Number(input?.value);
    if (!Number.isFinite(entered)) {
      hint.textContent = '';
      return;
    }
    const weekly = monthlyToWeekly(entered);
    // Show the annual provision, not the bill: dollar-rounding means the
    // weekly set-aside deliberately overshoots 12 x monthly, and the user
    // should see what they are actually committing before saving.
    const provision = weeklyProvisionYearly(weekly).toLocaleString('en-AU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    hint.textContent = `= $${weekly.toFixed(2)} / week  ·  $${provision} / year set aside`;
  }

  private collect(): any {
    const v = (id: string): string => (this.root()?.querySelector(id) as HTMLInputElement)?.value ?? '';
    const acct = v('#p-account');
    const entered = Number(v('#p-amount'));
    return {
      key: (this.edit?.key ?? v('#p-key')).trim(),
      patch: {
        label: v('#p-label').trim(),
        kind: v('#p-kind'),
        // Monthly is entry sugar only — storage stays weekly.
        weekly_amount: this.mode === 'monthly' ? monthlyToWeekly(entered) : entered,
        account_id: acct === '' ? null : Number(acct),
        notes: v('#p-notes').trim() || null,
      },
      start: v('#p-start'),
    };
  }

  override render(): unknown {
    if (typeof HTMLElement === 'undefined') return html``;
    const row = this.edit?.row ?? {};
    const isEdit = Boolean(this.edit?.key);
    const today = new Date().toISOString().slice(0, 10);
    return html`
      <div class="view-scroll">
      <div class="topbar"><span class="crumb-current">Budget · ${isEdit ? 'Edit line' : 'Add line'}</span></div>
      <div class="view-container"><div class="view-container-inner">
        <h1>${isEdit ? 'Edit line' : 'Add line'}</h1>
        ${this.error ? html`<p class="field-error">Error: ${this.error}</p>` : ''}
        <div class="section"><div class="section-body">
          <div class="grid-2">
            ${isEdit ? '' : html`<div class="field"><label>Key <span class="label-sub">stable, e.g. emergency</span></label><input id="p-key" type="text"></div>`}
            <div class="field"><label>Label</label><input id="p-label" type="text" .value=${row.label ?? ''}></div>
            <div class="field"><label>Kind</label><select id="p-kind" @change=${() => this.syncAmountMode()}>
              <option value="saving" ?selected=${(row.kind ?? 'saving') === 'saving'}>Saving</option>
              <option value="expense" ?selected=${row.kind === 'expense'}>Expense</option>
            </select></div>
            <div class="field"><div class="field-head">
              <label for="p-amount">Amount <span class="label-sub" id="p-amount-unit">$ / week</span></label>
              <div class="unit-toggle" id="p-amount-toggle" role="group" aria-label="Amount entry period" ?hidden=${(row.kind ?? 'saving') !== 'expense'}>
                <button type="button" class="unit-btn" data-mode="weekly" aria-pressed=${this.mode === 'weekly'} @click=${() => { this.mode = 'weekly'; this.paintAmountMode(); }}>Weekly</button>
                <button type="button" class="unit-btn" data-mode="monthly" aria-pressed=${this.mode === 'monthly'} @click=${() => { this.mode = 'monthly'; this.paintAmountMode(); }}>Monthly</button>
              </div>
            </div>
              <input id="p-amount" type="text" inputmode="decimal" .value=${row.weekly_amount ?? ''} @input=${() => this.paintAmountMode()}>
              <span class="label-sub" id="p-amount-hint"></span>
            </div>
            <div class="field"><label>Account <span class="label-sub">optional</span></label><select id="p-account">
              <option value="">— No account —</option>
              ${this.accounts.map((a: any) => html`<option value=${a.id} ?selected=${Number(row.account_id) === a.id}>${a.bank ? a.bank + ' ' : ''}${a.label}</option>`)}
            </select></div>
            <div class="field"><label>Effective from</label><input id="p-start" type="date" .value=${today}></div>
            <div class="field field-full"><label>Notes</label><input id="p-notes" type="text" .value=${row.notes ?? ''}></div>
          </div>
          <div class="footer">
            <button class="btn btn-secondary" @click=${() => this.emit('pot-form-cancel')}>Cancel</button>
            <button class="btn btn-primary" @click=${() => this.emit(isEdit ? 'pot-edit' : 'pot-create', this.collect())}>Save</button>
          </div>
        </div></div>
      </div></div>
      </div>
    `;
  }
}
