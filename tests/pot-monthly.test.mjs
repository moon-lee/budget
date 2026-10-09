import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { monthlyToWeekly } from '../build/test/services/budget-service.js';

const W = 365.2425 / 7; // mean-year weeks, used only for annual-provision checks
const WEEKS_PER_MONTH = 4; // the deliberate divisor
const exactWeekly = (m) => m / WEEKS_PER_MONTH;

// Pure helper — no DAO boundary to stub.
describe('monthlyToWeekly (expense entry sugar, ceil to whole dollars)', () => {
  it('divides by a flat 4 weeks per month', () => {
    // 1 month = 4 weeks, the simple rule. This deliberately over-provisions
    // against the real 4.348-week mean month, which is accepted: on the
    // expense side, being over budget is the safe direction.
    assert.equal(monthlyToWeekly(160), 40); // exactly 40
    assert.equal(monthlyToWeekly(180), 45); // exactly 45
    assert.equal(monthlyToWeekly(120), 30); // exactly 30
    assert.equal(monthlyToWeekly(275.5), 69); // 68.875 -> up
  });

  it('converts typical monthly bills to whole dollars', () => {
    assert.equal(monthlyToWeekly(180), 45);
    assert.equal(monthlyToWeekly(275.5), 69);
    assert.equal(monthlyToWeekly(100), 25);
    assert.equal(monthlyToWeekly(42), 11);
  });

  it('rounds UP, never down or to nearest', () => {
    // $27/month is 6.75 at 4 weeks: nearest would give 7, ceil gives 7.
    assert.equal(monthlyToWeekly(27), 7);
    // $53/month is 13.25: nearest would give 13, ceil gives 14.
    assert.equal(monthlyToWeekly(53), 14);
    // $42/month is exactly 10.5: nearest would give 10 (bankrupt), ceil 11.
    assert.equal(monthlyToWeekly(42), 11);
  });

  it('always returns a whole-dollar amount', () => {
    for (const m of [
      0.01, 1, 7.5, 12.34, 27, 42, 50, 99.99, 180, 275.5, 1234.56,
    ]) {
      const got = monthlyToWeekly(m);
      assert.ok(Number.isInteger(got), `${m}: ${got} is not an integer`);
      assert.equal(got, Number(got.toFixed(2)));
    }
  });

  it('never plans less than the exact average week', () => {
    // The whole point of ceil: the weekly set-aside must cover the bill.
    for (const m of [
      0.01, 1, 7.5, 12.34, 27, 42, 50, 99.99, 180, 275.5, 1234.56,
    ]) {
      assert.ok(
        monthlyToWeekly(m) >= exactWeekly(m) - 1e-9,
        `${m}: got ${monthlyToWeekly(m)}, exact ${exactWeekly(m)}`,
      );
    }
  });

  it('never over-corrects by more than one dollar', () => {
    for (const m of [
      0.01, 1, 7.5, 12.34, 27, 42, 50, 99.99, 180, 275.5, 1234.56,
    ]) {
      assert.ok(
        monthlyToWeekly(m) < exactWeekly(m) + 1 + 1e-9,
        `${m}: got ${monthlyToWeekly(m)}, exact ${exactWeekly(m)}`,
      );
    }
  });

  it('over-provisions against the real mean month, and that is accepted', () => {
    // 4 weeks is shorter than the real 4.348-week mean month, so every monthly
    // line provisions MORE than its bill. This is the deliberate trade: the
    // expense side is allowed to sit over budget.
    for (const m of [50, 120, 160, 180, 275.5]) {
      const real = (m * 12) / W;
      assert.ok(
        monthlyToWeekly(m) > real,
        `${m}: expected over-provision vs ${real.toFixed(2)}`,
      );
    }
  });

  it('over-provision stays under 10% of the bill', () => {
    // The 4-week divisor implies 4.348/4 = 8.7% above the mean month, plus at
    // most one dollar of ceil. Pin the ceiling so a future edit cannot let this
    // drift into something surprising.
    for (const m of [27, 50, 100, 120, 160, 180, 275.5, 1234.56]) {
      const over = (monthlyToWeekly(m) - exactWeekly(m)) / exactWeekly(m);
      assert.ok(over >= 0, `${m}: must not fall short of 4 weeks`);
      assert.ok(
        over < 0.11,
        `${m}: over-provision ${(over * 100).toFixed(1)}% exceeds 10%`,
      );
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

  it('is never closer to the mean month than the 4-week rule allows', () => {
    // The old mean-year divisor gave a tighter figure. This is now a decision,
    // not an accident: 4 weeks/month is the simple rule the plan uses.
    for (const m of [50, 180, 275.5]) {
      assert.equal(monthlyToWeekly(m), Math.ceil(m / 4));
      assert.ok(
        monthlyToWeekly(m) >= exactWeekly(m),
        `${m}: must not plan less than the bill`,
      );
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
    assert.equal(monthlyToWeekly('180'), 45);
  });
});
