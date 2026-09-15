// Seed data from spec §2 (CashFlow sheet values read 2026-09-13).
// First plan date: start of FY 2026-2027 (sheet '2026-2027').
export const SEED_EFFECTIVE_FROM = '2026-07-01';

export interface SeedAccount {
  account_key: string;
  bank: string | null;
  label: string;
  sort_order: number;
}

export const SEED_ACCOUNTS: ReadonlyArray<SeedAccount> = [
  { account_key: '5272', bank: 'NAB SAVING', label: 'Emergency', sort_order: 1 },
  { account_key: '0743', bank: 'NAB SAVING', label: 'Child', sort_order: 2 },
  { account_key: '8107', bank: 'NAB SAVING', label: 'Solar', sort_order: 3 },
  { account_key: '4323', bank: 'NAB SAVING', label: 'Investment', sort_order: 4 },
  { account_key: '3545', bank: 'NAB SAVING', label: 'New Car', sort_order: 5 },
  { account_key: '9722', bank: 'NAB SAVING', label: 'Emergency 2', sort_order: 6 },
  { account_key: '3564', bank: 'NAB SAVING', label: 'Bills hub', sort_order: 7 },
  { account_key: '0390', bank: 'NAB OFFSET', label: 'Mortgage / Bills hub', sort_order: 8 },
  { account_key: '2730', bank: 'BOQ', label: 'Family Fund', sort_order: 9 },
  { account_key: '3804', bank: 'MACQUARIE', label: 'Home Expenses', sort_order: 10 },
  { account_key: '9282', bank: 'UBANK', label: 'Private Fund', sort_order: 11 },
];

export interface SeedPot {
  pot_key: string;
  label: string;
  kind: 'saving' | 'expense';
  weekly_amount: number;
  /** account_key lookup; null when the sheet names no account. */
  account: string | null;
}

export const SEED_POTS: ReadonlyArray<SeedPot> = [
  // Savings pots (sheet rows 5–14 + Mortgage OFFSET): $820/wk
  { pot_key: 'emergency', label: 'Emergency', kind: 'saving', weekly_amount: 250, account: '5272' },
  { pot_key: 'child', label: 'Child', kind: 'saving', weekly_amount: 10, account: '0743' },
  { pot_key: 'solar', label: 'Solar', kind: 'saving', weekly_amount: 50, account: '8107' },
  { pot_key: 'investment', label: 'Investment', kind: 'saving', weekly_amount: 50, account: '4323' },
  { pot_key: 'new-car', label: 'New Car', kind: 'saving', weekly_amount: 20, account: '3545' },
  { pot_key: 'family-fund', label: 'Family Fund', kind: 'saving', weekly_amount: 10, account: '2730' },
  { pot_key: 'home-expenses', label: 'Home Expenses', kind: 'saving', weekly_amount: 10, account: '3804' },
  { pot_key: 'emergency-3', label: 'Private Fund', kind: 'saving', weekly_amount: 10, account: '9282' },
  { pot_key: 'emergency-2', label: 'Emergency 2', kind: 'saving', weekly_amount: 10, account: '9722' },
  { pot_key: 'mortgage', label: 'Mortgage', kind: 'saving', weekly_amount: 400, account: '0390' },
  // Expense lines (sheet rows 19–28): $500/wk, no bank
  { pot_key: 'power-bill', label: 'Power Bill', kind: 'expense', weekly_amount: 50, account: '0390' },
  { pot_key: 'car-rego-insurance', label: 'Car Rego & Insurance', kind: 'expense', weekly_amount: 100, account: '0390' },
  { pot_key: 'rates-water', label: 'Rates and Water', kind: 'expense', weekly_amount: 100, account: '0390' },
  { pot_key: 'home-insurance', label: 'Home Insurance', kind: 'expense', weekly_amount: 30, account: '0390' },
  { pot_key: 'internet', label: 'Internet', kind: 'expense', weekly_amount: 27, account: '3564' },
  { pot_key: 'mobile', label: 'Mobile', kind: 'expense', weekly_amount: 42, account: '3564' },
  { pot_key: 'medibank', label: 'Medibank', kind: 'expense', weekly_amount: 28, account: '3564' },
  { pot_key: 'union-fee', label: 'Union Fee', kind: 'expense', weekly_amount: 20, account: '3564' },
  { pot_key: 'fitness-pass', label: 'Fitness Pass', kind: 'expense', weekly_amount: 53, account: '3564' },
  { pot_key: 'car-fuel', label: 'Car Fuel', kind: 'expense', weekly_amount: 50, account: '3564' },
];

export interface SeedFlow {
  flow_key: string;
  day: 'friday' | 'sunday';
  label: string;
  weekly_amount: number;
  /** account_key lookup. */
  account: string | null;
}

export const SEED_FLOWS: ReadonlyArray<SeedFlow> = [
  // Friday pay-day moves (sheet col G/H rows 2–6)
  { flow_key: 'friday-mortgage', day: 'friday', label: 'Mortgage', weekly_amount: 400, account: '0390' },
  { flow_key: 'friday-bill-big4', day: 'friday', label: 'Bill-Big4', weekly_amount: 280, account: '0390' },
  { flow_key: 'friday-car-fuel', day: 'friday', label: 'Car Fuel', weekly_amount: 50, account: '3564' },
  { flow_key: 'friday-bills', day: 'friday', label: 'Bills', weekly_amount: 170, account: '3564' },
  // Sunday moves (sheet col G/H rows 8–19)
  { flow_key: 'sunday-solar', day: 'sunday', label: 'Solar', weekly_amount: 50, account: '8107' },
  { flow_key: 'sunday-emergency', day: 'sunday', label: 'Emergency', weekly_amount: 240, account: '5272' },
  { flow_key: 'sunday-investment', day: 'sunday', label: 'Investment', weekly_amount: 50, account: '4323' },
  { flow_key: 'sunday-emergency-2', day: 'sunday', label: 'Emergency 2', weekly_amount: 10, account: '9722' },
  { flow_key: 'sunday-car', day: 'sunday', label: 'Car', weekly_amount: 20, account: '3545' },
  { flow_key: 'sunday-child', day: 'sunday', label: 'Child', weekly_amount: 10, account: '0743' },
  { flow_key: 'sunday-home', day: 'sunday', label: 'Home', weekly_amount: 10, account: '3804' },
  { flow_key: 'sunday-family', day: 'sunday', label: 'Family', weekly_amount: 10, account: '2730' },
  { flow_key: 'sunday-emergency-3', day: 'sunday', label: 'Private Fund', weekly_amount: 10, account: '9282' },
];
