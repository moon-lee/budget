import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRACE_PAGE_SIZE,
  TRACE_SORTS,
  clampPage,
  distinctTraceItems,
  filterTrace,
  isPageGap,
  pageCount,
  pageSlice,
  pageWindow,
  sortTrace,
} from '../build/test/ui/trace-paging.js';

const rows = (labels) =>
  labels.map((label, i) => ({
    label,
    effective_to: `2026-01-${String(i + 1).padStart(2, '0')}`,
  }));

describe('distinctTraceItems', () => {
  it('returns sorted distinct labels, blanks dropped', () => {
    assert.deepEqual(
      distinctTraceItems(rows(['Solar', 'Emergency', 'Solar', '  ', 'Child'])),
      ['Child', 'Emergency', 'Solar'],
    );
  });

  it('trims surrounding whitespace so " X " and "X" are one item', () => {
    assert.deepEqual(distinctTraceItems(rows(['Solar', ' Solar '])), ['Solar']);
  });

  it('returns an empty list for no rows', () => {
    assert.deepEqual(distinctTraceItems([]), []);
  });
});

describe('filterTrace', () => {
  const all = rows(['Solar', 'Emergency', 'Solar']);
  it('keeps everything for an empty or absent item', () => {
    assert.equal(filterTrace(all, '').length, 3);
    assert.equal(filterTrace(all, null).length, 3);
    assert.equal(filterTrace(all, undefined).length, 3);
  });
  it('keeps only exact matches', () => {
    assert.deepEqual(
      filterTrace(all, 'Solar').map((r) => r.label),
      ['Solar', 'Solar'],
    );
    assert.equal(
      filterTrace(all, 'Sol').length,
      0,
      'must not be a substring match',
    );
  });
  it('returns nothing for an unknown item', () => {
    assert.deepEqual(filterTrace(all, 'Nope'), []);
  });
});

describe('clampPage', () => {
  it('keeps the page inside 1..pages', () => {
    assert.equal(clampPage(1, 30), 1);
    assert.equal(clampPage(3, 30), 3);
    assert.equal(clampPage(0, 30), 1, 'below range');
    assert.equal(clampPage(99, 30), 3, 'above range');
  });
  it('never returns 0 or a negative page for an empty set', () => {
    assert.equal(clampPage(1, 0), 1);
    assert.equal(clampPage(5, 0), 1);
  });
  it('survives a non-finite page', () => {
    assert.equal(clampPage(Number.NaN, 30), 1);
    assert.equal(clampPage(Number.POSITIVE_INFINITY, 30), 1);
  });
  it('clamps into range after filtering shrinks the list', () => {
    // was on page 4 of 4, then the filter leaves 1 row -> page 1
    assert.equal(clampPage(4, 1), 1);
  });
});

describe('pageSlice / pageCount', () => {
  const many = rows(Array.from({ length: 30 }, (_, i) => `L${i}`));
  it('slices 10 rows per page', () => {
    assert.equal(TRACE_PAGE_SIZE, 10);
    assert.deepEqual(
      pageSlice(many, 1).map((r) => r.label),
      ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9'],
    );
    assert.deepEqual(
      pageSlice(many, 3).map((r) => r.label),
      ['L20', 'L21', 'L22', 'L23', 'L24', 'L25', 'L26', 'L27', 'L28', 'L29'],
    );
  });
  it('counts pages, minimum 1', () => {
    assert.equal(pageCount(0), 1);
    assert.equal(pageCount(1), 1);
    assert.equal(pageCount(10), 1);
    assert.equal(pageCount(11), 2);
    assert.equal(pageCount(30), 3);
  });
  it('returns a short final page rather than padding', () => {
    const eleven = rows(Array.from({ length: 11 }, (_, i) => `L${i}`));
    assert.equal(pageSlice(eleven, 2).length, 1);
  });
  it('returns nothing for an empty list', () => {
    assert.deepEqual(pageSlice([], 1), []);
  });
  it('clamps an out-of-range page before slicing', () => {
    assert.equal(pageSlice(many, 99).length, 10, 'clamped to the last page');
  });
});

describe('isPageGap', () => {
  it('marks only the jump, not every later page', () => {
    // [1,2,3,6]: contiguous through 3, then a jump to 6.
    const w = [1, 2, 3, 6];
    assert.equal(isPageGap(w, 1), false);
    assert.equal(isPageGap(w, 2), false);
    assert.equal(isPageGap(w, 3), false, '3 is contiguous after 2');
    assert.equal(isPageGap(w, 6), true, '6 follows a jump from 3');
  });
  it('marks the first entry after a leading jump', () => {
    assert.equal(isPageGap([1, 4, 5, 6], 4), true);
    assert.equal(isPageGap([1, 4, 5, 6], 1), false);
    assert.equal(isPageGap([1, 4, 5, 6], 5), false);
  });
  it('marks nothing in a contiguous window', () => {
    assert.deepEqual(
      [1, 2, 3].filter((p) => isPageGap([1, 2, 3], p)),
      [],
    );
  });
  it('is false for a page that is not in the window', () => {
    assert.equal(isPageGap([1, 2, 3], 9), false);
  });
});

