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

/**
 * 12 hues for dark theme surfaces. Index = account rank.
 *
 * Deliberately excludes anything close to the mismatch gold
 * (`--ff-warning-text` #ffd866): a mismatched row paints its whole text gold
 * (see `.mismatch` in budget-overview-view.ts), so a gold-ish account hue would
 * make "this account is coloured" and "this account is off" look identical.
 */
export const ACCOUNT_HUES: readonly string[] = [
  '#4ec9b0', // teal
  '#569cd6', // blue
  '#c586c0', // pink
  '#9cdcfe', // sky
  '#6a9955', // green
  '#c8c8c8', // silver
  '#b5cea8', // mint
  '#f28b82', // salmon
  '#7fdbca', // aqua
  '#4a7fb5', // steel
  '#ba9ee8', // lavender
  '#5fb3b3', // seafoam
];

/** Darker variants of the same 12 hues, for `body.light-theme`. */
export const ACCOUNT_HUES_LIGHT: readonly string[] = [
  '#0f766e', // teal
  '#1d4ed8', // blue
  '#a21caf', // pink
  '#0369a1', // sky
  '#3f6212', // green
  '#64748b', // silver
  '#4d7c0f', // mint
  '#be123c', // salmon
  '#0f766e', // aqua
  '#1e40af', // steel
  '#6b21a8', // lavender
  '#115e59', // seafoam
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
 * Account cell colour is a pairing aid, not a uniqueness guarantee.
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
