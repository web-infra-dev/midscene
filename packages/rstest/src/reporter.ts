import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Reporter, TestFileResult } from '@rstest/core';
import { MANIFEST_DIR, manifestKey } from './utils';

// node:util.styleText was added in Node 20; use a raw ANSI escape so the
// Node 18.19+ floor declared in `engines` keeps working.
const cyan = (text: string): string => `\x1b[36m${text}\x1b[0m`;

export default class MidsceneReporter implements Reporter {
  onTestRunStart(): void {
    // Pre-clean in case a previous run crashed mid-flight.
    rmSync(MANIFEST_DIR, { recursive: true, force: true });
  }

  onTestFileResult(file: TestFileResult): void {
    const manifestFile = join(
      MANIFEST_DIR,
      `${manifestKey(file.testPath)}.txt`,
    );
    let report: string;
    try {
      report = readFileSync(manifestFile, 'utf8').trim();
    } catch {
      return;
    }
    if (!report) return;
    console.log(`  ${cyan(`Midscene report: ${report}`)}`);
  }
}
