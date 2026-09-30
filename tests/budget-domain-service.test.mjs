import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBudgetDomainService,
  keyOf,
} from '../build/test/services/budget-domain-service.js';
import { potYearly } from '../build/test/services/budget-service.js';

/**
 * `finance.services.invoke` marshals `params` positionally before calling a
 * registered impl (D:/finance_flow_ai/src/extension-host/api/services.ts):
 * null/undefined -> no args, an array spreads as-is, any other value becomes
 * `Object.values(value)`. `hostInvoke` mirrors that rule exactly; it is the
 * only faithful stand-in for the installed app.
 */
function hostInvoke(impl, method, params) {
  const args =
    params === undefined || params === null
      ? []
      : Array.isArray(params)
        ? params
        : Object.values(params);
  return impl[method](...args);
}

/** `src/mock/finance-mock.ts` forwards `params` untouched — the pre-fix shape. */
function passthroughInvoke(impl, method, params) {
  return impl[method](params);
}

const rows = [
  {
    id: 1,
    pot_key: 'mortgage',
    label: 'Mortgage',
    kind: 'saving',
    weekly_amount: 400,
    account_id: 1,
    effective_from: '2026-07-01',
    effective_to: null,
    notes: null,
  },
  {
    id: 2,
    pot_key: 'power-bill',
    label: 'Power Bill',
    kind: 'expense',
    weekly_amount: 50,
    account_id: 1,
    effective_from: '2026-07-01',
    effective_to: null,
    notes: null,
  },
  {
    id: 3,
    pot_key: 'old-pot',
    label: 'Old',
    kind: 'expense',
    weekly_amount: 10,
    account_id: 1,
    effective_from: '2026-07-01',
    effective_to: '2026-08-01',
    notes: null,
  },
];
const flowRows = [
  {
    id: 1,
    flow_key: 'friday-mortgage',
    day: 'friday',
    label: 'Mortgage',
    weekly_amount: 450,
    account_id: 1,
    effective_from: '2026-07-01',
    effective_to: null,
    notes: null,
  },
];

/** Table-accurate stub: `budget_income` stays empty so `incomeWeekly` falls
 *  through to 0 (no `pay` service, no manual row) — the seeded default. */
const tableData = {
  budget_pots: rows,
  budget_flows: flowRows,
  budget_income: [],
  budget_accounts: [],
};

const finance = {
  db: {
    table: (name) => ({
      find: async () => tableData[name] ?? [],
      findOne: async () => null,
    }),
  },
  services: { invoke: async () => null },
};

const service = createBudgetDomainService(finance);

describe('budget service: keyOf', () => {
  it('reads the key from a single-key object (dev shape)', () => {
    assert.equal(keyOf({ key: 'power-bill' }), 'power-bill');
  });

  it('reads an already-spread positional string (installed-app shape)', () => {
    assert.equal(keyOf('power-bill'), 'power-bill');
  });

  it('falls back to an empty key for missing or non-string values', () => {
    assert.equal(keyOf(undefined), '');
    assert.equal(keyOf(null), '');
    assert.equal(keyOf({}), '');
    assert.equal(keyOf({ key: 7 }), '');
  });
});

describe('budget service: potYearly param shapes', () => {
  it('resolves a key passed as an object (dev/mock shape)', async () => {
    assert.deepEqual(
      await passthroughInvoke(service, 'potYearly', { key: 'power-bill' }),
      {
        key: 'power-bill',
        weekly_amount: 50,
        yearly_amount: 2600,
      },
    );
  });

  it('resolves a key spread to a positional string (installed-app shape)', async () => {
    assert.deepEqual(
      await hostInvoke(service, 'potYearly', { key: 'power-bill' }),
      {
        key: 'power-bill',
        weekly_amount: 50,
        yearly_amount: 2600,
      },
    );
  });

  it('resolves a key passed as a single-element array', async () => {
    assert.deepEqual(await hostInvoke(service, 'potYearly', ['power-bill']), {
      key: 'power-bill',
      weekly_amount: 50,
      yearly_amount: 2600,
    });
  });

  it('treats a bare-string param as an unknown key (the Host spreads it per char)', async () => {
    // `Object.values('power-bill')` -> ['p','o','w',...]; the impl receives 'p',
    // which matches no pot. A bare string is NOT a supported call form.
    assert.equal(await hostInvoke(service, 'potYearly', 'power-bill'), null);
  });

  it('returns null for a saving pot key', async () => {
    assert.equal(
      await hostInvoke(service, 'potYearly', { key: 'mortgage' }),
      null,
    );
  });

  it('returns null for an unknown key', async () => {
    assert.equal(await hostInvoke(service, 'potYearly', { key: 'nope' }), null);
  });

  it('returns null when no params are supplied at all', async () => {
    assert.equal(await hostInvoke(service, 'potYearly', undefined), null);
  });
});

describe('budget service: flowYearly param shapes', () => {
  it('resolves a key spread to a positional string (installed-app shape)', async () => {
    assert.deepEqual(
      await hostInvoke(service, 'flowYearly', { key: 'friday-mortgage' }),
      {
        key: 'friday-mortgage',
        weekly_amount: 450,
        yearly_amount: 23400,
      },
    );
  });

  it('returns null for an unknown flow key', async () => {
    assert.equal(
      await hostInvoke(service, 'flowYearly', { key: 'nope' }),
      null,
    );
  });
});

describe('budget service: totals', () => {
  it('returns the plan balance breakdown with no params', async () => {
    const totals = await hostInvoke(service, 'totals', undefined);
    assert.equal(totals.savings_weekly, 400);
    assert.equal(totals.expenses_weekly, 50);
    assert.equal(totals.moves_weekly, 450);
    assert.equal(totals.moves_gap_weekly, 0);
    assert.equal(totals.income_weekly, 0);
  });

  it('returns null when the underlying DB call throws', async () => {
    const broken = createBudgetDomainService({
      db: {
        table: () => ({
          find: async () => {
            throw new Error('TableAccessDenied: budget_pots');
          },
        }),
      },
    });
    assert.equal(await hostInvoke(broken, 'totals', undefined), null);
  });
});

describe('budget service: regression on the underlying maths', () => {
  it('potYearly still ignores archived rows at the service layer', async () => {
    assert.equal(await potYearly(finance, 'old-pot'), null);
  });
});
