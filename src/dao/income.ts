/**
 * DAO for `budget_income` — manual income fallback (spec §4.4).
 * One row per `finance_year`, no dated rows; upserted in place.
 * Only used when the Salary `pay` service is missing.
 */

export interface IncomeRow {
  id: number;
  finance_year: string;
  weekly_amount: number;
  source: 'manual';
  notes: string | null;
}

const FY_RE = /^\d{4}-\d{4}$/;

export async function getIncome(finance: any, financeYear: string): Promise<IncomeRow | null> {
  const fy = String(financeYear || '').trim();
  if (!FY_RE.test(fy)) throw new Error('ValidationFailed: finance_year must be YYYY-YYYY');
  return (await finance.db.table('budget_income').findOne({ finance_year: fy })) as IncomeRow | null;
}

/** Latest manual row across FYs (fallback pick when no FY is known). */
export async function getLatestIncome(finance: any): Promise<IncomeRow | null> {
  const rows = (await finance.db.table('budget_income').find({})) as IncomeRow[];
  if (rows.length === 0) return null;
  return rows.sort((a, b) => (a.finance_year < b.finance_year ? 1 : -1))[0];
}

export async function saveIncome(
  finance: any,
  financeYear: string,
  weeklyAmount: number,
  notes?: string | null
): Promise<void> {
  const fy = String(financeYear || '').trim();
  if (!FY_RE.test(fy)) throw new Error('ValidationFailed: finance_year must be YYYY-YYYY');
  const weekly = Number(weeklyAmount);
  if (!Number.isFinite(weekly) || weekly < 0) {
    throw new Error('ValidationFailed: weekly_amount must be a number >= 0');
  }
  const existing = (await finance.db.table('budget_income').findOne({ finance_year: fy })) as IncomeRow | null;
  if (existing) {
    await finance.db.table('budget_income').update(
      { id: existing.id },
      { weekly_amount: weekly, notes: notes ?? null }
    );
  } else {
    await finance.db.table('budget_income').insert({
      finance_year: fy,
      weekly_amount: weekly,
      source: 'manual',
      notes: notes ?? null,
    });
  }
}
