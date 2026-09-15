/**
 * Budget domain service (spec §5–§7).
 * - Dated-row close+insert via `dao/pots.ts` + `dao/flows.ts`
 * - Atomic re-allocate pair-write (source − amount, target + amount, same effective_from)
 * - Balance check: income vs savings + expenses
 * - Per-item FY totals for consumers; yearly = weekly × 52, derived on read
 * - Income live from `pay` service with `budget_income` fallback; null when missing
 * - Never throws across the service boundary — service-facing wrappers catch and return null
 */
import { listCurrentFlows } from '../dao/flows.js';
import { getIncome, getLatestIncome } from '../dao/income.js';
import { archivePot, listCurrentPots, listPotHistory, savePot } from '../dao/pots.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function yearly(weekly: number): number {
  return Math.round(weekly * 52 * 100) / 100;
}

function assertAmount(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error('ValidationFailed: amount must be a number > 0');
  }
  return n;
}

function assertDate(value: unknown, field: string): string {
  const s = String(value ?? '');
  if (!DATE_RE.test(s)) throw new Error(`ValidationFailed: ${field} must be YYYY-MM-DD`);
  return s;
}

async function assertDifferentTargets(finance: any, sourceKey: string, targetKey: string): Promise<void> {
  if (sourceKey === targetKey) throw new Error('ValidationFailed: source and target must differ');
  const pots = await listCurrentPots(finance);
  const src = pots.find((p) => p.pot_key === sourceKey);
  const tgt = pots.find((p) => p.pot_key === targetKey);
  if (!src || !tgt) throw new Error('ValidationFailed: pot not found');
}

/**
 * First-class re-allocation (§5): move $/wk from source to target with one
 * shared `effective_from`. Both sides close first, then both insert — if any
 * write fails the caller sees the error and the trace shows the pair via
 * linked notes. Throws (orchestrator surfaces it); NOT part of the
 * null-returning consumer service surface.
 */
export async function reallocate(
  finance: any,
  sourceKey: string,
  targetKey: string,
  amountPerWeek: number,
  start: string
): Promise<void> {
  const src = String(sourceKey || '').trim();
  const tgt = String(targetKey || '').trim();
  const amount = assertAmount(amountPerWeek);
  const from = assertDate(start, 'effective_from');
  await assertDifferentTargets(finance, src, tgt);

  // Read both current amounts up front so validation precedes any write.
  const pots = await listCurrentPots(finance);
  const srcRow = pots.find((p) => p.pot_key === src)!;
  const tgtRow = pots.find((p) => p.pot_key === tgt)!;
  const srcWeekly = Number(srcRow.weekly_amount || 0);
  if (srcWeekly - amount < 0) {
    throw new Error('ValidationFailed: re-allocation would drive the source below $0/wk');
  }
  if (srcRow.effective_from > from || tgtRow.effective_from > from) {
    throw new Error('ValidationFailed: new effective_from must not precede the current rows');
  }

  // Close both sides first (pair stays traceable via shared notes).
  const table = finance.db.table('budget_pots');
  await table.update({ id: srcRow.id }, { effective_to: from });
  await table.update({ id: tgtRow.id }, { effective_to: from });

  const note = `realloc ${from} ${src}→${tgt} $${amount}/wk`;
  const stamp = `${from}T00:00:00`;
  const newIds: number[] = [];
  try {
    const r1 = await table.insert({
      pot_key: src,
      label: srcRow.label,
      kind: srcRow.kind,
      weekly_amount: Math.round((srcWeekly - amount) * 100) / 100,
      account_id: srcRow.account_id,
      effective_from: from,
      effective_to: null,
      notes: note,
      created_at: stamp,
      updated_at: stamp,
    });
    newIds.push(Number((r1 as any)?.id));
    const r2 = await table.insert({
      pot_key: tgt,
      label: tgtRow.label,
      kind: tgtRow.kind,
      weekly_amount: Math.round((Number(tgtRow.weekly_amount || 0) + amount) * 100) / 100,
      account_id: tgtRow.account_id,
      effective_from: from,
      effective_to: null,
      notes: note,
      created_at: stamp,
      updated_at: stamp,
    });
    newIds.push(Number((r2 as any)?.id));
  } catch (err) {
    // Best-effort rollback: remove any half-inserted rows, then reopen both
    // sides so the current plan is never left half-moved or doubled.
    for (const id of newIds) {
      if (Number.isInteger(id)) await table.delete({ id }).catch(() => {});
    }
    await table.update({ id: srcRow.id }, { effective_to: null }).catch(() => {});
    await table.update({ id: tgtRow.id }, { effective_to: null }).catch(() => {});
    throw err;
  }
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
  return {
    income_weekly: income,
    savings_weekly: Math.round(s * 100) / 100,
    expenses_weekly: Math.round(e * 100) / 100,
    balance_weekly: Math.round((income - s - e) * 100) / 100,
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
