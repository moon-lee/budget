import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computePairingGroups,
  mismatchedRowKeys,
  rowKeyOf,
} from '../build/test/ui/row-pairing.js';

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

describe('rowKeyOf', () => {
  it('namespaces pots and flows so keys never collide', () => {
    assert.equal(rowKeyOf({ pot_key: 'x' }), 'p:x');
    assert.equal(rowKeyOf({ flow_key: 'x' }), 'f:x');
    assert.notEqual(rowKeyOf({ pot_key: 'x' }), rowKeyOf({ flow_key: 'x' }));
  });
});

describe('mismatchedRowKeys', () => {
  it('marks both rows of an unbalanced 1:1 group', () => {
    const g = computePairingGroups(
      [pot('a', 'Emergency', 250, 1)],
      [flow('f1', 'Emergency', 240, 1)],
    );
    assert.deepEqual([...mismatchedRowKeys(g)].sort(), ['f:f1', 'p:a']);
  });

  it('marks nothing when every group balances', () => {
    const g = computePairingGroups(
      [pot('a', 'Child', 10, 1), pot('b', 'Power Bill', 50, 1)],
      [flow('f1', 'Child', 10, 1), flow('f2', 'Bill-Big4', 50, 1)],
    );
    assert.deepEqual([...mismatchedRowKeys(g)], []);
  });

  it('leaves a balanced pair alone when a sibling group on the SAME account is off', () => {
    // The regression that motivates group scope: Mortgage is 400 = 400 and must
    // NOT be flagged just because Power Bill's group is short.
    const g = computePairingGroups(
      [
        pot('mortgage', 'Mortgage', 400, 1),
        pot('power', 'Power Bill', 60, 1),
        pot('rego', 'Car Rego', 100, 1),
      ],
      [flow('m', 'Mortgage', 400, 1), flow('big4', 'Bill-Big4', 280, 1)],
    );
    const bad = mismatchedRowKeys(g);
    assert.equal(
      bad.has('p:mortgage'),
      false,
      'balanced Mortgage pair must stay clean',
    );
    assert.equal(bad.has('f:m'), false);
    assert.equal(bad.has('p:power'), true, 'the short group is flagged');
    assert.equal(bad.has('f:big4'), true);
  });

  it('does not flag one-sided (T4 undecidable) groups', () => {
    // 2 pots, 2 moves, no name matches -> T4 singletons: nothing can be
    // reconciled, so nothing should be gilded.
    const g = computePairingGroups(
      [pot('a', 'Alpha', 50, 1), pot('b', 'Beta', 30, 1)],
      [flow('f1', 'One', 10, 1), flow('f2', 'Two', 20, 1)],
    );
    assert.equal(g.length, 4);
    assert.ok(g.every((x) => x.pots.length === 0 || x.moves.length === 0));
    assert.deepEqual([...mismatchedRowKeys(g)], []);
  });

  it('treats a one-cent gap as a mismatch (no tolerance)', () => {
    const g = computePairingGroups(
      [pot('a', 'X', 10, 1)],
      [flow('f1', 'X', 10.01, 1)],
    );
    assert.equal(mismatchedRowKeys(g).size, 2);
  });

  it('marks every row of an unbalanced multi-pot group', () => {
    const g = computePairingGroups(
      [pot('a', 'Alpha', 50, 1), pot('b', 'Beta', 30, 1)],
      [flow('f1', 'Bills', 70, 1)],
    );
    const bad = mismatchedRowKeys(g);
    assert.equal(bad.size, 3);
    for (const k of ['p:a', 'p:b', 'f:f1'])
      assert.equal(bad.has(k), true, `${k} should be flagged`);
  });
});
