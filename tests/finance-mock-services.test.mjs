import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createMockFinance } from '../build/test/mock/finance-mock.js';
import { createBudgetDomainService } from '../build/test/services/budget-domain-service.js';

/**
 * The dev mock must marshal `params` exactly like the Host
 * (D:/finance_flow_ai/src/extension-host/api/services.ts). It used to forward
 * `params` untouched, which meant a registered impl saw the raw object in dev
 * but a spread positional value once installed — so `budget.potYearly` and
 * `budget.flowYearly` returned real data in `npm run dev` and `null` in the
 * app, with nothing to catch it.
 */
beforeEach(() => {
  delete globalThis.__mockServices;
});

describe('mock services.invoke param marshalling', () => {
  it('spreads a plain object into positional values, like the Host', async () => {
    const seen = [];
    const finance = createMockFinance();
    finance.services.register('probe', {
      capture: (...args) => {
        seen.push(args);
        return null;
      },
    });

    await finance.services.invoke('probe', 'capture', { key: 'power-bill' });
    assert.deepEqual(seen, [['power-bill']]);
  });

  it('spreads an array as-is', async () => {
    const seen = [];
    const finance = createMockFinance();
    finance.services.register('probe', {
      capture: (...args) => {
        seen.push(args);
        return null;
      },
    });

    await finance.services.invoke('probe', 'capture', ['a', 'b']);
    assert.deepEqual(seen, [['a', 'b']]);
  });

  it('passes no args for null/undefined params', async () => {
    const seen = [];
    const finance = createMockFinance();
    finance.services.register('probe', {
      capture: (...args) => {
        seen.push(args);
        return null;
      },
    });

    await finance.services.invoke('probe', 'capture');
    await finance.services.invoke('probe', 'capture', null);
    assert.deepEqual(seen, [[], []]);
  });

  it('returns null for an unregistered service or unknown method', async () => {
    const finance = createMockFinance();
    assert.equal(await finance.services.invoke('nope', 'x'), null);
    finance.services.register('probe', { known: () => 1 });
    assert.equal(await finance.services.invoke('probe', 'unknown'), null);
  });
});

describe('mock end-to-end: budget service via invoke', () => {
  it('resolves potYearly through the marshalled object param', async () => {
    const finance = createMockFinance();
    await finance.db.table('budget_pots').insert({
      pot_key: 'power-bill',
      label: 'Power Bill',
      kind: 'expense',
      weekly_amount: 50,
      account_id: null,
      effective_from: '2026-07-01',
      effective_to: null,
      notes: null,
    });
    finance.services.register('budget', createBudgetDomainService(finance));

    assert.deepEqual(
      await finance.services.invoke('budget', 'potYearly', {
        key: 'power-bill',
      }),
      {
        key: 'power-bill',
        weekly_amount: 50,
        yearly_amount: 2600,
      },
    );
  });

  it('resolves flowYearly and totals through the same path', async () => {
    const finance = createMockFinance();
    await finance.db.table('budget_flows').insert({
      flow_key: 'friday-mortgage',
      day: 'friday',
      label: 'Mortgage',
      weekly_amount: 450,
      account_id: null,
      effective_from: '2026-07-01',
      effective_to: null,
      notes: null,
    });
    await finance.db.table('budget_pots').insert({
      pot_key: 'mortgage',
      label: 'Mortgage',
      kind: 'saving',
      weekly_amount: 400,
      account_id: null,
      effective_from: '2026-07-01',
      effective_to: null,
      notes: null,
    });
    finance.services.register('budget', createBudgetDomainService(finance));

    assert.deepEqual(
      await finance.services.invoke('budget', 'flowYearly', {
        key: 'friday-mortgage',
      }),
      {
        key: 'friday-mortgage',
        weekly_amount: 450,
        yearly_amount: 23400,
      },
    );
    assert.equal(
      await finance.services.invoke('budget', 'potYearly', { key: 'mortgage' }),
      null,
    );

    const totals = await finance.services.invoke('budget', 'totals');
    assert.equal(totals.savings_weekly, 400);
    assert.equal(totals.moves_weekly, 450);
  });

  it('shares the service registry across mock instances in one page', async () => {
    const a = createMockFinance();
    a.services.register('probe', { ping: () => 'pong' });
    const b = createMockFinance();
    assert.equal(await b.services.invoke('probe', 'ping'), 'pong');
  });
});
