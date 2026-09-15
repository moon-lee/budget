/**
 * DAO for `budget_pots` — dated plan rows (spec §4.1 + §5).
 * Current = `effective_to IS NULL`; one current row per `pot_key`.
 * History is never overwritten or deleted — edits close + insert,
 * archives close with no replacement.
 */

export type PotKind = 'saving' | 'expense';

export interface PotRow {
  id: number;
  pot_key: string;
  label: string;
  kind: PotKind;
  weekly_amount: number;
  account_id: number | null;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(value: unknown, field: string): string {
  const s = String(value ?? '');
  if (!DATE_RE.test(s)) throw new Error(`ValidationFailed: ${field} must be YYYY-MM-DD`);
  return s;
}

export async function listCurrentPots(finance: any): Promise<PotRow[]> {
  const rows = (await finance.db.table('budget_pots').find({})) as PotRow[];
  return rows.filter((r) => r.effective_to == null);
}

/** Full trace for one key (current + closed rows), newest first. */
export async function listPotHistory(finance: any, key: string): Promise<PotRow[]> {
  const rows = (await finance.db.table('budget_pots').find({ pot_key: key })) as PotRow[];
  return rows.sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
}

async function assertAccount(finance: any, accountId: unknown): Promise<number | null> {
  if (accountId == null) return null;
  const id = Number(accountId);
  if (!Number.isInteger(id)) throw new Error('ValidationFailed: account_id must reference a budget_accounts row');
  const row = await finance.db.table('budget_accounts').findOne({ id });
  if (!row) throw new Error('ValidationFailed: account_id ' + id + ' does not exist');
  return id;
}

/**
 * Add (no current row) or edit (close current + insert) a pot.
 * `patch` may carry label/kind/weekly_amount/account_id/notes.
 */
export async function savePot(
  finance: any,
  key: string,
  patch: Record<string, unknown>,
  start: string
): Promise<void> {
  const potKey = String(key || '').trim();
  if (!potKey) throw new Error('ValidationFailed: pot key is required');
  const from = assertDate(start, 'effective_from');
  const rows = (await finance.db.table('budget_pots').find({ pot_key: potKey })) as PotRow[];
  const cur = rows.find((r) => r.effective_to == null);

  const label = patch.label !== undefined ? String(patch.label).trim() : cur?.label;
  if (!label) throw new Error('ValidationFailed: label is required');
  const kind = (patch.kind !== undefined ? String(patch.kind) : cur?.kind) as PotKind;
  if (kind !== 'saving' && kind !== 'expense') {
    throw new Error('ValidationFailed: kind must be saving | expense');
  }
  const weekly = patch.weekly_amount !== undefined ? Number(patch.weekly_amount) : Number(cur?.weekly_amount ?? 0);
  if (!Number.isFinite(weekly) || weekly < 0) {
    throw new Error('ValidationFailed: weekly_amount must be a number >= 0');
  }
  const accountId = await assertAccount(finance, patch.account_id !== undefined ? patch.account_id : cur?.account_id);

  if (cur) {
    if (cur.effective_from > from) {
      throw new Error('ValidationFailed: new effective_from must not precede the current row');
    }
    await finance.db.table('budget_pots').update({ id: cur.id }, { effective_to: from });
  }
  await finance.db.table('budget_pots').insert({
    pot_key: potKey,
    label,
    kind,
    weekly_amount: weekly,
    account_id: accountId,
    effective_from: from,
    effective_to: null,
    notes: (patch.notes as string | undefined) ?? null,
  });
}

/** Archive: close the current row with an end date, no replacement. */
export async function archivePot(finance: any, key: string, end: string): Promise<void> {
  const rows = (await finance.db.table('budget_pots').find({ pot_key: key })) as PotRow[];
  const cur = rows.find((r) => r.effective_to == null);
  if (!cur) throw new Error('ValidationFailed: no current row for pot ' + key);
  const to = assertDate(end, 'effective_to');
  if (cur.effective_from > to) {
    throw new Error('ValidationFailed: archive date must not precede the current row');
  }
  await finance.db.table('budget_pots').update({ id: cur.id }, { effective_to: to });
}
