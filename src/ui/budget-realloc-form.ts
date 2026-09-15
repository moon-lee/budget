import { LitElement, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import { accountById, resolveAccountLabel } from '../dao/accounts.js';
import { listCurrentPots } from '../dao/pots.js';

const Base = typeof HTMLElement !== 'undefined' ? LitElement : (class {} as unknown as typeof LitElement);

/**
 * Re-allocate form (spec §5): move $/wk between two pots with one start date.
 * Dispatches realloc-save with {sourceKey, targetKey, amount, start};
 * realloc-cancel returns without saving. The pair-write itself runs in the
 * orchestrator via services.reallocate().
 */
export class BudgetReallocForm extends Base {
  static override styles = typeof HTMLElement !== 'undefined' ? [sharedStyles] as any : [];

  finance: any = null;
  pots: any[] = [];
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
      this.pots = await listCurrentPots(this.finance);
      this.accountLabels = await accountById(this.finance);
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
    return {
      sourceKey: v('#r-source'),
      targetKey: v('#r-target'),
      amount: Number(v('#r-amount')),
      start: v('#r-start'),
    };
  }

  override render(): unknown {
    if (typeof HTMLElement === 'undefined') return html``;
    const today = new Date().toISOString().slice(0, 10);
    const opt = (p: any) => {
      const acct = resolveAccountLabel(this.accountLabels, p.account_id);
      return html`<option value=${p.pot_key}>${p.label} — $${Number(p.weekly_amount || 0)}/wk${acct ? ' · ' + acct : ''}</option>`;
    };
    return html`
      <div class="view-scroll">
      <div class="topbar"><span class="crumb-current">Budget · Re-allocate</span></div>
      <div class="view-container"><div class="view-container-inner">
        <h1>Re-allocate</h1>
        ${this.error ? html`<p class="field-error">Error: ${this.error}</p>` : ''}
        <div class="section"><div class="section-body">
          <p class="empty">Move $/week from one pot to another. Both sides are written together with the same start date, so the trace never breaks.</p>
          <div class="grid-2">
            <div class="field"><label>From pot</label><select id="r-source">${this.pots.map(opt)}</select></div>
            <div class="field"><label>To pot</label><select id="r-target">${this.pots.map(opt)}</select></div>
            <div class="field"><label>Amount <span class="label-sub">$ / week</span></label><input id="r-amount" type="text" inputmode="decimal"></div>
            <div class="field"><label>Start date</label><input id="r-start" type="date" .value=${today}></div>
          </div>
          <div class="footer">
            <button class="btn btn-secondary" @click=${() => this.emit('realloc-cancel')}>Cancel</button>
            <button class="btn btn-primary" @click=${() => this.emit('realloc-save', this.collect())}>Move</button>
          </div>
        </div></div>
      </div></div>
      </div>
    `;
  }
}
