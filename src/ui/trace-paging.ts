/**
 * Filtering and paging for the Plan trace (closed plan-history rows).
 *
 * Pure helpers, no Lit and no DOM, so the paging arithmetic is unit-testable
 * rather than only reachable by eye. The view owns the state; these own the
 * rules.
 */

/** Rows shown per page in the Plan trace. */
export const TRACE_PAGE_SIZE = 10;

/**
 * Sort keys for the Plan trace.
 *
 * `to-*` orders by when the row was closed (effective_to), `from-*` by when it
 * opened (effective_from). `desc` is newest first, which is the default: the
 * most recent change is what you want to see.
 */
export type TraceSort = 'to-desc' | 'to-asc' | 'from-desc' | 'from-asc';

export const TRACE_SORTS: ReadonlyArray<{ value: TraceSort; label: string }> = [
  { value: 'to-desc', label: 'Closed date, newest first' },
  { value: 'to-asc', label: 'Closed date, oldest first' },
  { value: 'from-desc', label: 'Start date, newest first' },
  { value: 'from-asc', label: 'Start date, oldest first' },
];

/**
 * Order trace rows by date.
 *
 * Returns a new array; the input is left alone. Rows with a missing date sort
 * last in every direction rather than jumping to the top, so an undated row
 * never displaces the one you were looking at.
 */
export function sortTrace(rows: any[], sort: TraceSort = 'to-desc'): any[] {
  const key = sort.startsWith('from') ? 'effective_from' : 'effective_to';
  const desc = sort.endsWith('desc');
  return [...rows].sort((a, b) => {
    const av = String(a?.[key] ?? '');
    const bv = String(b?.[key] ?? '');
    // Empty dates sink to the bottom regardless of direction.
    if (!av && !bv) return 0;
    if (!av) return 1;
    if (!bv) return -1;
    return (av < bv ? -1 : av > bv ? 1 : 0) * (desc ? -1 : 1);
  });
}

/**
 * Distinct item labels, alphabetically, blanks dropped.
 *
 * Drives the filter dropdown. Sorted so the option list does not reshuffle
 * between renders as rows are archived.
 */
export function distinctTraceItems(rows: any[]): string[] {
  const seen = new Set<string>();
  for (const r of rows) {
    const label = String(r?.label ?? '').trim();
    if (label) seen.add(label);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

/**
 * Rows matching the chosen item. An empty or absent `item` keeps everything.
 */
export function filterTrace(
  rows: any[],
  item: string | null | undefined,
): any[] {
  const want = String(item ?? '').trim();
  if (!want) return rows;
  return rows.filter((r) => String(r?.label ?? '').trim() === want);
}

/**
 * Clamp a requested page into range for `total` rows.
 *
 * Filtering can leave the current page out of bounds (you are on page 4, then
 * narrow to a single item), so every render re-clamps instead of trusting the
 * stored value.
 */
export function clampPage(
  page: number,
  total: number,
  pageSize: number = TRACE_PAGE_SIZE,
): number {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (!Number.isFinite(page)) return 1;
  return Math.min(Math.max(1, Math.trunc(page)), pages);
}

/** The slice of rows for one page. */
export function pageSlice<T>(
  rows: T[],
  page: number,
  pageSize: number = TRACE_PAGE_SIZE,
): T[] {
  if (rows.length === 0) return [];
  const p = clampPage(page, rows.length, pageSize);
  const start = (p - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

/** Total page count, at least 1 so the UI never renders "of 0". */
export function pageCount(
  total: number,
  pageSize: number = TRACE_PAGE_SIZE,
): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/**
 * Page numbers to render in the pager, e.g. [1,2,3,4,9].
 *
 * `pages` is the page COUNT (from `pageCount`), not a row count - passing rows
 * here would silently produce a one-page pager.
 */
export function pageWindow(current: number, pages: number, span = 2): number[] {
  const total = Math.max(1, Math.trunc(pages));
  // Clamp against the page count directly - clampPage() takes a ROW count and
  // would divide it again, silently collapsing the window to page 1.
  const cur = Number.isFinite(current)
    ? Math.min(Math.max(1, Math.trunc(current)), total)
    : 1;
  const out = new Set<number>();
  for (let p = 1; p <= total; p++) {
    if (p === 1 || p === total || Math.abs(p - cur) <= span) out.add(p);
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * Whether a page number starts a new run, i.e. pages were skipped before it.
 * Drives the visual divider in the pager.
 *
 * Derived from the window itself rather than from page totals, so a
 * contiguous window like [1,2,3,6] marks only the 6 as a jump - computing it
 * from totals would wrongly mark the 3 as well.
 */
export function isPageGap(window: number[], p: number): boolean {
  const i = window.indexOf(p);
  if (i <= 0) return false; // first entry, or not in the window
  return window[i - 1] !== p - 1;
}
