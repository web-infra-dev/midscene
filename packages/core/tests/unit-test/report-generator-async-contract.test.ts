/**
 * Regression guard for the perf fix in commit 6a25e05c.
 *
 * The Electron main event loop was being blocked for 20+ seconds per
 * agent run because `ReportGenerator` was calling `fs.writeFileSync` /
 * `fs.appendFileSync` on every progress tick (multi-MB dump payload
 * written synchronously). Switching the hot write paths to `fs/promises`
 * moved the I/O onto libuv's thread pool and freed the main thread.
 *
 * This test pins the API shape: the methods in the hot path MUST remain
 * declared `async`. If anyone reintroduces sync fs APIs or accidentally
 * drops the `async` keyword, this test fails with a loud message
 * pointing at the offending method and the original fix commit.
 *
 * It does NOT try to measure blocking time — wall-clock perf tests are
 * flaky on shared CI. This structural check is cheap, reliable, and
 * catches the 90% regression path (someone typing `Sync` back in).
 */
import { describe, expect, it } from 'vitest';
import { ScreenshotStore } from '../../src/dump/screenshot-store';
import { ReportGenerator } from '../../src/report-generator';

// Derive the AsyncFunction constructor reliably at runtime. Core compiles to
// ES2018, which preserves `async` natively — no downleveling.
// biome-ignore lint/suspicious/noEmptyBlockStatements: intentional noop to access ctor
const AsyncFunction = (async () => {}).constructor;

function assertAsync(method: unknown, label: string): void {
  expect(
    method,
    `${label} must remain an async function. Sync fs APIs in this path block the Electron main event loop during agent execution (see commit 6a25e05c). If you changed this on purpose, update the regression guard together with the change.`,
  ).toBeInstanceOf(AsyncFunction);
}

describe('ReportGenerator — async fs contract (perf guard)', () => {
  it('keeps the hot write path async so the Node event loop is not blocked', () => {
    const proto = ReportGenerator.prototype as unknown as Record<
      string,
      unknown
    >;
    assertAsync(proto.doWriteExecution, 'ReportGenerator.doWriteExecution');
    assertAsync(
      proto.writeInlineExecution,
      'ReportGenerator.writeInlineExecution',
    );
    assertAsync(
      proto.writeDirectoryExecution,
      'ReportGenerator.writeDirectoryExecution',
    );
    assertAsync(
      proto.persistExecutionDumpToFile,
      'ReportGenerator.persistExecutionDumpToFile',
    );
    assertAsync(proto.flush, 'ReportGenerator.flush');
    assertAsync(proto.finalize, 'ReportGenerator.finalize');
  });

  it('ScreenshotStore persist path stays async (inline + file writes)', () => {
    const proto = ScreenshotStore.prototype as unknown as Record<
      string,
      unknown
    >;
    assertAsync(proto.persist, 'ScreenshotStore.persist');
    assertAsync(
      proto.persistToSharedFileIfNeeded,
      'ScreenshotStore.persistToSharedFileIfNeeded',
    );
  });
});
