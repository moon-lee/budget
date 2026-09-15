/**
 * Budget domain service (spec §5–§7).
 * - Dated-row close+insert via `dao/pots.ts` + `dao/flows.ts`
 * - Balance check: income vs savings + expenses
 * - Per-item FY totals for consumers; yearly = weekly × 52, derived on read
 * - Income live from `pay` service with `budget_income` fallback; null when missing
 * - Never throws across the service boundary — service-facing wrappers catch and return null
 */
import { listCurrentFlows } from '../dao/flows.js';
import { getIncome, getLatestIncome } from '../dao/income.js';
import { archivePot, listCurrentPots, listPotHistory, savePot } from '../dao/pots.js';

function yearly(weekly: number): number {
  return Math.round(weekly * 52 * 100) / 100;
}

/**
 * Weekly income run-rate (§6): live `pay.getPayslipStats().avgNet` when the
 * Salary extension is present, else the manual `budget_income` row.
 * `financeYear` selects the manual row; without one the latest manual row wins.
 */
export async function incomeWeekly(finance: any, financeYear?: string): Promise<number> {
  try {
    const stats = (await finance.services?.invoke?.('pay', 'getPayslipStats')) as {
      avgNet?: unknown;
    } | null;
    const avg = Number(stats?.avgNet ?? NaN);
    if (Number.isFinite(avg) && avg > 0) return Math.round(avg * 100) / 100;
  } catch {
    /* fall through to manual */
  }
  try {
    const row = financeYear ? await getIncome(finance, financeYear) : await getLatestIncome(finance);
    if (row) return Math.round(Number(row.weekly_amount || 0) * 100) / 100;
  } catch {
    /* no manual row */
  }
  return 0;
}

export interface BalanceCheck {
  income_weekly: number;
  savings_weekly: number;
  expenses_weekly: number;
  balance_weekly: number;
  moves_weekly: number;
  /** Planned out (savings + expenses) minus moved (Friday + Sunday). 0 = reconciled. */
  moves_gap_weekly: number;
}

export async function balanceCheck(finance: any, financeYear?: string): Promise<BalanceCheck> {
  const income = await incomeWeekly(finance, financeYear);
  const pots = await listCurrentPots(finance);
  const s = pots
    .filter((p) => p.kind === 'saving')
    .reduce((n: number, p: any) => n + Number(p.weekly_amount || 0), 0);
  const e = pots
    .filter((p) => p.kind === 'expense')
    .reduce((n: number, p: any) => n + Number(p.weekly_amount || 0), 0);
  const flows = await listCurrentFlows(finance);
  const m = flows.reduce((n: number, f: any) => n + Number(f.weekly_amount || 0), 0);
  const out = Math.round((s + e) * 100) / 100;
  const moved = Math.round(m * 100) / 100;
  return {
    income_weekly: income,
    savings_weekly: Math.round(s * 100) / 100,
    expenses_weekly: Math.round(e * 100) / 100,
    balance_weekly: Math.round((income - s - e) * 100) / 100,
    moves_weekly: moved,
    moves_gap_weekly: Math.round((out - moved) * 100) / 100,
  };
}

/** Consumer surface (§7): per-item FY total, null when missing — never throws. */
export async function potYearly(
  finance: any,
  key: string
): Promise<{ key: string; weekly_amount: number; yearly_amount: number } | null> {
  try {
    const pots = await listCurrentPots(finance);
    const row = pots.find((p) => p.pot_key === key);
    if (!row) return null;
    const w = Number(row.weekly_amount || 0);
    return { key, weekly_amount: w, yearly_amount: yearly(w) };
  } catch {
    return null;
  }
}

/** Consumer surface (§7): per-flow yearly total, null when missing — never throws. */
export async function flowYearly(
  finance: any,
  key: string
): Promise<{ key: string; weekly_amount: number; yearly_amount: number } | null> {
  try {
    const flows = await listCurrentFlows(finance);
    const row = flows.find((f) => f.flow_key === key);
    if (!row) return null;
    const w = Number(row.weekly_amount || 0);
    return { key, weekly_amount: w, yearly_amount: yearly(w) };
  } catch {
    return null;
  }
}

/** Consumer surface (§7): plan totals, null only on DB failure — never throws. */
export async function totals(finance: any): Promise<BalanceCheck | null> {
  try {
    return await balanceCheck(finance);
  } catch {
    return null;
  }
}

export { archivePot, listCurrentFlows, listCurrentPots, listPotHistory, savePot };
