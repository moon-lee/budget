import { SEED_ACCOUNTS, SEED_EFFECTIVE_FROM, SEED_FLOWS, SEED_POTS } from './seed-data.js';

async function count(finance: any, table: string): Promise<number> {
  try {
    return (await finance.db.table(table).count({})) as number;
  } catch {
    return -1;
  }
}

/**
 * Once-only seeder (runs on every activate, seeds only what's missing).
 * - accounts: inserted when `budget_accounts` is empty (never re-seeded)
 * - pots/flows: inserted when their tables are empty, with `account_id`
 *   resolved by `account_key` lookup (NULL where §2 names no account)
 * - `budget_income`: never seeded (only on manual fallback use)
 */
export async function seedBudget(finance: any): Promise<void> {
  if ((await count(finance, 'budget_accounts')) === 0) {
    for (const a of SEED_ACCOUNTS) {
      await finance.db.table('budget_accounts').insert({ ...a, bank: a.bank ?? null });
    }
  }

  const accounts = (await finance.db.table('budget_accounts').find({})) as any[];
  const byKey = new Map<string, number>(accounts.map((a) => [a.account_key, a.id]));

  if ((await count(finance, 'budget_pots')) === 0) {
    for (const p of SEED_POTS) {
      await finance.db.table('budget_pots').insert({
        pot_key: p.pot_key,
        label: p.label,
        kind: p.kind,
        weekly_amount: p.weekly_amount,
        account_id: p.account != null ? (byKey.get(p.account) ?? null) : null,
        effective_from: SEED_EFFECTIVE_FROM,
        effective_to: null,
        notes: null,
      });
    }
  }

  if ((await count(finance, 'budget_flows')) === 0) {
    for (const f of SEED_FLOWS) {
      await finance.db.table('budget_flows').insert({
        flow_key: f.flow_key,
        day: f.day,
        label: f.label,
        weekly_amount: f.weekly_amount,
        account_id: f.account != null ? (byKey.get(f.account) ?? null) : null,
        effective_from: SEED_EFFECTIVE_FROM,
        effective_to: null,
        notes: null,
      });
    }
  }
}
