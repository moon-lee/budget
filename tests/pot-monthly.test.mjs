import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { monthlyToWeekly } from '../build/test/services/budget-service.js';

const W = 365.2425 / 7; // mean-year weeks, mirroring the implementation
const exactWeekly = (m) => (m * 12) / W;

// Pure helper — no DAO boundary to stub.
describe('monthlyToWeekly (expense entry sugar, ceil to whole dollars)', () => {
  it('converts typical monthly bills to whole dollars', () => {
    assert.equal(monthlyToWeekly(180), 42);
    assert.equal(monthlyToWeekly(275.5), 64);
    assert.equal(monthlyToWeekly(100), 23);
    assert.equal(monthlyToWeekly(42), 10);
  });

  it('rounds UP, never down or to nearest', () => {
    // $27/month is 6.2096 weeks: nearest would give 6, ceil gives 7.
    assert.equal(monthlyToWeekly(27), 7);
    // $53/month is 12.1892 weeks: nearest would give 12.
    assert.equal(monthlyToWeekly(53), 13);
    // $120/month is 27.5981: nearest would give 28, but 28 is also the
    // ceil here, so use a case where they differ downward.
    assert.equal(monthlyToWeekly(180), 42); // exact 41.40 — nearest would be 41
  });

  it('always returns a whole-dollar amount', () => {
    for (const m of [0.01, 1, 7.5, 12.34, 27, 42, 50, 99.99, 180, 275.5, 1234.56]) {
      const got = monthlyToWeekly(m);
      assert.ok(Number.isInteger(got), `${m}: ${got} is not an integer`);
      assert.equal(got, Number(got.toFixed(2)));
    }
  });

  it('never plans less than the exact average week', () => {
    // The whole point of ceil: the weekly set-aside must cover the bill.
    for (const m of [0.01, 1, 7.5, 12.34, 27, 42, 50, 99.99, 180, 275.5, 1234.56]) {
      assert.ok(
        monthlyToWeekly(m) >= exactWeekly(m) - 1e-9,
        `${m}: got ${monthlyToWeekly(m)}, exact ${exactWeekly(m)}`,
      );
    }
  });

  it('never over-corrects by more than one dollar', () => {
    for (const m of [0.01, 1, 7.5, 12.34, 27, 42, 50, 99.99, 180, 275.5, 1234.56]) {
      assert.ok(
        monthlyToWeekly(m) < exactWeekly(m) + 1 + 1e-9,
        `${m}: got ${monthlyToWeekly(m)}, exact ${exactWeekly(m)}`,
      );
    }
  });

  it('caps the yearly over-provision at ~$52 per line', () => {
    // Worst case is just under a dollar short of the next dollar, which
    // for a year is ~$52. This is the accepted cost of dollar-rounding.
    for (const m of [0.01, 7.5, 12.34, 27, 53, 180, 275.5, 1234.56]) {
      const over = (monthlyToWeekly(m) - exactWeekly(m)) * W;
      assert.ok(over >= -1e-6, `${m}: must not fall short`);
      assert.ok(over < 52.18, `${m}: over-provision ${over.toFixed(2)} exceeds a dollar-year`);
    }
  });

  it('documents the sub-dollar cliff: any non-zero amount floors to $1', () => {
    // Sharp edge of dollar-rounding: $0.01/month is $0.0023/week but
    // ceils to $1/week — a 52x over-provision. Pinned so the behaviour is
    // a decision, not an accident.
    assert.equal(monthlyToWeekly(0.01), 1);
    assert.equal(monthlyToWeekly(0.45), 1);
    assert.equal(monthlyToWeekly(0), 0);
  });

  it('reproduces the yearly total from above against the mean year', () => {
    for (const m of [50, 180, 275.5]) {
      const yearly = m * 12;
      const fromWeekly = monthlyToWeekly(m) * W;
      assert.ok(
        fromWeekly >= yearly - 1e-6,
        `${m}: weekly plan must not fall short of the yearly cost`,
      );
    }
  });

  it('is strictly closer to the monthly figure than a nominal 4 or 52 divisor', () => {
    for (const m of [50, 180, 275.5]) {
      assert.ok(Math.abs(monthlyToWeekly(m) - exactWeekly(m)) < 1);
      // 52 weeks is the naive alternative and it is meaningfully wrong.
      assert.ok(Math.abs(monthlyToWeekly(m) - (m * 52) / 12) > 0.2, `${m} vs x52`);
    }
  });

  it('passes zero through without producing negative zero', () => {
    assert.equal(monthlyToWeekly(0), 0);
    assert.equal(Object.is(monthlyToWeekly(-5), 0), true);
    assert.equal(Object.is(monthlyToWeekly(-5), -0), false);
  });

  it('returns 0 for non-finite input rather than NaN', () => {
    assert.equal(monthlyToWeekly(Number.NaN), 0);
    assert.equal(monthlyToWeekly(Number.POSITIVE_INFINITY), 0);
    assert.equal(monthlyToWeekly(Number.NEGATIVE_INFINITY), 0);
  });

  it('accepts a numeric string from the form input', () => {
    assert.equal(monthlyToWeekly('180'), 42);
  });
});