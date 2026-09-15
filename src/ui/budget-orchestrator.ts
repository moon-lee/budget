import { LitElement, css, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import { createAccount, updateAccount, setAccountActive } from '../dao/accounts.js';
import { archiveFlow, saveFlow } from '../dao/flows.js';
import { saveIncome } from '../dao/income.js';
import { archivePot, savePot } from '../dao/pots.js';
import { reallocate } from '../services/budget-service.js';
import { ExtensionLogger } from 'finance-logger';

const Base = typeof HTMLElement !== 'undefined' ? LitElement : (class {} as unknown as typeof LitElement);
const log = new ExtensionLogger('budget');

type Tag =
  | 'budget-overview'
  | 'budget-flows'
  | 'budget-accounts'
  | 'budget-pot-form'
  | 'budget-flow-form'
  | 'budget-realloc-form';

/**
 * Single-tab orchestrator (mortgage shape): view state + pushFinance +
 * mount-update retarget. Owns form state (which pot/flow is being edited,
 * where to return) and all Task-2 service calls.
 */
export class BudgetOrchestrator extends Base {
  static override styles = typeof HTMLElement !== 'undefined' ? [sharedStyles, css`#child{flex:1;min-height:0;display:block;overflow:hidden}`] as any : [];

  finance: any = null;
  view: Tag = 'budget-overview';
  mountData: Record<string, unknown> = {};
  error = '';
  private formEdit: any = null;
  private returnTo: Tag = 'budget-overview';

  async setFinance(f: any): Promise<void> {
    this.finance = f;
    await this.pushFinance();
  }

  async init(f: any, mount: Record<string, unknown> = {}): Promise<void> {
    this.finance = f;
    this.mountData = mount;
    // Target child arrives as mount.view (single-panel mounts) or legacy mount.viewId (dev dropdown).
    const v = (mount.view ?? mount.viewId) as string | undefined;
    if (v === 'budget' || v === 'budget-overview' || v === undefined) this.view = 'budget-overview';
    else if (v === 'budget-flows') this.view = 'budget-flows';
    else if (v === 'budget-accounts') this.view = 'budget-accounts';
    this.formEdit = null;
    await this.pushFinance();
  }

  navigate(tag: Tag): void {
    this.view = tag;
    (this as any).requestUpdate?.();
    void this.pushFinance();
  }

  private child(): any {
    const root = (this as any).renderRoot as ShadowRoot | undefined;
    return root?.querySelector('#child');
  }

  private async pushFinance(): Promise<void> {
    (this as any).requestUpdate?.();
    await Promise.resolve();
    const c = this.child() as any;
    if (c && this.finance && typeof c.setFinance === 'function') {
      try {
        if ((this.view === 'budget-pot-form' || this.view === 'budget-flow-form') && typeof c.init === 'function') {
          await c.init(this.finance, this.formEdit);
        } else {
          await c.setFinance(this.finance);
        }
      } catch (e: any) {
        this.error = String(e?.message || e);
      }
    }
  }

  private async refresh(): Promise<void> {
    this.error = '';
    await this.pushFinance();
  }

  override connectedCallback(): void {
    super.connectedCallback?.();
    const on = (name: string, fn: (d: any) => void) =>
      (this as any).addEventListener?.(name, (e: any) => fn(e?.detail));
    // pot requests
    on('pot-add-request', () => { this.formEdit = null; this.returnTo = 'budget-overview'; this.navigate('budget-pot-form'); });
    on('pot-edit-request', async (d: any) => {
      this.formEdit = await this.prefillPot(d?.key);
      this.returnTo = 'budget-overview';
      this.navigate('budget-pot-form');
    });
    on('pot-archive-request', (d: any) => void this.onArchivePot(d?.key));
    on('pot-create', (d: any) => void this.onSavePot(d, false));
    on('pot-edit', (d: any) => void this.onSavePot(d, true));
    on('pot-form-cancel', () => this.navigate(this.returnTo));
    // flow requests
    on('flow-add-request', () => { this.formEdit = null; this.returnTo = 'budget-flows'; this.navigate('budget-flow-form'); });
    on('flow-edit-request', async (d: any) => {
      this.formEdit = await this.prefillFlow(d?.key);
      this.returnTo = 'budget-flows';
      this.navigate('budget-flow-form');
    });
    on('flow-archive-request', (d: any) => void this.onArchiveFlow(d?.key));
    on('flow-create', (d: any) => void this.onSaveFlow(d, false));
    on('flow-edit', (d: any) => void this.onSaveFlow(d, true));
    on('flow-form-cancel', () => this.navigate(this.returnTo));
    // re-allocate
    on('realloc-request', () => { this.returnTo = 'budget-overview'; this.navigate('budget-realloc-form'); });
    on('realloc-save', (d: any) => void this.onRealloc(d));
    on('realloc-cancel', () => this.navigate(this.returnTo));
    // accounts
    on('account-create', (d: any) => void this.onAccountCreate(d));
    on('account-edit', (d: any) => void this.onAccountEdit(d));
    on('account-toggle', (d: any) => void this.onAccountToggle(d));
  }

  private async prefillPot(key: string): Promise<any> {
    if (!key || !this.finance) return { key };
    try {
      const rows = (await this.finance.db.table('budget_pots').find({ pot_key: key })) as any[];
      const cur = rows.find((r) => r.effective_to == null) ?? rows[0];
      return cur ? { key, row: cur } : { key };
    } catch {
      return { key };
    }
  }

  private async prefillFlow(key: string): Promise<any> {
    if (!key || !this.finance) return { key };
    try {
      const rows = (await this.finance.db.table('budget_flows').find({ flow_key: key })) as any[];
      const cur = rows.find((r) => r.effective_to == null) ?? rows[0];
      return cur ? { key, row: cur } : { key };
    } catch {
      return { key };
    }
  }

  private static today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private async onSavePot(detail: any, isEdit: boolean): Promise<void> {
    if (!this.finance) return;
    try {
      const key = String(detail?.key ?? this.formEdit?.key ?? '').trim();
      if (!key) throw new Error('ValidationFailed: pot key is required');
      await savePot(this.finance, key, (detail?.patch ?? {}) as Record<string, unknown>, String(detail?.start || BudgetOrchestrator.today()));
      this.formEdit = null;
      this.navigate(this.returnTo);
    } catch (e: any) {
      this.error = String(e?.message || e);
      log.error(isEdit ? 'pot edit failed' : 'pot create failed', { error: this.error });
      (this as any).requestUpdate?.();
    }
  }

  private async onArchivePot(key: string): Promise<void> {
    if (!this.finance || !key) return;
    try {
      await archivePot(this.finance, key, BudgetOrchestrator.today());
      await this.refresh();
    } catch (e: any) {
      this.error = String(e?.message || e);
      (this as any).requestUpdate?.();
    }
  }

  private async onSaveFlow(detail: any, isEdit: boolean): Promise<void> {
    if (!this.finance) return;
    try {
      const key = String(detail?.key ?? this.formEdit?.key ?? '').trim();
      if (!key) throw new Error('ValidationFailed: flow key is required');
      await saveFlow(this.finance, key, (detail?.patch ?? {}) as Record<string, unknown>, String(detail?.start || BudgetOrchestrator.today()));
      this.formEdit = null;
      this.navigate(this.returnTo);
    } catch (e: any) {
      this.error = String(e?.message || e);
      log.error(isEdit ? 'flow edit failed' : 'flow create failed', { error: this.error });
      (this as any).requestUpdate?.();
    }
  }

  private async onArchiveFlow(key: string): Promise<void> {
    if (!this.finance || !key) return;
    try {
      await archiveFlow(this.finance, key, BudgetOrchestrator.today());
      await this.refresh();
    } catch (e: any) {
      this.error = String(e?.message || e);
      (this as any).requestUpdate?.();
    }
  }

  private async onRealloc(detail: any): Promise<void> {
    if (!this.finance) return;
    try {
      await reallocate(
        this.finance,
        String(detail?.sourceKey ?? ''),
        String(detail?.targetKey ?? ''),
        Number(detail?.amount),
        String(detail?.start || BudgetOrchestrator.today())
      );
      this.navigate(this.returnTo);
    } catch (e: any) {
      this.error = String(e?.message || e);
      log.error('reallocate failed', { error: this.error });
      (this as any).requestUpdate?.();
    }
  }

  private async onAccountCreate(input: any): Promise<void> {
    if (!this.finance) return;
    try {
      await createAccount(this.finance, input);
      await this.refresh();
    } catch (e: any) {
      this.error = String(e?.message || e);
      (this as any).requestUpdate?.();
    }
  }

  private async onAccountEdit(detail: any): Promise<void> {
    if (!this.finance) return;
    try {
      await updateAccount(this.finance, detail.id, { label: detail.label, bank: detail.bank ?? undefined });
      await this.refresh();
    } catch (e: any) {
      this.error = String(e?.message || e);
      (this as any).requestUpdate?.();
    }
  }

  private async onAccountToggle(detail: any): Promise<void> {
    if (!this.finance) return;
    try {
      await setAccountActive(this.finance, detail.id, Boolean(detail.active));
      await this.refresh();
    } catch (e: any) {
      this.error = String(e?.message || e);
      (this as any).requestUpdate?.();
    }
  }

  /** Income fallback editor hook (Task 3 UI does not surface this yet; exposed for future use). */
  async saveManualIncome(financeYear: string, weeklyAmount: number): Promise<void> {
    if (!this.finance) return;
    await saveIncome(this.finance, financeYear, weeklyAmount);
    await this.refresh();
  }

  override render(): unknown {
    if (typeof HTMLElement === 'undefined') return html``;
    return html`
      <div class="shell">
      ${this.error ? html`<div class="view-container"><div class="view-container-inner"><p class="field-error">Error: ${this.error}</p></div></div>` : ''}
      ${this.view === 'budget-overview' ? html`<budget-overview id="child"></budget-overview>` : ''}
      ${this.view === 'budget-flows' ? html`<budget-flows id="child"></budget-flows>` : ''}
      ${this.view === 'budget-accounts' ? html`<budget-accounts id="child"></budget-accounts>` : ''}
      ${this.view === 'budget-pot-form' ? html`<budget-pot-form id="child"></budget-pot-form>` : ''}
      ${this.view === 'budget-flow-form' ? html`<budget-flow-form id="child"></budget-flow-form>` : ''}
      ${this.view === 'budget-realloc-form' ? html`<budget-realloc-form id="child"></budget-realloc-form>` : ''}
      </div>
    `;
  }
}
