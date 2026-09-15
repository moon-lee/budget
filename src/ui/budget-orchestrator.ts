import { LitElement, html } from 'lit';
import { sharedStyles } from '../styles/shared-styles.js';

const Base = typeof HTMLElement !== 'undefined' ? LitElement : (class {} as unknown as typeof LitElement);

/**
 * Task-1 placeholder orchestrator (single-panel identity, mortgage shape).
 * Task 3 replaces this with the full view-state + pushFinance + mount-update
 * orchestrator hosting budget-overview / budget-flows / budget-accounts children.
 */
export class BudgetOrchestrator extends Base {
  static override styles = typeof HTMLElement !== 'undefined' ? [sharedStyles] as any : [];

  finance: any = null;
  mount: Record<string, unknown> = {};

  init(finance: any, mount: Record<string, unknown> = {}): void {
    this.finance = finance;
    this.mount = mount;
    this.pushFinance();
  }

  setFinance(finance: any): void {
    this.finance = finance;
    this.pushFinance();
  }

  private pushFinance(): void {
    if (typeof customElements === 'undefined') return;
    this.updateComplete?.then(() => {
      const child = this.renderRoot?.querySelector?.('budget-view') as any;
      if (!child) return;
      if (typeof child.setFinance === 'function') child.setFinance(this.finance);
      else child.finance = this.finance;
    }).catch(() => {});
  }

  override render() {
    if (typeof HTMLElement === 'undefined') return html``;
    return html`<budget-view></budget-view>`;
  }
}
