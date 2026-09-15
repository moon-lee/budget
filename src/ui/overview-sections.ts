export const CANONICAL_SECTION_ORDER = ['income', 'plans', 'moves', 'match', 'trace'] as const;

export type OverviewSectionId = (typeof CANONICAL_SECTION_ORDER)[number];

export const SECTION_LABELS: Record<OverviewSectionId, string> = {
  income: 'Income & balance',
  plans: 'Savings pots + Expense lines',
  moves: 'Pay-day moves',
  match: 'Account match',
  trace: 'Plan trace',
};

/** Saved order (unknown ids dropped) + any missing canonical sections appended. */
export function normalizeSectionOrder(saved: unknown): OverviewSectionId[] {
  const ids = Array.isArray(saved) ? saved.filter((x): x is OverviewSectionId =>
    typeof x === 'string' && (CANONICAL_SECTION_ORDER as readonly string[]).includes(x)) : [];
  for (const id of CANONICAL_SECTION_ORDER) {
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}
