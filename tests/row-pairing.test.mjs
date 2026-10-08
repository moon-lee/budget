import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computePairingGroups } from '../build/test/ui/row-pairing.js';

const pot = (pot_key, label, weekly_amount, account_id) => ({
  pot_key,
  label,
  kind: 'expense',
  weekly_amount,
  account_id,
});
const flow = (flow_key, label, weekly_amount, account_id) => ({
  flow_key,
  label,
  day: 'friday',
  weekly_amount,
  account_id,
});
const names = (g) => ({
  pots: g.pots.map((p) => p.label),
  moves: g.moves.map((f) => f.label),
});

describe('computePairingGroups', () => {
  it('pairs a 1:1 account directly (T1)', () => {
    const g = computePairingGroups(
      [pot('a', 'Child', 10, 1)],
      [flow('f1', 'Child', 10, 1)],
    );
    assert.equal(g.length, 1);
    assert.deepEqual(names(g[0]), { pots: ['Child'], moves: ['Child'] });
  });

  it('pairs a name match regardless of case and outer spacing (T2)', () => {
    const g = computePairingGroups(
      [pot('a', 'Car Fuel', 50, 1), pot('b', 'Internet', 27, 1)],
      [flow('f1', '  car fuel ', 50, 1), flow('f2', 'Bills', 170, 1)],
    );
    assert.deepEqual(names(g[0]), {
      pots: ['Car Fuel'],
      moves: ['  car fuel '],
    });
  });

  it('does not collapse internal whitespace in a name', () => {
    // 'car  fuel' (double space) is a different name from 'Car Fuel'. Keeping
    // matching literal means a typo never silently reshapes the pairing.
    // Needs 2 leftover moves to land in T4; with one, T3 absorbs the pair by
    // position instead (which is correct - the sums still have to agree).
    const g = computePairingGroups(
      [pot('a', 'Car Fuel', 50, 1), pot('b', 'Solar', 50, 1)],
      [
        flow('f1', 'car  fuel', 50, 1),
        flow('f2', 'Solar', 50, 1),
        flow('f3', 'Extra', 10, 1),
      ],
    );
    assert.deepEqual(names(g[0]), { pots: ['Solar'], moves: ['Solar'] });
    assert.deepEqual(names(g[1]), { pots: ['Car Fuel'], moves: [] });
    assert.deepEqual(names(g[2]), { pots: [], moves: ['car  fuel'] });
    assert.deepEqual(names(g[3]), { pots: [], moves: ['Extra'] });
  });

  it('groups leftover pots against the single leftover move (T3)', () => {
    const g = computePairingGroups(
      [
        pot('a', 'Power Bill', 50, 1),
        pot('b', 'Rates and Water', 100, 1),
        pot('c', 'Mortgage', 400, 1),
      ],
      [flow('f1', 'Mortgage', 400, 1), flow('f2', 'Bill-Big4', 280, 1)],
    );
    // Mortgage pairs by name; the other two lines fund Bill-Big4 as one group.
    assert.equal(g.length, 2);
    assert.deepEqual(names(g[0]), { pots: ['Mortgage'], moves: ['Mortgage'] });
    assert.deepEqual(names(g[1]), {
      pots: ['Power Bill', 'Rates and Water'],
      moves: ['Bill-Big4'],
    });
  });

  it('leaves leftovers unpaired when two or more moves remain (T4)', () => {
    const g = computePairingGroups(
      [
        pot('a', 'Alpha', 10, 1),
        pot('b', 'Beta', 20, 1),
        pot('c', 'Gamma', 30, 1),
      ],
      [flow('f1', 'One', 15, 1), flow('f2', 'Two', 45, 1)],
    );
    assert.equal(g.length, 5);
    assert.deepEqual(g.map(names), [
      { pots: ['Alpha'], moves: [] },
      { pots: ['Beta'], moves: [] },
      { pots: ['Gamma'], moves: [] },
      { pots: [], moves: ['One'] },
      { pots: [], moves: ['Two'] },
    ]);
  });

  it('refuses to pair a duplicated pot name, letting T3 group it instead', () => {
    const g = computePairingGroups(
      [pot('a', 'Insurance', 10, 1), pot('b', 'Insurance', 20, 1)],
      [flow('f1', 'Insurance', 30, 1)],
    );
    // Neither pot may claim the single move on its own - which one? So both are
    // left over, and T3 absorbs them as one group (10 + 20 = 30).
    assert.equal(g.length, 1);
    assert.deepEqual(names(g[0]), {
      pots: ['Insurance', 'Insurance'],
      moves: ['Insurance'],
    });
  });

  it('never pairs across accounts', () => {
    const g = computePairingGroups(
      [pot('a', 'Child', 10, 1)],
      [flow('f1', 'Child', 10, 2)],
    );
    assert.deepEqual(g.map(names), [
      { pots: ['Child'], moves: [] },
      { pots: [], moves: ['Child'] },
    ]);
  });

  it('skips rows with no account', () => {
    const g = computePairingGroups(
      [pot('a', 'Orphan', 10, null)],
      [flow('f1', 'Orphan', 10, null)],
    );
    assert.deepEqual(g, []);
  });

  it('keeps every row in exactly one group', () => {
    const pots = [
      pot('a', 'Mortgage', 400, 1),
      pot('b', 'Power Bill', 50, 1),
      pot('c', 'Internet', 27, 2),
      pot('d', 'Car Fuel', 50, 2),
    ];
    const flows = [
      flow('f1', 'Mortgage', 400, 1),
      flow('f2', 'Bill-Big4', 280, 1),
      flow('f3', 'Bills', 170, 2),
      flow('f4', 'Car Fuel', 50, 2),
    ];
    const g = computePairingGroups(pots, flows);
    const seenP = g.flatMap((x) => x.pots.map((p) => p.pot_key));
    const seenF = g.flatMap((x) => x.moves.map((f) => f.flow_key));
    assert.deepEqual(seenP.sort(), pots.map((p) => p.pot_key).sort());
    assert.deepEqual(seenF.sort(), flows.map((f) => f.flow_key).sort());
  });

  it('returns nothing for empty input', () => {
    assert.deepEqual(computePairingGroups([], []), []);
  });
});
