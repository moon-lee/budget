import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { potYearly } from '../build/test/services/budget-service.js';

// Boundary stub: only the DAO's `find` call is faked. potYearly,
// listCurrentPots and the yearly math under test are the real code.
const rows = [
  { id: 1, pot_key: 'mortgage', label: 'Mortgage', kind: 'saving', weekly_amount: 400, account_id: 1, effective_from: '2026-07-01', effective_to: null, notes: null },
  { id: 2, pot_key: 'power-bill', label: 'Power Bill', kind: 'expense', weekly_amount: 50, account_id: 1, effective_from: '2026-07-01', effective_to: null, notes: null },
  { id: 3, pot_key: 'old-pot', label: 'Old', kind: 'expense', weekly_amount: 10, account_id: 1, effective_from: '2026-07-01', effective_to: '2026-08-01', notes: null },
];
const finance = { db: { table: () => ({ find: async () => rows }) } };

describe('potYearly (consumer surface: expense pots only)', () => {
  it('returns weekly and yearly (weekly x 52) for an expense pot', async () => {
    assert.deepEqual(await potYearly(finance, 'power-bill'), {
      key: 'power-bill',
      weekly_amount: 50,
      yearly_amount: 2600,
    });
  });

  it('returns null for a saving pot key', async () => {
    assert.equal(await potYearly(finance, 'mortgage'), null);
  });

  it('returns null for an unknown key', async () => {
    assert.equal(await potYearly(finance, 'nope'), null);
  });

  it('ignores archived (closed) rows', async () => {
    assert.equal(await potYearly(finance, 'old-pot'), null);
  });
});
