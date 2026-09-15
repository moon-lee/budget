/**
 * Public Finance platform contracts shared by Core, Extension Host, and extensions.
 *
 * The manifest type is the source of truth for what an extension may declare.
 * Runtime validation lives in `src/extension-host/manifest-schema.ts` (Zod).
 * If you change a type here, mirror the change in the Zod schema.
 *
 * Table manifest re-exports (`TableManifest`, `ColumnManifest`) come from
 * `src/main/services/shared-data-tables.ts` so there is exactly one
 * definition shared by the registry, DAO, Zod schema, and extension authors.
 * The import path crosses from `src/types/` into `src/main/services/` —
 * acceptable because the import is type-only (`export type`) and the types
 * are pure interfaces with no runtime coupling. If a future refactor moves
 * these types into a `src/shared/` module, only the import paths below
 * change; the public contract here stays identical.
 */

export type ActivationEvent =
  | '*'
  | 'onStartup'
  | `onView:${string}`
  | `onCommand:${string}`;

export type { LogLevel, LogPayload } from '../main/services/logger';
export type { ExtensionLogger } from '../extension-host/api/logger';

// Re-exports of the table manifest types from the Shared Data tables module.
// Per Phase 4 plan Task 8.1 / Decision 3, extension authors consume these
// types via the canonical `finance.d.ts` surface rather than reaching into
// `src/main/services/`. The source-of-truth definitions live in
// `src/main/services/shared-data-tables.ts` so the registry, DAO, and
// extension authors all share one schema.
export type { TableManifest, ColumnManifest, ColumnType } from '../main/services/shared-data-tables';
export type { DomainServiceImpl } from '../main/services/domain-service-registry';
export type { EventsApi } from '../extension-host/api/events';

// Re-export the public per-extension API contract so extension authors can
// write `import type { FinanceApi } from 'finance'` (Phase 4 Decision 9 — the
// canonical type-only SDK). This is a type-only re-export; the runtime
// implementation lives in `src/extension-host/api/index.ts`, but extensions
// must never import that module directly (it would bundle Core internals into
// the extension). The `finance` tsconfig `paths` entry + Vite `resolve.alias`
// map both point here; the build test (Task 13.3) fails the build if any
// non-type `finance` import slips through.
export type { FinanceApi } from '../extension-host/api/index';

export interface ManifestViewContribution {
  /** Stable view id used for activation events and Navigation Panel grouping. */
  id: string;
  /** Human-readable label shown in the Activity Bar tooltip and Navigation Panel header. */
  name: string;
  /**
   * Legacy one/two-character glyph or a relative extension asset path such as
   * `assets/icon.svg` / `assets/icon.png`. Activity Bar renders asset icons;
   * legacy values remain supported as text. Tab icons are unaffected.
   */
  icon: string;
  /**
   * Optional command (executed in the Host with real service bindings) that
   * opens this view with current data. Views whose data is Host-computed
   * (e.g. dashboard aggregates) declare this so the Activity Bar's
   * activate-view path re-runs the computation instead of mounting a
   * data-less panel. Must reference a command defined in `commands[]`.
   */
  openCommand?: string;
}

export interface ManifestCommandContribution {
  /** Stable command id; must be unique across all installed extensions. */
  id: string;
  /** Human-readable title shown in the Command Palette. */
  title: string;
  /**
   * Optional keyboard shortcut binding in Electron `accelerator` form
   * (e.g. `Ctrl+Shift+S`). Not enforced in Phase 3; registered for Phase 7.
   */
  keybinding?: string;
}

export interface ManifestMenuContribution {
  command: string;
  /** Grouping label in the top menu bar (e.g. "File", "View", "Salary"). */
  group: string;
  /** Optional sort key within the group. */
  order?: number;
}

export interface ManifestConfigurationContribution {
  /** Full settings key in `extensionId.localKey` form. */
  key: string;
  type: 'string' | 'number' | 'boolean' | 'enum' | 'object';
  label: string;
  default?: unknown;
  /** Required for `enum` type. */
  enumOptions?: string[];
  /** Full-string RegExp the value must match (string inputs). */
  pattern?: string;
  /** Human-readable expected format, shown as helper text (e.g. `MM-DD`). */
  formatHint?: string;
  /** Example value shown as the input placeholder. */
  placeholder?: string;
}

