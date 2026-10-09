/**
 * Pot/line ↔ move pairing for the Budget Overview.
 *
 * The data model is deliberately many-pots-to-one-move: on a hub account like
 * 3564 (Bills hub), five expense lines together fund a single `Bills` move. A
 * plain 1:1 pairing cannot express that, and name matching alone cannot either
 * because the hub move's label (`Bills`) matches none of its lines.
 *
 * So pairs are resolved per account, in tiers:
 *
 *   T1  1 pot : 1 move on the account          -> pair directly
 *   T2  n:n, but the pot's name matches exactly
 *       one move on the same account          -> pair those, drop both
 *   T3  leftover pots + EXACTLY ONE leftover
 *       move                                  -> one group; the sums must agree
 *   T4  leftover pots + two or more leftover
 *       moves                                 -> undecidable, so each leftover pot
 *                                               stands alone. Never guess which
 *                                               pot funds which move.
 *
 * T4 is the important one: the honest answer is "we do not know". Grouping them
 * anyway would imply a pairing that does not exist.
 *
 * Name matching is case- and whitespace-insensitive, so `Car Fuel` matches
 * `car Fuel`. It also requires the match to be unique on both sides - a
 * duplicated name leaves both pots unpaired rather than pairing to an arbitrary
 * one.
 *
 * Lives outside the Lit component so it is unit-testable; it touches no DOM.
 */

export interface PairingGroup {
  /** Pot/line rows in this group. */
  pots: any[];
  /** Move rows in this group. */
  moves: any[];
}

const norm = (s: unknown): string =>
  String(s ?? '')
    .trim()
    .toLowerCase();

/**
 * Resolve pot/line ↔ move groups across every account.
 *
 * Pure: takes plain arrays (the shape `listCurrentPots` / `listCurrentFlows`
 * return) and returns fresh arrays. Rows with no account are skipped - they can
 * never pair with a move.
 */
export function computePairingGroups(
  pots: any[],
  flows: any[],
): PairingGroup[] {
  const groups: PairingGroup[] = [];

  const accountIds = [
    ...new Set([
      ...pots.map((p) => p.account_id),
      ...flows.map((f) => f.account_id),
    ]),
  ]
    .filter((id) => id != null)
    .map(Number);

  for (const id of accountIds) {
    const ap = pots.filter((p) => Number(p.account_id) === id);
    const af = flows.filter((f) => Number(f.account_id) === id);

    // T1: the account has exactly one pot and one move.
    if (ap.length === 1 && af.length === 1) {
      groups.push({ pots: ap, moves: af });
      continue;
    }

    // T2: unique name matches within this account.
    const pairedMoves = new Set<any>();
    const pairedPots = new Set<any>();
    for (const p of ap) {
      const hits = af.filter(
        (f) => !pairedMoves.has(f) && norm(f.label) === norm(p.label),
      );
      // Require a unique hit on both sides: a duplicated name must not pair.
      const potNameHits = ap.filter((q) => norm(q.label) === norm(p.label));
      if (hits.length === 1 && potNameHits.length === 1) {
        groups.push({ pots: [p], moves: [hits[0]] });
        pairedPots.add(p);
        pairedMoves.add(hits[0]);
      }
    }

    const restPots = ap.filter((p) => !pairedPots.has(p));
    const restMoves = af.filter((f) => !pairedMoves.has(f));

    // T3: exactly one leftover move can absorb every leftover pot.
    if (restPots.length > 0 && restMoves.length === 1) {
      groups.push({ pots: restPots, moves: restMoves });
      continue;
    }

    // T4: undecidable. Each leftover pot stands alone.
    for (const p of restPots) groups.push({ pots: [p], moves: [] });
    for (const f of restMoves) groups.push({ pots: [], moves: [f] });
  }

  return groups;
}

/** Stable key for a pot or flow row; pots and flows share one namespace. */
export function rowKeyOf(row: any): string {
  return row?.pot_key != null ? `p:${row.pot_key}` : `f:${row.flow_key}`;
}

const sum = (rows: any[]): number =>
  Math.round(
    rows.reduce((t, r) => t + Number(r?.weekly_amount || 0), 0) * 100,
  ) / 100;

/**
 * Row keys whose pairing group does not balance.
 *
 * Deliberately group-scoped rather than account-scoped. A hub account can hold
 * several independent groups, so an account-level rollup turns every row on the
 * account gold when only one group is actually off - flagging pairs that are
 * provably balanced. Group scope marks exactly the rows that cannot be
 * reconciled.
 *
 * Groups with only one side are NOT reported: nothing funds them, or nothing
 * funds the move, but that is not the same as a figure that disagrees. The
 * hover hint says so explicitly; gilding them would be noise.
 */
export function mismatchedRowKeys(groups: PairingGroup[]): Set<string> {
  const bad = new Set<string>();
  for (const g of groups) {
    if (!g.pots.length || !g.moves.length) continue;
    if (sum(g.pots) === sum(g.moves)) continue;
    for (const r of [...g.pots, ...g.moves]) bad.add(rowKeyOf(r));
  }
  return bad;
}
