/**
 * Per-account row colors for the Budget Overview.
 *
 * Each account gets one hue from a fixed palette so a pot row, an expense line
 * row, and a move row on the same account are visually the same family. The
 * hue is chosen by the account's RANK in the sort_order-sorted list — not by
 * `account_id` — so appending an account gives it a new color without
 * recoloring any existing one.
 *
 * Two parallel palettes: the dark set is tuned for the app's `--ff-bg-base`
 * (#1e1e1e), the light set for `body.light-theme` (#f8fafc). Same hexes do not
 * read on both, so the light variants are darker.
 *
 * Lives here rather than in `styles/ext-tokens.css` because that file is a
 * vendored snapshot overwritten by the host app's `refresh` command
 * (AGENTS.md §1, §10).
 */

/** 12 hues for dark theme surfaces. Index = account rank. */
export const ACCOUNT_HUES: readonly string[] = [
  '#4ec9b0', // teal
  '#569cd6', // blue
  '#c586c0', // pink
  '#dcdcaa', // sand
  '#6a9955', // green
  '#e5c07b', // amber
  '#9cdcfe', // sky
  '#c8c8c8', // silver
  '#b5cea8', // mint
  '#f28b82', // salmon
  '#d18f52', // clay
  '#7fdbca', // aqua
];

/** Darker variants of the same 12 hues, for `body.light-theme`. */
export const ACCOUNT_HUES_LIGHT: readonly string[] = [
  '#0f766e', // teal
  '#1d4ed8', // blue
  '#a21caf', // pink
  '#854d0e', // sand
  '#3f6212', // green
  '#b45309', // amber
  '#0369a1', // sky
  '#64748b', // silver
  '#4d7c0f', // mint
  '#be123c', // salmon
  '#c2410c', // clay
  '#0f766e', // aqua
];

export interface HuePair {
  /** Dark-theme hex. */
  hue: string;
  /** Light-theme hex. */
  hueLight: string;
}

/**
 * Palette index for an account, or null when there is nothing to color.
 *
 * Index is the account's position in the (already sort_order-sorted) map's
 * values. Cycles past the palette size, so two accounts may share a hue — the
 * bar is a pairing aid, not a uniqueness guarantee.
 */
export function hueIndexForAccount(
  accounts: Map<number, { sort_order: number }>,
  id: number | null | undefined,
): number | null {
  if (id == null) return null;
  let index = 0;
  for (const key of accounts.keys()) {
    if (Number(key) === Number(id)) return index % ACCOUNT_HUES.length;
    index++;
  }
  return null;
}

/**
 * Dark and light hexes for an account's row, or null when the row has no
 * account (or references an account that no longer exists). Callers render
 * `null` as an uncolored row.
 */
export function huePairForAccount(
  accounts: Map<number, { sort_order: number }>,
  id: number | null | undefined,
): HuePair | null {
  const index = hueIndexForAccount(accounts, id);
  if (index == null) return null;
  return { hue: ACCOUNT_HUES[index], hueLight: ACCOUNT_HUES_LIGHT[index] };
}