export interface ManifestNavigationContribution {
  id: string;
  label: string;
  command: string;
  group?: string;
  icon?: string;
}

export interface ManifestContributions {
  views?: ManifestViewContribution[];
  commands?: ManifestCommandContribution[];
  menus?: ManifestMenuContribution[];
  configuration?: ManifestConfigurationContribution[];
  navigation?: ManifestNavigationContribution[];
  allowedCommands?: string[];
  allowedUiEvents?: string[];
}

export interface FinanceExtensionManifest {
  /** Globally unique extension id (e.g. `salary-history`). Must match `package.json#name`. */
  id: string;
  displayName: string;
  /** Semver version string. */
  version: string;
  /** Short description, shown in the Extension Manager UI (Phase 8). */
  description?: string;
  /** Shared icon and panel accent color in `#RRGGBB` form. */
  themeColor?: string;
  /** Optional list of other extension ids this extension depends on. */
  dependencies?: string[];
  /**
   * Activation events that cause this extension's code to be loaded.
   * `*` activates immediately on app start (use sparingly).
   */
  activationEvents: ActivationEvent[];
  contributions: ManifestContributions;
  /**
   * Optional list of extension-owned tables this extension declares. Per
   * Decision 3, each table becomes a row in the schema registry at
   * activation time; the registry generates a Zod validator from the
   * column declarations and the DAO service enforces the namespace
   * prefix (`<extensionId>_*`). The runtime Zod schema
   * (`financeExtensionManifestSchema` in `manifest-schema.ts`) validates
   * the shape; the registry enforces ownership.
   */
  tables?: readonly TableManifest[];
  /** Path to the extension's CommonJS or ESM entry relative to its package root. */
  main: string;
  /**
   * Phase 7 Task 13 — if true, this extension's panels are never
   * auto-unmounted by the lazy-unmount timer. Use for panels that must
   * stay alive for correctness (e.g. an active AI assistant panel).
   */
  keepAlive?: boolean;
}

/**
 * The shape of the `financeExtension` field inside an extension's `package.json`.
 * Mirrors `FinanceExtensionManifest` — kept separate so package authors do not
 * need to import the full Core type to write a manifest.
 */
export interface PackageJsonFinanceExtension extends Omit<FinanceExtensionManifest, 'version'> {
  version?: string; // falls back to package.json#version if omitted
}

/**
 * Phase 7 Task 12 / Task 11 — documented workspace settings keys.
 *
 * Extensions can read/write these via `finance.settings.get` /
 * `finance.settings.set`. Core reads them with `getSetting<T>()`.
 *
 * `core.workspace.autoSaveTimeout`
 *   Milliseconds before `autoSaveDraft` times out. Default: 500.
 *
 * `core.workspace.lazyUnmountTimeout`
 *   Milliseconds a panel must be inactive before the lazy-unmount timer
 *   destroys its `WebContentsView`. Default: 300000 (5 minutes).
 *   Set to a lower value during testing (e.g. 10000).
 *
 * Phase 7 Task 22 — toast/notification event topics published by Core.
 * Extensions (and the renderer toast component) can listen for these via
 * `finance.events.on(topic, handler)`.
 *
 * `panel.lazy-unmount`
 *   Published before a panel is lazy-unmounted. Payload: `{ panelId, viewId }`.
 *
 * `panel.auto-save-failed`
 *   Published when `autoSaveDraft()` times out. Payload: `{ panelId }`.
 *
 * `extension.host-status`
 *   Published on Host lifecycle changes. Payload: `{ status }` where status
 *   is one of `starting`, `ready`, `crashed`, `restarting`, `restart-failed`.
 *
 * `settings.changed`
 *   Published after a setting is persisted via `financeShell.settings.set`.
 *   Payload: `{ key }` where `key` is the settings key that was saved.
 *
 * `db-changed`
 *   Published by Core after every extension-table write (insert/update/
 *   delete), regardless of origin (Host commands, panel UI). Payload:
 *   `{ extensionId, table, op }`. Consumers filter on `table` (e.g. the
 *   dashboard refreshes its todo card only for `todo_list_items`).
 */
