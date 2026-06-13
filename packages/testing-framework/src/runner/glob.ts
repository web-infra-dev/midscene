import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Minimal glob support for case discovery. Supports `**`, `*`, and `?` against
 * POSIX-style relative paths. Kept dependency-free on purpose (Phase 0 only
 * needs patterns like `**\/*.yaml` and `**\/*.draft.yaml`).
 */
export function globToRegExp(pattern: string): RegExp {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        // `**` — match across path segments
        i++;
        if (pattern[i + 1] === '/') i++;
        re += '(?:.*/)?';
      } else {
        // `*` — match within a single segment
        re += '[^/]*';
      }
    } else if (ch === '?') {
      re += '[^/]';
    } else if ('.+^${}()|[]\\'.includes(ch)) {
      re += `\\${ch}`;
    } else {
      re += ch;
    }
  }
  return new RegExp(`^${re}$`);
}

export function matchesAny(relPath: string, patterns: string[]): boolean {
  return patterns.some((p) => globToRegExp(p).test(relPath));
}

/** Recursively list files under `dir` as POSIX-style paths relative to it. */
export function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string) => {
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(current, entry);
      let stat: ReturnType<typeof statSync>;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue;
        walk(full);
      } else {
        out.push(relative(dir, full).split(sep).join('/'));
      }
    }
  };
  walk(dir);
  return out;
}

export function discoverCases(
  testDir: string,
  include: string[],
  exclude: string[] = [],
): string[] {
  const files = listFiles(testDir);
  return files
    .filter((f) => matchesAny(f, include))
    .filter((f) => exclude.length === 0 || !matchesAny(f, exclude))
    .sort()
    .map((f) => join(testDir, f));
}
