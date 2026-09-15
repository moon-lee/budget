/**
 * DAO for `budget_accounts` — stable master list (spec §4.0).
 * Mortgage `dao/accounts.ts` shape + `bank` column.
 * No dated rows: rename any time; deactivate via `is_active`.
 */

export interface AccountRow {
  id: number;
  account_key: string;
  bank: string | null;
  label: string;
  sort_order: number;
  is_active: boolean;
}

export async function listAccounts(finance: any): Promise<AccountRow[]> {
  const rows = (await finance.db.table('budget_accounts').find({})) as AccountRow[];
  return rows
    .map((r) => ({ ...r, bank: r.bank ?? null, is_active: r.is_active ? true : false }))
    .sort((a, b) => a.sort_order - b.sort_order);
}

export async function listActiveAccounts(finance: any): Promise<AccountRow[]> {
  return (await listAccounts(finance)).filter((a) => a.is_active);
}

/** Map account id → row for joining `account_id` into labels in reads. */
export async function accountById(finance: any): Promise<Map<number, AccountRow>> {
  return new Map((await listAccounts(finance)).map((a) => [a.id, a]));
}

/** Display label for a pot/flow row: "Bank Label" or "Label" (or null when no account). */
export function resolveAccountLabel(accounts: Map<number, AccountRow>, accountId: number | null | undefined): string | null {
  if (accountId == null) return null;
  const a = accounts.get(Number(accountId));
  if (!a) return null;
  return a.bank ? `${a.bank} ${a.label}` : a.label;
}

export async function createAccount(
  finance: any,
  input: { account_key: string; bank?: string | null; label: string }
): Promise<number> {
  const key = String(input.account_key || '').trim();
  const label = String(input.label || '').trim();
  if (!key) throw new Error('ValidationFailed: account key is required (e.g. 5272)');
  if (!label) throw new Error('ValidationFailed: account label is required');
  const existing = await listAccounts(finance);
  if (existing.some((a) => a.account_key === key)) {
    throw new Error('ValidationFailed: account key ' + key + ' already exists');
  }
  const sort = existing.reduce((m, a) => Math.max(m, Number(a.sort_order) || 0), 0) + 1;
  const res = await finance.db.table('budget_accounts').insert({
    account_key: key,
    bank: input.bank?.trim() ? input.bank.trim() : null,
    label,
    sort_order: sort,
    is_active: true,
  });
  return res.id as number;
}

export async function updateAccount(
  finance: any,
  id: number,
  patch: { label?: string; bank?: string | null }
): Promise<void> {
  const existing = (await finance.db.table('budget_accounts').findOne({ id })) as AccountRow | null;
  if (!existing) throw new Error('ValidationFailed: account not found');
  // account_key is the stable identity (seed lookups + FK trace) — never edited.
  const update: Record<string, unknown> = {};
  if (patch.label !== undefined) {
    const name = String(patch.label || '').trim();
    if (!name) throw new Error('ValidationFailed: account label is required');
    update.label = name;
  }
  if (patch.bank !== undefined) {
    update.bank = patch.bank?.trim() ? String(patch.bank).trim() : null;
  }
  if (Object.keys(update).length === 0) return;
  await finance.db.table('budget_accounts').update({ id }, update);
}

/** @deprecated Use updateAccount instead. */
export async function renameAccount(finance: any, id: number, label: string): Promise<void> {
  await updateAccount(finance, id, { label });
}

async function referencedByCurrentRow(finance: any, id: number): Promise<boolean> {
  const pots = (await finance.db.table('budget_pots').find({})) as any[];
  if (pots.some((r) => r.effective_to == null && Number(r.account_id) === Number(id))) return true;
  const flows = (await finance.db.table('budget_flows').find({})) as any[];
  return flows.some((r) => r.effective_to == null && Number(r.account_id) === Number(id));
}

/** Deactivate only — rows are never deleted; history rows keep their FK. */
export async function setAccountActive(finance: any, id: number, active: boolean): Promise<void> {
  const existing = (await finance.db.table('budget_accounts').findOne({ id })) as AccountRow | null;
  if (!existing) throw new Error('ValidationFailed: account not found');
  if (!active && (await referencedByCurrentRow(finance, id))) {
    throw new Error('ValidationFailed: account is used by the current plan — reassign pots/flows first');
  }
  await finance.db.table('budget_accounts').update({ id }, { is_active: active });
}
