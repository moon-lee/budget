/**
 * Cross-extension adapter for `finance.services.invoke('budget', ...)`.
 *
 * Extracted from `main.ts` so the service bridge is covered by `npm test`
 * (`tsconfig.test.json` compiles `src/services`, not `main.ts`, which pulls
 * in CSS and Lit elements).
 *
 * The Host marshals `params` before calling an impl
 * (`D:/finance_flow_ai/src/extension-host/api/services.ts`): an array spreads
 * as-is, a plain object becomes `Object.values(params)`. So a caller writing
 * `invoke('budget', 'potYearly', { key })` has the bare string `key` delivered
 * as the first positional argument — never an object. Every method here
 * therefore accepts both shapes.
 */
import type { FinanceApi } from 'finance';
import {
  flowYearly,
  potYearly,
  totals,
  type BalanceCheck,
} from './budget-service.js';

export interface BudgetItemYearly {
  key: string;
  weekly_amount: number;
  yearly_amount: number;
}

export interface BudgetService {
  potYearly(p?: unknown): Promise<BudgetItemYearly | null>;
  flowYearly(p?: unknown): Promise<BudgetItemYearly | null>;
  totals(): Promise<BalanceCheck | null>;
}

/**
 * Read the `key` from whatever the Host delivered.
 *
 * Callers write `invoke('budget', 'potYearly', { key })`, but the Host spreads
 * a non-array `params` through `Object.values()` before the call, so `p` is the
 * bare string in the installed app and the object only in dev. Accepting both
 * keeps the service working under either marshaller. `''` matches no key, which
 * is the same `null` result an unknown key produces.
 */
export function keyOf(p?: unknown): string {
  if (typeof p === 'string') return p;
  const key = (p as { key?: unknown } | null | undefined)?.key;
  return typeof key === 'string' ? key : '';
}

export function createBudgetDomainService(finance: FinanceApi): BudgetService {
  return {
    potYearly: async (p?: unknown) => potYearly(finance, keyOf(p)),
    flowYearly: async (p?: unknown) => flowYearly(finance, keyOf(p)),
    totals: async () => totals(finance),
  };
}
