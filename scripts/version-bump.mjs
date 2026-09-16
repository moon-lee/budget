import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Increment an `A.B.C` version using the project's dev build-counter scheme:
 * the patch segment (C) is a counter; when it exceeds 9 it wraps to 0 and
 * the minor segment (B, range 0-9) increments; when minor exceeds 9 it wraps
 * to 0 and the major segment (A) increments.
 *
 * Mirrors `scripts/version-bump.mjs` in the main app repo so standalone
 * extensions version the same way. Keeps `package.json#version` and
 * `package.json#financeExtension.version` in sync (the installer rejects
 * downgrades via `compareVersions`, and the scaffold AGENTS.md requires
 * both fields to match).
 */
export function bumpVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version).trim());
  if (!match) {
    throw new Error(`invalid version '${version}' — expected <major>.<minor>.<patch>`);
  }
  let major = Number(match[1]);
  let minor = Number(match[2]);
  let patch = Number(match[3]);
  patch += 1;
  if (patch > 9) {
    patch = 0;
    minor += 1;
  }
  if (minor > 9) {
    minor = 0;
    major += 1;
  }
  return `${major}.${minor}.${patch}`;
}

function writeJson(file, data) {
  const raw = readFileSync(file, 'utf8');
  const trailing = raw.endsWith('\n') ? '\n' : '';
  writeFileSync(file, JSON.stringify(data, null, 2) + trailing);
}

function main() {
  // Optional project dir: `node scripts/version-bump.mjs [project-dir]`
  // (defaults to cwd, so `npm run version:bump` works from the project root).
  const projectDir = resolve(process.argv[2] ?? '.');
  const jsonPath = join(projectDir, 'package.json');
  if (!existsSync(jsonPath)) {
    console.error(`no package.json found in ${projectDir}`);
    process.exit(1);
  }
  const pkg = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const current = pkg.version;
  const next = bumpVersion(current);
  pkg.version = next;
  if (pkg.financeExtension && typeof pkg.financeExtension === 'object') {
    pkg.financeExtension.version = next;
  }
  writeJson(jsonPath, pkg);

  // Fresh scaffolds have no lockfile until `npm install` — skip silently.
  const lockPath = join(projectDir, 'package-lock.json');
  if (existsSync(lockPath)) {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    lock.version = next;
    if (lock.packages?.['']) lock.packages[''].version = next;
    writeJson(lockPath, lock);
  }

  console.log(`version bumped: ${current} -> ${next}`);
}

const invokedAsMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === fileURLToPath(pathToFileURL(process.argv[1]));

if (invokedAsMain) main();
