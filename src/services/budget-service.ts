/**
 * Budget domain service skeleton (Task 1).
 * Full dated-row + re-allocate + balance logic lands in Task 2.
 * Yearly = weekly × 52, derived on read, never stored.
 */

async function listCurrentPots(finance: any): Promise<any[]> {
  const rows = (await finance.db.table('budget_pots').find({})) as any[];
  return rows.filter((r) => r.effective_to == null);
}

async function listCurrentFlows(finance: any): Promise<any[]> {
  const rows = (await finance.db.table('budget_flows').find({})) as any[];
  return rows.filter((r) => r.effective_to == null);
}

function yearly(weekly: number): number {
  return Math.round(weekly * 52 * 100) / 100;
}

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

export async function totals(finance: any): Promise<{
  income_weekly: number;
  savings_weekly: number;
  expenses_weekly: number;
  balance_weekly: number;
} | null> {
  try {
    const pots = await listCurrentPots(finance);
    const s = pots
      .filter((p) => p.kind === 'saving')
      .reduce((n: number, p: any) => n + Number(p.weekly_amount || 0), 0);
    const e = pots
      .filter((p) => p.kind === 'expense')
      .reduce((n: number, p: any) => n + Number(p.weekly_amount || 0), 0);
    // Income resolution (live `pay` service) lands in Task 2; skeleton reports 0.
    const income = 0;
    return {
      income_weekly: income,
      savings_weekly: s,
      expenses_weekly: e,
      balance_weekly: Math.round((income - s - e) * 100) / 100,
    };
  } catch {
    return null;
  }
}
