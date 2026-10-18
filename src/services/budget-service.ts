/**
 * Budget domain service (spec §5–§7).
 * - Dated-row close+insert via `dao/pots.ts` + `dao/flows.ts`
 * - Balance check: income vs savings + expenses
 * - Per-item FY totals for consumers; yearly = weekly × 52, derived on read
 * - Income live from `pay` service with `budget_income` fallback; null when missing
 * - Never throws across the service boundary — service-facing wrappers catch and return null
 */
import { listCurrentFlows, saveFlow } from '../dao/flows.js';
import { accountById, resolveAccountLabel } from '../dao/accounts.js';
import { getIncome, getLatestIncome } from '../dao/income.js';
import { archivePot, listCurrentPots, listPotHistory, savePot } from '../dao/pots.js';

function yearly(weekly: number): number {
  return Math.round(weekly * 52 * 100) / 100;
}

/** Exported so the pot form's "per year" hint uses the same month count. */
export const MONTHS_PER_YEAR = 12;
/** 365.2425 / 7 — the mean solar year, used for annual-provision figures. */
export const WEEKS_PER_YEAR = 365.2425 / 7;
/**
 * The divisor for monthly entry: a flat 4 weeks per month.
 *
 * A real mean month is 4.348 weeks, so this over-provisions every monthly line
 * by ~8.7% on the expense side. That is the deliberate trade - a budget plan is
 * allowed to sit over budget on expenses, and the simple rule is easier to
 * reason about and to reproduce by hand than a mean-year fraction.
 */
export const WEEKS_PER_MONTH = 4;

/**
 * Monthly → weekly (rounding revised 2026-10-08, divisor revised 2026-10-09).
 *
 * Most expenses are quoted monthly (power, mobile, insurance, rego) but every
 * consumer of `weekly_amount` is weekly, so monthly is an entry convenience
 * that divides once here — by a flat 4 weeks per month.
 *
 * ## Why 4 and not the mean 4.348
 *
 * Dividing by the true mean month gives the tightest possible weekly figure,
 * but it is a fraction the user cannot reproduce by hand, and it leaves the
 * plan sitting exactly on the bill with no margin. A flat 4 is simple to
 * explain, easy to check against a real payslip, and errs toward over-budget
 * on the expense side — which is the safe direction. A line that is entered
 * monthly is deliberately given a little headroom.
 *
 * ## Rounds UP to whole dollars, deliberately
 *
 * The weekly figure is the amount actually set aside each week, so it must
 * never come to less than the monthly bill implies. Ceil to the dollar, not to
 * the cent and not to nearest: a whole-dollar set-aside is what the user moves,
 * so fractional dollars are noise in both the plan and the move.
 *
 * e.g. $160/month => $40/week; $275.50/month => $69/week.
 *
 * ## What this costs
 *
 * Over-provisioning is proportional, roughly 8.7% of the bill plus up to $0.99
 * of ceil — on $275.50/month that is ~$294/year banked rather than spent. Unlike
 * the previous mean-year divisor there is no per-line cap, because the divisor
 * itself is short. Accepted deliberately: idle cash is recoverable, a shortfall
 * is not, and any line can be switched to weekly entry when exactness matters.
 *
 * Reconstructing a monthly amount from the stored weekly figure cannot be exact,
 * since the cadence is not persisted.
 */
export function monthlyToWeekly(monthly: number): number {
  const m = Number(monthly);
  if (!Number.isFinite(m)) return 0;
  // Clamp at 0 first so a negative input cannot produce "-0".
  const perWeek = Math.max(0, m / WEEKS_PER_MONTH);
  return Math.ceil(perWeek);
}

/**
 * Annual cost actually provisioned by a weekly set-aside, over the mean
 * year. Differs from `yearly()` (x 52) by the 0.33% week-count gap, and from
 * the bill by the 4-week divisor and the ceiling — both are real, so the UI
 * shows this rather than the bill when explaining a monthly line.
 */
