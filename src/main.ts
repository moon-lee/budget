import type { FinanceApi } from 'finance';
import { ExtensionLogger } from 'finance-logger';
import './styles/ext-tokens.css';
import { seedBudget } from './services/seed.js';
import { incomeWeekly, latestNetWeekly } from './services/budget-service.js';
import { createBudgetDomainService } from './services/budget-domain-service.js';

const logger = new ExtensionLogger('budget');

export async function registerUIComponents(): Promise<void> {
  if (typeof window !== 'undefined') await import('./ui/index.js');
}

let _finance: FinanceApi | null = null;

function openView(tag: string): () => Promise<void> {
  return async () => {
    if (!_finance) return;
    // Single panel identity ('budget' → tab always "Budget"); target child rides in mountData.view.
    await _finance.ui?.requestMount('budget', { view: tag });
  };
}

export async function activate(finance: FinanceApi, ctx: { viewId?: string } & Record<string, unknown> = {}): Promise<void> {
  _finance = finance;
  logger.info('activate budget', { viewId: ctx.viewId });

  // Nav-bar Refresh (Quick Links group), same pattern as taxflow. pushData
  // rather than requestMount: the latter would create the panel if it were
  // closed, popping a view the user had deliberately shut. Dropped when nothing
  // is mounted, which is what a Refresh item should do.
  finance.commands.registerCommand('budget.refresh', 'Refresh Budget', async () => {
    // Host-resolved live figures: the panel's services.invoke is a sandbox
    // no-op, so pay data must be resolved here where real bindings exist.
    let liveIncome: number | null = null;
    let latestNet: { net: number; pay_date: string } | null = null;
    try {
      const weekly = await incomeWeekly(_finance as any);
      if (Number.isFinite(weekly) && weekly > 0) liveIncome = weekly;
    } catch (e: any) {
      logger.error('refresh: live income resolve failed', { error: String(e?.message || e) });
    }
    try {
      latestNet = await latestNetWeekly(_finance as any);
    } catch (e: any) {
      logger.error('refresh: latest net resolve failed', { error: String(e?.message || e) });
    }
    try {
      await finance.ui?.pushData?.('budget', { refreshedAt: Date.now(), liveIncome, latestNet, });
    } catch (err) {
      logger.error('budget refresh failed', err);
    }
  });
  await seedBudget(finance as any);

  finance.commands.registerCommand('budget.show-overview', 'Budget: Overview', openView('budget-overview'));
  finance.commands.registerCommand('budget.show-accounts', 'Budget: Accounts', openView('budget-accounts'));

  // Host-computed income (Dashboard openCommand pattern): the panel's
  // services.invoke is a sandbox no-op, so live `pay` figures must be
  // resolved here where real service bindings exist, then ride in mountData.
  finance.commands.registerCommand('budget.open-overview', 'Budget: Open Overview', async () => {
    if (!_finance) return;
    let liveIncome: number | null = null;
    let latestNet: { net: number; pay_date: string } | null = null;
    try {
      const weekly = await incomeWeekly(_finance as any);
      if (Number.isFinite(weekly) && weekly > 0) liveIncome = weekly;
    } catch (e: any) {
      logger.error('live income resolve failed', { error: String(e?.message || e) });
    }
    try {
      latestNet = await latestNetWeekly(_finance as any);
    } catch (e: any) {
      logger.error('latest net resolve failed', { error: String(e?.message || e) });
    }
    await _finance.ui?.requestMount('budget', { view: 'budget-overview', liveIncome, latestNet });
  });

  finance.services.register('budget', createBudgetDomainService(finance));

  if (typeof window !== 'undefined') await import('./ui/index.js');
  if (ctx.viewId && typeof document !== 'undefined') {
    const app = document.getElementById('app');
    if (app) {
      const el = document.createElement('budget-orchestrator') as any;
      app.innerHTML = '';
      app.appendChild(el);
      const baseData = { viewId: ctx.viewId, ...(ctx as Record<string, unknown>) };
      const mountEl = () => {
        if (typeof el.init === 'function') void el.init(finance, baseData);
        else if (typeof el.setFinance === 'function') void el.setFinance(finance);
        else el.finance = finance;
      };
      queueMicrotask(mountEl);
      setTimeout(() => {
        if (el.finance == null && typeof el.setFinance === 'function') void el.setFinance(finance);
      }, 50);
      // Retargets to the open panel (sidebar nav while mounted) arrive here from panel-bootstrap.
      app.addEventListener('mount-update', (e: Event) => {
        const detail = (e as CustomEvent).detail as Record<string, unknown>;
        if (typeof el.init === 'function') void el.init(finance, { ...baseData, ...(detail ?? {}) });
      });
    }
  }
}

export function deactivate(): void {
  if (_finance) _finance.services.unregister('budget');
  logger.info('deactivate budget');
}
