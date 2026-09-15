import { SEED_ACCOUNTS, SEED_EFFECTIVE_FROM, SEED_FLOWS, SEED_POTS } from './seed-data.js';

async function count(finance: any, table: string): Promise<number> {
  try {
    return (await finance.db.table(table).count({})) as number;
  } catch {
    return -1;
  }
}

/**
 * Key migration 2026-09-16 (spec §4 $4 update): placeholder slugs → real
 * suffixes, banks filled in, Emergency 3 → Private Fund. FKs point at `id`,
 * so renames are safe for existing installs; user-created rows untouched.
 */
const KEY_MIGRATION: ReadonlyArray<{ from: string; to: string; bank?: string | null; label?: string }> = [
  { from: '0743', to: '0743', bank: 'NAB SAVING', label: 'Child' },
  { from: '8107', to: '8107', bank: 'NAB SAVING', label: 'Solar' },
  { from: '4323', to: '4323', bank: 'NAB SAVING', label: 'Investment' },
  { from: '3545', to: '3545', bank: 'NAB SAVING', label: 'New Car' },
  { from: '9722', to: '9722', bank: 'NAB SAVING', label: 'Emergency 2' },
  { from: 'nab-offset', to: '0390', bank: 'NAB OFFSET', label: 'Mortgage / Bills hub' },
  { from: 'boq', to: '2730', bank: 'BOQ', label: 'Family Fund' },
  { from: 'macquarie', to: '3804', bank: 'MACQUARIE', label: 'Home Expenses' },
  { from: 'ubank', to: '9282', bank: 'UBANK', label: 'Private Fund' },
];

/**
 * Once-only seeder (runs on every activate, seeds only what's missing).
 * - accounts: inserted when `budget_accounts` is empty (never re-seeded);
 *   existing installs are migrated to the current SEED_ACCOUNTS below
 * - pots/flows: inserted when their tables are empty, with `account_id`
 *   resolved by `account_key` lookup (NULL where §2 names no account)
 * - `budget_income`: never seeded (only on manual fallback use)
 */
export async function seedBudget(finance: any): Promise<void> {
  if ((await count(finance, 'budget_accounts')) === 0) {
    for (const a of SEED_ACCOUNTS) {
      // is_active written explicitly: the mock (and DAO) store exactly
      // what's given — never rely on the manifest default here.
      await finance.db.table('budget_accounts').insert({ ...a, bank: a.bank ?? null, is_active: true });
    }
  } else {
    await migrateAccountKeys(finance);
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

async function migrateAccountKeys(finance: any): Promise<void> {
  const rows = (await finance.db.table('budget_accounts').find({})) as any[];
  const byKey = new Map<string, any>(rows.map((r) => [r.account_key, r]));
  for (const m of KEY_MIGRATION) {
    const row = byKey.get(m.from);
    // Skip when: old key absent, or target key already taken by another row.
    if (!row) continue;
    if (m.from !== m.to && byKey.has(m.to)) continue;
    const patch: Record<string, unknown> = {};
    if (m.from !== m.to) patch.account_key = m.to;
    if (m.bank !== undefined && (row.bank ?? null) !== m.bank) patch.bank = m.bank;
    if (m.label !== undefined && row.label !== m.label) patch.label = m.label;
    if (Object.keys(patch).length === 0) continue;
    await finance.db.table('budget_accounts').update({ id: row.id }, patch);
    byKey.delete(m.from);
    byKey.set(m.to, { ...row, ...patch });
  }
}