export function weeklyProvisionYearly(weekly: number): number {
  const w = Number(weekly);
  if (!Number.isFinite(w)) return 0;
  return Math.round(Math.max(0, w) * WEEKS_PER_YEAR * 100) / 100;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Standard gross for a week, from the current pay rate.
 *
 * Mirrors salary-history's `standardGrossForRate`: standard hours at the base
 * rate, plus any shift allowance. Overtime is excluded - a budget plans a
 * normal week, not a week with overtime.
 *
 * Returns 0 for a rate that cannot produce a positive week (e.g. the
 * un-seeded default row, whose `base_hourly_rate` is 0), so callers can fall
 * back rather than trust a zero baseline.
 */
export function standardWeeklyGross(rate: any): number {
  const hours = Number(rate?.standard_hours_per_week ?? 0);
  const base = Number(rate?.base_hourly_rate ?? 0);
  if (!Number.isFinite(hours) || !Number.isFinite(base) || hours <= 0 || base <= 0) return 0;
  const shiftHours = Number(rate?.shift_allowance_hours_per_week ?? 0);
  const shiftMult = Number(rate?.shift_allowance_multiplier ?? 0);
  const shift =
    Number.isFinite(shiftHours) && Number.isFinite(shiftMult) && shiftHours > 0 && shiftMult > 0
      ? shiftHours * base * shiftMult
      : 0;
  return round2(hours * base + shift);
}

/**
 * Standard weekly NET: standard gross at the current rate, less tax at the
 * net-to-gross ratio your real payslips actually show.
 *
 * The ratio comes from the payslips rather than a tax table because the only
 * gross-to-net helper Salary exposes (`calculateNetFromGross`) is a documented
 * placeholder that ignores HELP debt, salary sacrifice and other deductions.
 * Your own payslips already have all of that applied, so their ratio is the
 * honest one to reuse - and it self-corrects when your deductions change.
 *
 * Returns 0 when either input is missing or unusable, so the caller can fall
 * back to the latest payslip net.
 */
export function standardWeeklyNet(rate: any, avgGross: unknown, avgNet: unknown): number {
  const gross = standardWeeklyGross(rate);
  if (gross <= 0) return 0;
  const g = Number(avgGross);
  const n = Number(avgNet);
  if (!Number.isFinite(g) || !Number.isFinite(n) || g <= 0) return 0;
  const ratio = n / g;
  // A net above gross is impossible; a negative or zero net is not a run-rate.
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 1) return 0;
  return round2(gross * ratio);
}

/**
 * Weekly income run-rate (§6).
 *
 * Preference order:
 *   1. `pay.getStandardWeeklyNet()` — Salary's normal-week take-home at the
 *      current rate. Forward-looking: a pay rise shows up immediately, and
 *      overtime / public-holiday / leave weeks are excluded from the tax ratio.
 *   2. the same maths computed locally from `getCurrentRate()` and
 *      `getPayslipStats()`, so an older Salary without the method does not
 *      silently regress the figure.
 *   3. the latest payslip net.
 *   4. the manual `budget_income` row.
 *
 * `getPayslipStats().avgNet` alone is NEVER the run-rate: it averages every
 * payslip ever recorded, so it drifts with old pay rates and is skewed by
 * whichever odd weeks are in the history.
 *
 * `financeYear` selects the manual row; without one the latest manual row wins.
 */
export async function incomeWeekly(finance: any, financeYear?: string): Promise<number> {
  const invoke = finance.services?.invoke;
  if (typeof invoke === 'function') {
    // 1. Salary's own implementation, when it exposes one.
    try {
      const fromPay = (await invoke('pay', 'getStandardWeeklyNet')) as { net?: unknown } | null;
      const net = Number(fromPay?.net ?? NaN);
      if (Number.isFinite(net) && net > 0) return round2(net);
    } catch {
      /* older Salary, or the service is unavailable */
    }
    // 2. Same formula, computed here for an older Salary.
    try {
      const [rate, stats] = await Promise.all([
        invoke('pay', 'getCurrentRate'),
        invoke('pay', 'getPayslipStats'),
      ]);
      const standard = standardWeeklyNet(
        rate,
        (stats as any)?.avgGross,
        (stats as any)?.avgNet
      );
      if (standard > 0) return standard;
    } catch {
      /* fall through to the latest payslip */
    }
    // 3. Latest actual payslip.
    try {
      const latest = (await invoke('pay', 'getLatestNet')) as { net?: unknown } | null;
      const net = Number(latest?.net ?? NaN);
      if (Number.isFinite(net) && net > 0) return round2(net);
    } catch {
      /* fall through to manual */
    }
  }
  try {
    const row = financeYear ? await getIncome(finance, financeYear) : await getLatestIncome(finance);
    if (row) return round2(Number(row.weekly_amount || 0));
  } catch {
    /* no manual row */
  }
  return 0;
}

export interface LatestNet {
  net: number;
  pay_date: string;
}

/**
 * Latest payslip net (§6 reference): `pay.getLatestNet()` when the Salary
 * extension is present, else null. Reference-only — never feeds the budget
 * figure; the Overview shows it as a sub-line under In/week.
 */
