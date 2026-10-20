import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@rstest/core';

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));

function styleFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? styleFiles(path)
      : entry.name.endsWith('.less')
        ? [path]
        : [];
  });
}

describe('report typography', () => {
  it('keeps explicitly sized report text at least 12 CSS pixels', () => {
    const violations: string[] = [];
    for (const file of styleFiles(sourceRoot)) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(
        /font(?:-size)?:\s*(\d+(?:\.\d+)?)px\b/g,
      )) {
        if (Number(match[1]) < 12) violations.push(`${file}: ${match[0]}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
