import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBudgetDomainService,
  keyOf,
} from '../build/test/services/budget-domain-service.js';
import {
  incomeWeekly,
  potYearly,
  standardWeeklyGross,
  standardWeeklyNet,
} from '../build/test/services/budget-service.js';

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

describe('incomeWeekly: which Salary figure is the run-rate', () => {
  const withPay = (getLatestNet, getPayslipStats) => ({
    db: { table: () => ({ find: async () => [], findOne: async () => null }) },
    services: {
      invoke: async (_svc, method) => {
        if (method === 'getLatestNet') return getLatestNet;
        if (method === 'getPayslipStats') return getPayslipStats;
        return null;
      },
    },
  });

  it('uses the LATEST payslip net, not the all-time average', () => {
    // A pay rise: the average is dragged down by old payslips.
    return incomeWeekly(
      withPay(
        { net: 900, pay_date: '2026-10-01' },
        { avgNet: 820, totalCount: 24 },
      ),
    ).then((got) => {
      assert.equal(got, 900);
    });
  });

  it('never uses avgNet AS the run-rate, only as the tax ratio', () => {
    // getPayslipStats is consulted now - it supplies the net/gross ratio the
    // standard week is taxed at - but its average is never the answer itself.
    // With no usable rate row, the latest payslip must win over the average.
    const called = [];
    const f = {
      db: {
        table: () => ({ find: async () => [], findOne: async () => null }),
      },
      services: {
        invoke: async (_s, method) => {
          called.push(method);
          if (method === 'getCurrentRate')
            return { standard_hours_per_week: 38, base_hourly_rate: 0 };
          if (method === 'getPayslipStats')
            return { avgGross: 1000, avgNet: 700 };
          return method === 'getLatestNet'
            ? { net: 500, pay_date: '2026-10-01' }
            : null;
        },
      },
    };
    return incomeWeekly(f).then((got) => {
      assert.equal(got, 500, 'latest net, not the 700 average');
      assert.equal(
        called.includes('getPayslipStats'),
        true,
        'the ratio source is still consulted',
      );
    });
  });

  it('falls back to the manual row when there is no payslip', async () => {
    const f = {
      db: {
        table: () => ({
          find: async () => [
            {
              id: 1,
              finance_year: '2026-2027',
              weekly_amount: 700,
              source: 'manual',
            },
          ],
          findOne: async () => ({
            id: 1,
            finance_year: '2026-2027',
            weekly_amount: 700,
            source: 'manual',
          }),
        }),
      },
      services: { invoke: async () => null },
    };
    assert.equal(await incomeWeekly(f, '2026-2027'), 700);
  });

  it('returns 0 when neither source has a figure', async () => {
    const f = {
      db: {
        table: () => ({ find: async () => [], findOne: async () => null }),
      },
      services: { invoke: async () => null },
    };
    assert.equal(await incomeWeekly(f), 0);
  });

  it('ignores a non-positive or non-finite latest net', async () => {
    for (const net of [0, -5, NaN]) {
      const f = {
        db: {
          table: () => ({ find: async () => [], findOne: async () => null }),
        },
        services: { invoke: async () => ({ net, pay_date: '2026-10-01' }) },
      };
      assert.equal(await incomeWeekly(f), 0, `net=${net} should not be used`);
    }
  });

  it('survives the pay service throwing', async () => {
    const f = {
      db: {
        table: () => ({ find: async () => [], findOne: async () => null }),
      },
      services: {
        invoke: async () => {
          throw new Error('no salary ext');
        },
      },
    };
    assert.equal(await incomeWeekly(f), 0);
  });
});

describe('standardWeeklyGross', () => {
  const rate = {
    standard_hours_per_week: 38,
    base_hourly_rate: 40,
    shift_allowance_hours_per_week: 0,
    shift_allowance_multiplier: 0,
  };

  it('multiplies standard hours by the base rate', () => {
    assert.equal(standardWeeklyGross(rate), 1520);
  });

  it('adds the shift allowance at its multiplier', () => {
    assert.equal(
      standardWeeklyGross({
        ...rate,
        shift_allowance_hours_per_week: 4,
        shift_allowance_multiplier: 0.15,
      }),
      1544,
    );
  });

  it('returns 0 for a rate that cannot produce a positive week', () => {
    assert.equal(
      standardWeeklyGross({ ...rate, base_hourly_rate: 0 }),
      0,
      'un-seeded default row',
    );
    assert.equal(
      standardWeeklyGross({ ...rate, standard_hours_per_week: 0 }),
      0,
    );
    assert.equal(standardWeeklyGross(null), 0);
    assert.equal(standardWeeklyGross({}), 0);
  });

  it('ignores a malformed shift allowance rather than producing NaN', () => {
    const g = standardWeeklyGross({
      ...rate,
      shift_allowance_hours_per_week: 4,
      shift_allowance_multiplier: NaN,
    });
    assert.equal(g, 1520);
  });
});