export async function latestNetWeekly(finance: any): Promise<LatestNet | null> {
  try {
    const latest = (await finance.services?.invoke?.('pay', 'getLatestNet')) as {
      net?: unknown;
      pay_date?: unknown;
    } | null;
    const net = Number(latest?.net ?? NaN);
    const date = String(latest?.pay_date ?? '');
    if (!Number.isFinite(net) || net <= 0 || !date) return null;
    return { net: Math.round(net * 100) / 100, pay_date: date };
  } catch {
    return null;
  }
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

export async function balanceCheck(
  finance: any,
  financeYear?: string,
  incomeOverride?: number
): Promise<BalanceCheck> {
  const override = Number(incomeOverride ?? NaN);
  const income = Number.isFinite(override) && override > 0 ? override : await incomeWeekly(finance, financeYear);
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

/** Consumer surface (§7): per-item FY total for expense pots only — savings
 *  pots are allocations, not spend, so they resolve to null like a missing
 *  key. Never throws. */
export async function potYearly(
  finance: any,
  key: string
): Promise<{ key: string; weekly_amount: number; yearly_amount: number } | null> {
  try {
    const pots = await listCurrentPots(finance);
    const row = pots.find((p) => p.pot_key === key && p.kind === 'expense');
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

export type SyncOutcome =
  | { synced: true; accountId: number; planned: number; moved: number; flowKey: string; mode: 'account' | 'label' }
  | { synced: false; reason: 'no-account' | 'no-flows' | 'ambiguous' | 'in-sync' | 'empty-plan' };

/**
 * One-way sync: plan side → move side, per account (spec §5 amendment 2026-09-16).
 * After a pot save/archive on `accountId`, bring that account's move total in
 * line with its planned total. Two tiers:
 * - Account tier: exactly ONE current flow on the account → set it to the
 *   account planned total. Zero flows means nothing to update; 2+ falls
 *   through to the label tier.
 * - Label tier: the edited pot's label matches exactly ONE flow on the same
 *   account (case-insensitive) → set that flow to the pot's own amount.
 *   Anything else stays `ambiguous` (caller keeps the mismatch highlight so
 *   the user fixes it by hand).
 * Planned 0 (last pot archived) writes the move to $0, keeping the slot alive.
 * Throws on validation/DB failure (orchestrator surfaces it); returns a
 * non-throwing outcome for the expected no-op cases.
 */
export async function syncFlowsForAccount(
  finance: any,
  accountId: number | null | undefined,
  start: string,
  potKey?: string
): Promise<SyncOutcome> {
  if (accountId == null) return { synced: false, reason: 'no-account' };
  const id = Number(accountId);
  const pots = (await listCurrentPots(finance)).filter((p) => Number(p.account_id) === id);
  const flows = (await listCurrentFlows(finance)).filter((f) => Number(f.account_id) === id);
  if (flows.length === 0) return { synced: false, reason: 'no-flows' };
  const planned = round2(pots.reduce((n: number, p: any) => n + Number(p.weekly_amount || 0), 0));
  if (pots.length === 0 && planned !== 0) return { synced: false, reason: 'empty-plan' };
  const accounts = await accountById(finance);
  const label = resolveAccountLabel(accounts, id) ?? `#${id}`;
  if (flows.length === 1) {
    const flow = flows[0];
    const moved = round2(Number(flow.weekly_amount || 0));
    if (moved === planned) return { synced: false, reason: 'in-sync' };
    await saveFlow(
      finance,
      flow.flow_key,
      {
        weekly_amount: planned,
        notes: `auto-sync ${start} ${label} plan $${planned}/wk`,
      },
      start
    );
    return { synced: true, accountId: id, planned, moved, flowKey: flow.flow_key, mode: 'account' };
  }
  // Label tier: the edited pot's label matches exactly one same-account flow.
  const pot = potKey ? pots.find((p) => p.pot_key === potKey) ?? null : null;
  const potLabel = pot ? String(pot.label || '').trim().toLowerCase() : '';
  const labelFlows = potLabel
    ? flows.filter((f) => String(f.label || '').trim().toLowerCase() === potLabel)
    : [];
  if (labelFlows.length !== 1) return { synced: false, reason: 'ambiguous' };
  const flow = labelFlows[0];
  const want = round2(Number(pot!.weekly_amount || 0));
  const moved = round2(Number(flow.weekly_amount || 0));
  if (moved === want) return { synced: false, reason: 'in-sync' };
  await saveFlow(
    finance,
    flow.flow_key,
    {
      weekly_amount: want,
      notes: `auto-sync ${start} ${label} ${pot!.label} $${want}/wk`,
    },
    start
  );
  return { synced: true, accountId: id, planned: want, moved, flowKey: flow.flow_key, mode: 'label' };
}

export { archivePot, listCurrentFlows, listCurrentPots, listPotHistory, savePot };