describe('pageWindow', () => {
  it('always includes the first and last page', () => {
    assert.equal(pageWindow(1, 9).includes(1), true);
    assert.equal(pageWindow(9, 9).includes(9), true);
    assert.equal(pageWindow(1, 9).includes(9), true);
  });
  it('includes the current page and its neighbours', () => {
    const w = pageWindow(5, 9);
    for (const p of [4, 5, 6])
      assert.equal(w.includes(p), true, `${p} should be present`);
  });
  it('never exceeds the real page count', () => {
    for (let p = 1; p <= 12; p++)
      for (const n of pageWindow(p, 12)) assert.ok(n >= 1 && n <= 12);
  });
  it('returns every page when they all fit', () => {
    assert.deepEqual(pageWindow(1, 3), [1, 2, 3]);
  });
  it('elides the middle of a long run', () => {
    assert.deepEqual(pageWindow(10, 20), [1, 8, 9, 10, 11, 12, 20]);
  });
  it('clamps an out-of-range current page before windowing', () => {
    // 99 -> 5, so the window is pages 3..5 plus the first page; 2 is out of range.
    assert.deepEqual(pageWindow(99, 5), [1, 3, 4, 5]);
  });
});

describe('sortTrace', () => {
  // Two rows whose To dates disagree with their From dates, so ordering by the
  // wrong column is detectable rather than coincidentally correct.
  const data = [
    { label: 'A', effective_from: '2026-01-01', effective_to: '2026-06-01' },
    { label: 'B', effective_from: '2026-03-01', effective_to: '2026-02-01' },
    { label: 'C', effective_from: '2026-02-01', effective_to: '2026-09-01' },
  ];
  const order = (rows) => rows.map((r) => r.label);

  it('sorts by closed date, newest first by default', () => {
    assert.deepEqual(order(sortTrace(data)), ['C', 'A', 'B']);
    assert.deepEqual(order(sortTrace(data, 'to-desc')), ['C', 'A', 'B']);
  });

  it('sorts by closed date, oldest first', () => {
    assert.deepEqual(order(sortTrace(data, 'to-asc')), ['B', 'A', 'C']);
  });

  it('sorts by start date independently of the closed date', () => {
    assert.deepEqual(order(sortTrace(data, 'from-desc')), ['B', 'C', 'A']);
    assert.deepEqual(order(sortTrace(data, 'from-asc')), ['A', 'C', 'B']);
  });

  it('does not mutate the input', () => {
    const copy = data.map((r) => ({ ...r }));
    sortTrace(data, 'from-asc');
    assert.deepEqual(data, copy);
  });

  it('sinks rows with no date to the bottom in either direction', () => {
    const withGap = [
      { label: 'X', effective_from: '', effective_to: '' },
      ...data,
    ];
    for (const dir of ['to-desc', 'to-asc', 'from-desc', 'from-asc']) {
      const out = order(sortTrace(withGap, dir));
      assert.equal(
        out[out.length - 1],
        'X',
        `${dir}: undated row must be last`,
      );
    }
  });

  it('keeps undated rows last but still orders the dated ones', () => {
    const out = order(
      sortTrace(
        [{ label: 'X', effective_from: null, effective_to: null }, ...data],
        'to-desc',
      ),
    );
    assert.deepEqual(out, ['C', 'A', 'B', 'X']);
  });

  it('handles a null value as undated rather than throwing', () => {
    const out = sortTrace([{ label: 'X', effective_to: null }], 'to-desc');
    assert.deepEqual(order(out), ['X']);
  });

  it('returns an empty array unchanged for no rows', () => {
    assert.deepEqual(sortTrace([], 'from-asc'), []);
  });
});

describe('TRACE_SORTS', () => {
  it('offers all four orderings and defaults to the first', () => {
    assert.deepEqual(
      TRACE_SORTS.map((s) => s.value),
      ['to-desc', 'to-asc', 'from-desc', 'from-asc'],
    );
    assert.equal(TRACE_SORTS[0].value, 'to-desc');
  });
  it('gives every entry a label', () => {
    for (const s of TRACE_SORTS) assert.equal(typeof s.label, 'string');
  });
});
