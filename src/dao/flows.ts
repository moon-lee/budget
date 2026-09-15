/**
 * DAO for `budget_flows` — dated pay-day move rows (spec §4.2 + §5).
 * Mirrors `dao/pots.ts` on (`flow_key`, `budget_flows`).
 */

export type FlowDay = 'friday' | 'sunday';

export interface FlowRow {
  id: number;
  flow_key: string;
  day: FlowDay;
  label: string;
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

export async function listCurrentFlows(finance: any): Promise<FlowRow[]> {
  const rows = (await finance.db.table('budget_flows').find({})) as FlowRow[];
  return rows.filter((r) => r.effective_to == null);
}

/** Full trace for one key (current + closed rows), newest first. */
export async function listFlowHistory(finance: any, key: string): Promise<FlowRow[]> {
  const rows = (await finance.db.table('budget_flows').find({ flow_key: key })) as FlowRow[];
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

/** Add (no current row) or edit (close current + insert) a flow. */
export async function saveFlow(
  finance: any,
  key: string,
  patch: Record<string, unknown>,
  start: string
): Promise<void> {
  const flowKey = String(key || '').trim();
  if (!flowKey) throw new Error('ValidationFailed: flow key is required');
  const from = assertDate(start, 'effective_from');
  const rows = (await finance.db.table('budget_flows').find({ flow_key: flowKey })) as FlowRow[];
  const cur = rows.find((r) => r.effective_to == null);

  const label = patch.label !== undefined ? String(patch.label).trim() : cur?.label;
  if (!label) throw new Error('ValidationFailed: label is required');
  const day = (patch.day !== undefined ? String(patch.day) : cur?.day) as FlowDay;
  if (day !== 'friday' && day !== 'sunday') {
    throw new Error('ValidationFailed: day must be friday | sunday');
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
    await finance.db.table('budget_flows').update({ id: cur.id }, { effective_to: from });
  }
  await finance.db.table('budget_flows').insert({
    flow_key: flowKey,
    day,
    label,
    weekly_amount: weekly,
    account_id: accountId,
    effective_from: from,
    effective_to: null,
    notes: (patch.notes as string | undefined) ?? null,
  });
}

/** Archive: close the current row with an end date, no replacement. */
export async function archiveFlow(finance: any, key: string, end: string): Promise<void> {
  const rows = (await finance.db.table('budget_flows').find({ flow_key: key })) as FlowRow[];
  const cur = rows.find((r) => r.effective_to == null);
  if (!cur) throw new Error('ValidationFailed: no current row for flow ' + key);
  const to = assertDate(end, 'effective_to');
  if (cur.effective_from > to) {
    throw new Error('ValidationFailed: archive date must not precede the current row');
  }
  await finance.db.table('budget_flows').update({ id: cur.id }, { effective_to: to });
}
