/**
 * Cucumber config preset for @midscene/bdd.
 *
 * A user's entire `cucumber.js` can be:
 *
 *   module.exports = require('@midscene/bdd/profile').defineProfile();
 *
 * Merge semantics relative to the base profile:
 * - `import` / `format`: concatenated (base first, then overrides), deduped.
 * - `paths`: replaced when provided.
 * - `tags`: combined as `(<base>) and (<override>)`. The base tag is
 *   `not @flow` — flow scenarios are reusable sub-procedures and must never
 *   run as standalone tests, so the base tag always survives. Even if the
 *   override mentions `@flow` itself (e.g. `@smoke or @flow`), we still
 *   combine; the `not @flow` half wins by construction.
 * - Any other keys are shallow-spread on top of the base.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { ERROR_PREFIX } from './types';

function isMidsceneBddPackage(dir: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'));
    return pkg.name === '@midscene/bdd';
  } catch {
    return false;
  }
}

export interface ProfileOverrides {
  import?: string[];
  paths?: string[];
  tags?: string;
  format?: string[];
  [key: string]: unknown;
}

/**
 * cucumber expands `import:` entries as file globs against the project cwd —
 * bare module specifiers like '@midscene/bdd/register' match no files and are
 * silently dropped. The preset must therefore inject the ABSOLUTE file path
 * of the register module.
 */
function resolveRegisterPath(): string {
  const candidates: string[] = [];
  // Built output: register.* is a sibling of profile.* in dist/lib | dist/es.
  // (Plain path joins are bundler-inert; rspack rewrites require.resolve.)
  if (typeof __dirname !== 'undefined') {
    candidates.push(
      join(__dirname, 'register.js'),
      join(__dirname, 'register.mjs'),
    );
  }
  // Dev: running from source (e.g. vitest) before dist is built. Guarded by
  // the package name so a USER project's own src/register.ts is never
  // mistaken for ours.
  const cwd = process.cwd();
  if (isMidsceneBddPackage(cwd)) {
    candidates.push(join(cwd, 'src/register.ts'));
  }
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  try {
    // Last resort (e.g. ESM build without __dirname): resolve the installed
    // package from the user's project.
    return createRequire(join(process.cwd(), 'noop.js')).resolve(
      '@midscene/bdd/register',
    );
  } catch {
    throw new Error(
      `${ERROR_PREFIX} Could not resolve @midscene/bdd/register — is @midscene/bdd installed and built?`,
    );
  }
}

function baseProfile() {
  return {
    import: [resolveRegisterPath(), 'features/step_definitions/**/*.js'],
    paths: ['features/**/*.feature'],
    tags: 'not @flow',
    format: ['progress'],
  };
}

function profileError(message: string): Error {
  return new Error(`${ERROR_PREFIX} defineProfile: ${message}`);
}

function assertStringArray(
  value: unknown,
  key: string,
): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== 'string')
  ) {
    throw profileError(`overrides.${key} must be an array of strings`);
  }
}

function concatDedupe(base: readonly string[], extra: string[]): string[] {
  return [...new Set([...base, ...extra])];
}

export function defineProfile(overrides: ProfileOverrides = {}): {
  default: Record<string, unknown>;
} {
  if (typeof overrides !== 'object' || overrides === null) {
    throw profileError(`overrides must be an object, got ${typeof overrides}`);
  }

  const {
    import: importOverride,
    paths: pathsOverride,
    tags: tagsOverride,
    format: formatOverride,
    ...rest
  } = overrides;

  if (importOverride !== undefined) {
    assertStringArray(importOverride, 'import');
  }
  if (pathsOverride !== undefined) {
    assertStringArray(pathsOverride, 'paths');
  }
  if (formatOverride !== undefined) {
    assertStringArray(formatOverride, 'format');
  }
  if (tagsOverride !== undefined && typeof tagsOverride !== 'string') {
    throw profileError('overrides.tags must be a string');
  }

  const base = baseProfile();
  const merged: Record<string, unknown> = {
    ...rest,
    import: importOverride
      ? concatDedupe(base.import, importOverride)
      : base.import,
    paths: pathsOverride ?? base.paths,
    tags: tagsOverride ? `(${base.tags}) and (${tagsOverride})` : base.tags,
    format: formatOverride
      ? concatDedupe(base.format, formatOverride)
      : base.format,
  };

  return { default: merged };
}
