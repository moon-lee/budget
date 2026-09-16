import { LitElement, css, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';
import { createAccount, updateAccount, setAccountActive } from '../dao/accounts.js';
import { archiveFlow, saveFlow } from '../dao/flows.js';
import { saveIncome } from '../dao/income.js';
import { archivePot, savePot } from '../dao/pots.js';
import { syncFlowsForAccount } from '../services/budget-service.js';
import { CANONICAL_SECTION_ORDER, normalizeSectionOrder, type OverviewSectionId } from './overview-sections.js';
import { ExtensionLogger } from 'finance-logger';

const Base = typeof HTMLElement !== 'undefined' ? LitElement : (class {} as unknown as typeof LitElement);
const log = new ExtensionLogger('budget');

type Tag =
  | 'budget-overview'
  | 'budget-accounts'
  | 'budget-pot-form'
  | 'budget-flow-form'
  | 'reorder-sections-modal';

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
  sectionOrder: OverviewSectionId[] = [...CANONICAL_SECTION_ORDER];

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
    else if (v === 'budget-flows') this.view = 'budget-overview'; // folded into Overview (Pay-day moves group)
    else if (v === 'budget-accounts') this.view = 'budget-accounts';
    this.formEdit = null;
    try {
      const saved = await f.settings.get('budget.sectionOrder');
      this.sectionOrder = normalizeSectionOrder(typeof saved === 'string' ? JSON.parse(saved) : saved);
    } catch { this.sectionOrder = [...CANONICAL_SECTION_ORDER]; }
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
    if (c && this.finance) {
      try {
        if ('sectionOrder' in c) c.sectionOrder = [...this.sectionOrder];
        // Host-computed live income rides in mountData (openCommand path).
        if ('liveIncome' in c) {
          const v = Number((this.mountData as Record<string, unknown>)?.liveIncome ?? NaN);
          c.liveIncome = Number.isFinite(v) && v > 0 ? v : null;
        }
        // Host-computed latest payslip net rides alongside (reference-only).
        if ('latestNet' in c) {
          const ln = (this.mountData as Record<string, unknown>)?.latestNet as { net?: unknown; pay_date?: unknown } | null;
          const net = Number(ln?.net ?? NaN);
          c.latestNet = Number.isFinite(net) && net > 0 && typeof ln?.pay_date === 'string' && ln.pay_date
            ? { net, pay_date: ln.pay_date }
            : null;
        }
      } catch { /* child without section order / live income */ }
    }
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
    on('pot-archive-bulk', (d: any) => void this.onArchivePotBulk(d?.keys));
    on('pot-create', (d: any) => void this.onSavePot(d, false));
    on('pot-edit', (d: any) => void this.onSavePot(d, true));
    on('pot-form-cancel', () => this.navigate(this.returnTo));
    // flow requests (moves live inside Overview; forms return there)
    on('flow-add-request', () => { this.formEdit = null; this.returnTo = 'budget-overview'; this.navigate('budget-flow-form'); });
    on('flow-edit-request', async (d: any) => {
      this.formEdit = await this.prefillFlow(d?.key);
      this.returnTo = 'budget-overview';
      this.navigate('budget-flow-form');
    });
    on('flow-archive-request', (d: any) => void this.onArchiveFlow(d?.key));
    on('flow-archive-bulk', (d: any) => void this.onArchiveFlowBulk(d?.keys));
    on('flow-create', (d: any) => void this.onSaveFlow(d, false));
    on('flow-edit', (d: any) => void this.onSaveFlow(d, true));
    on('flow-form-cancel', () => this.navigate(this.returnTo));
    on('income-save', (d: any) => void this.saveManualIncome(String(d?.financeYear ?? ''), Number(d?.weeklyAmount)));
    // accounts
    on('account-create', (d: any) => void this.onAccountCreate(d));
    on('account-edit', (d: any) => void this.onAccountEdit(d));
    on('account-toggle', (d: any) => void this.onAccountToggle(d));
    on('reorder-sections', () => this.navigate('reorder-sections-modal'));
    on('section-order-cancel', () => this.navigate('budget-overview'));
    on('section-order-change', (d: any) => void this.onSectionOrderChange(d));
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
      const start = String(detail?.start || BudgetOrchestrator.today());
      await savePot(this.finance, key, (detail?.patch ?? {}) as Record<string, unknown>, start);
      await this.syncMovesForPot(key, start);
      this.formEdit = null;
      this.navigate(this.returnTo);
    } catch (e: any) {
      this.error = String(e?.message || e);
      log.error(isEdit ? 'pot edit failed' : 'pot create failed', { error: this.error });
      (this as any).requestUpdate?.();
    }
  }

  /**
   * One-way sync hook: after a pot save/archive, bring that pot's account
   * move total in line (1:1 accounts, or label-matched flow on shared hubs;
   * ambiguous/no-flow stay manual). The pot write always commits first —
   * sync failures never roll it back.
   */
  private async syncMovesForPot(potKey: string, start: string): Promise<void> {
    try {
      const rows = (await this.finance.db.table('budget_pots').find({ pot_key: potKey })) as any[];
      const accountId = rows.length > 0 ? (rows[0] as any).account_id : null;
      const outcome = await syncFlowsForAccount(this.finance, accountId, start, potKey);
      if (outcome.synced) {
        log.info('auto-sync move', {
          accountId: outcome.accountId,
          flowKey: outcome.flowKey,
          mode: outcome.mode,
          from: outcome.moved,
          to: outcome.planned,
        });
      }
    } catch (e: any) {
      // Sync is best-effort: the pot write already committed. Surface the
      // mismatch highlight instead of failing the save.
      log.error('auto-sync move failed', { potKey, error: String(e?.message || e) });
    }
  }

  private async onArchivePot(key: string): Promise<void> {
    if (!this.finance || !key) return;
    try {
      await archivePot(this.finance, key, BudgetOrchestrator.today());
      await this.syncMovesForPot(key, BudgetOrchestrator.today());
      await this.refresh();
    } catch (e: any) {
      this.error = String(e?.message || e);
      (this as any).requestUpdate?.();
    }
  }

  /** Bulk archive: per-row close, sync each touched account once, refresh once. */
  private async onArchivePotBulk(keys: unknown): Promise<void> {
    if (!this.finance || !Array.isArray(keys) || keys.length === 0) return;
    const failed: string[] = [];
    const syncedAccounts = new Set<number>();
    for (const key of keys) {
      try {
        await archivePot(this.finance, String(key), BudgetOrchestrator.today());
        const rows = (await this.finance.db.table('budget_pots').find({ pot_key: String(key) })) as any[];
        const accountId = rows.length > 0 ? Number((rows[0] as any).account_id) : NaN;
        if (Number.isInteger(accountId) && !syncedAccounts.has(accountId)) {
          syncedAccounts.add(accountId);
          await this.syncMovesForPot(String(key), BudgetOrchestrator.today());
        }
      } catch {
        failed.push(String(key));
      }
    }
    if (failed.length > 0) this.error = `Archive failed for: ${failed.join(', ')}`;
    await this.refresh();
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

  /** Bulk archive: per-row close, collect failures, refresh once. Others still complete. */
  private async onArchiveFlowBulk(keys: unknown): Promise<void> {
    if (!this.finance || !Array.isArray(keys) || keys.length === 0) return;
    const failed: string[] = [];
    for (const key of keys) {
      try {
        await archiveFlow(this.finance, String(key), BudgetOrchestrator.today());
      } catch {
        failed.push(String(key));
      }
    }
    if (failed.length > 0) this.error = `Archive failed for: ${failed.join(', ')}`;
    await this.refresh();
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

  /** Income fallback editor: writes the manual row, surfaces validation errors. */
  async saveManualIncome(financeYear: string, weeklyAmount: number): Promise<void> {
    if (!this.finance) return;
    try {
      await saveIncome(this.finance, financeYear, weeklyAmount);
      await this.refresh();
    } catch (e: any) {
      this.error = String(e?.message || e);
      log.error('manual income save failed', { error: this.error });
      (this as any).requestUpdate?.();
    }
  }

  private async onSectionOrderChange(order: unknown): Promise<void> {
    this.sectionOrder = normalizeSectionOrder(order);
    if (this.finance) {
      try {
        await this.finance.settings.set('budget.sectionOrder', JSON.stringify(this.sectionOrder));
      } catch (e: any) {
        log.error('persist sectionOrder failed', { error: String(e?.message || e) });
      }
    }
    this.navigate('budget-overview');
  }

  override render(): unknown {
    if (typeof HTMLElement === 'undefined') return html``;
    return html`
      <div class="shell">
      ${this.error ? html`<div class="view-container"><div class="view-container-inner"><p class="field-error">Error: ${this.error}</p></div></div>` : ''}
      ${this.view === 'budget-overview' ? html`<budget-overview id="child"></budget-overview>` : ''}
      ${this.view === 'budget-accounts' ? html`<budget-accounts id="child"></budget-accounts>` : ''}
      ${this.view === 'budget-pot-form' ? html`<budget-pot-form id="child"></budget-pot-form>` : ''}
      ${this.view === 'budget-flow-form' ? html`<budget-flow-form id="child"></budget-flow-form>` : ''}
      ${this.view === 'reorder-sections-modal' ? html`<reorder-sections-modal id="child" .sectionOrder=${this.sectionOrder}></reorder-sections-modal>` : ''}
      </div>
    `;
  }
}
