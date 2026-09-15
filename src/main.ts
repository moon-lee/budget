import type { FinanceApi } from 'finance';
import { ExtensionLogger } from 'finance-logger';
import './styles/ext-tokens.css';
const logger = new ExtensionLogger('budget');
export async function registerUIComponents(): Promise<void> { if (typeof window !== 'undefined') await import('./ui/index.js'); }
let _finance: FinanceApi | null = null;
export async function activate(finance: FinanceApi, ctx: { viewId?: string } & Record<string, unknown> = {}): Promise<void> {
  _finance = finance;
  logger.info('activate budget', { viewId: ctx.viewId });
  // Single panel identity ('budget' → tab always "Budget"); extra screens ride as mountData.view.
  const openView = (childTag: string): (() => Promise<void>) => async () => {
    await finance.ui?.requestMount('budget', { view: childTag });
  };
  finance.commands.registerCommand('budget.hello', 'Budget: Hello', () => openView('budget-view')());
  // Example Domain Service — other extensions can call finance.services.invoke('budget','hello')
  // When you add tables (e.g. budget_items), add methods that use finance.db.table('budget_items').find/count/insert
  finance.services.register('budget', {
    hello: async (p?: unknown) => `Hello from budget: ${JSON.stringify(p ?? {})}`,
  });
  if (typeof window !== 'undefined') await import('./ui/index.js');
  if (ctx.viewId && typeof document !== 'undefined') {
    const app = document.getElementById('app');
    if (app) {
      // Without an orchestrator, mount the single view directly. When you add a
      // second child view (AGENTS.md §5b), replace this with a 'budget-orchestrator'
      // element that maps mount.view → child tag and handles 'mount-update' retargets.
      const viewEl = document.createElement('budget-view') as any;
      app.innerHTML = '';
      app.appendChild(viewEl);
      queueMicrotask(() => { if (typeof viewEl.setFinance === 'function') viewEl.setFinance(finance); else viewEl.finance = finance; });
      setTimeout(() => { if (viewEl.finance == null && typeof viewEl.setFinance === 'function') viewEl.setFinance(finance); }, 50);
    }
  }
}
export function deactivate(): void { if (_finance) _finance.services.unregister('budget'); logger.info('deactivate budget'); }