describe('standardWeeklyNet', () => {
  const rate = { standard_hours_per_week: 38, base_hourly_rate: 40 };

  it('applies the payslip net-to-gross ratio to the standard week', () => {
    // 38 x 40 = 1520 standard gross; payslips show 70% net of gross.
    assert.equal(standardWeeklyNet(rate, 2000, 1400), 1064);
  });

  it('tracks a pay rise immediately, unlike an all-time average', () => {
    // Old payslips average low, but the ratio is what matters, not the level.
    const net = standardWeeklyNet(rate, 1500, 1000);
    assert.equal(net, 1013.33);
  });

  it('returns 0 when the rate is unusable', () => {
    assert.equal(standardWeeklyNet({ base_hourly_rate: 0 }, 2000, 1400), 0);
  });

  it('returns 0 when the ratio cannot be derived', () => {
    assert.equal(standardWeeklyNet(rate, 0, 1400), 0, 'zero gross');
    assert.equal(standardWeeklyNet(rate, NaN, 1400), 0);
    assert.equal(standardWeeklyNet(rate, 2000, null), 0);
  });

  it('rejects an impossible ratio rather than inflating income', () => {
    assert.equal(standardWeeklyNet(rate, 1000, 1200), 0, 'net above gross');
    assert.equal(standardWeeklyNet(rate, 1000, -50), 0, 'negative net');
  });
});

describe('incomeWeekly: preference order', () => {
  const financeWith = (handlers, incomeRows = []) => ({
    db: {
      table: () => ({
        find: async () => incomeRows,
        findOne: async () => incomeRows[0] ?? null,
      }),
    },
    services: {
      invoke: async (_s, method) =>
        method in handlers ? handlers[method] : null,
    },
  });

  it('prefers standard net over the latest payslip', async () => {
    const f = financeWith({
      getCurrentRate: { standard_hours_per_week: 38, base_hourly_rate: 40 },
      getPayslipStats: { avgGross: 2000, avgNet: 1400 },
      getLatestNet: { net: 999, pay_date: '2026-10-01' },
    });
    assert.equal(await incomeWeekly(f), 1064);
  });

  it('falls back to the latest payslip when the rate is unusable', async () => {
    const f = financeWith({
      getCurrentRate: { standard_hours_per_week: 38, base_hourly_rate: 0 },
      getPayslipStats: { avgGross: 2000, avgNet: 1400 },
      getLatestNet: { net: 900, pay_date: '2026-10-01' },
    });
    assert.equal(await incomeWeekly(f), 900);
  });

  it('falls back to the manual row when there are no payslips', async () => {
    const f = financeWith({}, [
      {
        id: 1,
        finance_year: '2026-2027',
        weekly_amount: 700,
        source: 'manual',
      },
    ]);
    assert.equal(await incomeWeekly(f, '2026-2027'), 700);
  });

  it('returns 0 when nothing is available', async () => {
    assert.equal(await incomeWeekly(financeWith({})), 0);
  });
});

describe('incomeWeekly: prefers Salary getStandardWeeklyNet', () => {
  const withPay = (handlers, incomeRows = []) => ({
    db: {
      table: () => ({
        find: async () => incomeRows,
        findOne: async () => incomeRows[0] ?? null,
      }),
    },
    services: {
      invoke: async (_s, method) =>
        method in handlers ? handlers[method] : null,
    },
  });

  it('uses the Salary normal-week figure when the method exists', async () => {
    const f = withPay({
      getStandardWeeklyNet: {
        net: 1310.6,
        basis: { standard_gross: 1660.6, standard_weeks_used: 2 },
      },
      getCurrentRate: { standard_hours_per_week: 38, base_hourly_rate: 38 },
      getPayslipStats: { avgGross: 1700, avgNet: 1100 },
      getLatestNet: { net: 900, pay_date: '2026-09-24' },
    });
    assert.equal(await incomeWeekly(f), 1310.6);
  });

  it('skips straight to the local formula when the method is absent', async () => {
    // An older Salary: unknown method returns null, so the local path runs.
    const f = withPay({
      getStandardWeeklyNet: null,
      getCurrentRate: { standard_hours_per_week: 38, base_hourly_rate: 40 },
      getPayslipStats: { avgGross: 2000, avgNet: 1400 },
      getLatestNet: { net: 900, pay_date: '2026-09-24' },
    });
    assert.equal(await incomeWeekly(f), 1064);
  });

  it('falls back to the latest payslip when Salary cannot determine it', async () => {
    const f = withPay({
      getStandardWeeklyNet: null, // e.g. no normal weeks in the rate period
      getCurrentRate: { standard_hours_per_week: 38, base_hourly_rate: 0 },
      getPayslipStats: { avgGross: 2000, avgNet: 1400 },
      getLatestNet: { net: 900, pay_date: '2026-09-24' },
    });
    assert.equal(await incomeWeekly(f), 900);
  });

  it('survives the new method throwing', async () => {
    const f = withPay({
      getStandardWeeklyNet: () => {
        throw new Error('boom');
      },
      getCurrentRate: { standard_hours_per_week: 38, base_hourly_rate: 40 },
      getPayslipStats: { avgGross: 2000, avgNet: 1400 },
    });
    assert.equal(await incomeWeekly(f), 1064);
  });

  it('ignores a non-positive figure from the new method', async () => {
    const f = withPay({
      getStandardWeeklyNet: { net: 0 },
      getCurrentRate: { standard_hours_per_week: 38, base_hourly_rate: 40 },
      getPayslipStats: { avgGross: 2000, avgNet: 1400 },
    });
    assert.equal(await incomeWeekly(f), 1064, 'must not stop at 0');
  });
});
