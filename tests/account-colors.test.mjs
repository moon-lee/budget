import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCOUNT_HUES,
  ACCOUNT_HUES_LIGHT,
  hueIndexForAccount,
  huePairForAccount,
} from '../build/test/ui/account-colors.js';

/** Build an account map the way `accountById` does: already sort_order-sorted. */
const mapOf = (ids) =>
  new Map(ids.map((id, i) => [id, { id, sort_order: i + 1 }]));

describe('account palettes', () => {
  it('has the same number of dark and light hues', () => {
    assert.equal(ACCOUNT_HUES.length, ACCOUNT_HUES_LIGHT.length);
  });

  it('uses 6-digit hex for every hue', () => {
    for (const hex of [...ACCOUNT_HUES, ...ACCOUNT_HUES_LIGHT]) {
      assert.match(hex, /^#[0-9a-f]{6}$/i, `bad hue ${hex}`);
    }
  });

  it('keeps every hue clear of the mismatch gold', () => {
    // A mismatched row paints its whole text gold, so an account hue within
    // ~35deg of the gold would read as "this account is off" when it is not.
    // Grey (no hue) and low-saturation tints are safe — they cannot pass for gold.
    const hueAngle = (hex) => {
      const [r, g, b] = [1, 3, 5].map(
        (i) => parseInt(hex.slice(i, i + 2), 16) / 255,
      );
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const d = max - min;
      if (d === 0) return null; // achromatic
      let h;
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      return (h * 60 + 360) % 360;
    };
    const saturation = (hex) => {
      const [r, g, b] = [1, 3, 5].map(
        (i) => parseInt(hex.slice(i, i + 2), 16) / 255,
      );
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      return max === 0 ? 0 : (max - min) / max;
    };
    const angleGap = (a, b) => {
      const d = Math.abs(a - b) % 360;
      return d > 180 ? 360 - d : d;
    };

    const check = (hues, mismatch, label) => {
      const gold = hueAngle(mismatch);
      for (const hex of hues) {
        const a = hueAngle(hex);
        if (a === null) continue; // achromatic grey
        if (saturation(hex) <= 0.25) continue; // too washed out to read as gold
        const gap = angleGap(a, gold);
        assert.ok(
          gap >= 35,
          `${label} hue ${hex} is ${gap}deg from mismatch ${mismatch}`,
        );
      }
    };

    check(ACCOUNT_HUES, '#ffd866', 'dark');
    check(ACCOUNT_HUES_LIGHT, '#92400e', 'light');
  });
});

describe('hueIndexForAccount', () => {
  it('returns the rank of the account in the sorted map', () => {
    const accounts = mapOf([10, 20, 30]);
    assert.equal(hueIndexForAccount(accounts, 10), 0);
    assert.equal(hueIndexForAccount(accounts, 20), 1);
    assert.equal(hueIndexForAccount(accounts, 30), 2);
  });

  it('returns null for a null or undefined account id', () => {
    const accounts = mapOf([10]);
    assert.equal(hueIndexForAccount(accounts, null), null);
    assert.equal(hueIndexForAccount(accounts, undefined), null);
  });

  it('returns null for an id that is not in the map', () => {
    assert.equal(hueIndexForAccount(mapOf([10, 20]), 99), null);
  });

  it('is stable when an account is appended at the end', () => {
    const before = mapOf([10, 20, 30]);
    const after = mapOf([10, 20, 30, 40]);
    for (const id of [10, 20, 30]) {
      assert.equal(
        hueIndexForAccount(after, id),
        hueIndexForAccount(before, id),
      );
    }
  });

  it('cycles back to the first hue past the palette size', () => {
    const size = ACCOUNT_HUES.length;
    const ids = Array.from({ length: size + 2 }, (_, i) => i + 1);
    const accounts = mapOf(ids);
    // ids[i] sits at rank i, so rank `size` wraps to hue 0 and `size + 1` to hue 1.
    assert.equal(hueIndexForAccount(accounts, ids[size]), 0);
    assert.equal(hueIndexForAccount(accounts, ids[size + 1]), 1);
  });

  it('matches a string id against numeric keys', () => {
    assert.equal(hueIndexForAccount(mapOf([10, 20]), '20'), 1);
  });
});

describe('huePairForAccount', () => {
  it('returns matching dark and light hexes at the same index', () => {
    const accounts = mapOf([10, 20, 30]);
    const pair = huePairForAccount(accounts, 20);
    assert.equal(pair.hue, ACCOUNT_HUES[1]);
    assert.equal(pair.hueLight, ACCOUNT_HUES_LIGHT[1]);
  });

  it('returns null when there is no account to color', () => {
    assert.equal(huePairForAccount(mapOf([10]), null), null);
    assert.equal(huePairForAccount(mapOf([10]), 99), null);
  });
});
