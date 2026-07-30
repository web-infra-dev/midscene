/**
 * Repro + regression tests for PlaywrightAiFixture report filename derivation.
 *
 * Background
 * ----------
 * PlaywrightAiFixture used to forward Playwright's internal `testInfo.testId`
 * (a UUID string) directly as the Agent's `reportFileName`, producing
 * intermediate report files like:
 *   playwright-01e1ae2eda378fcdc79a-5b19ff8659b54d79108c-<pageUuid>.html
 *
 * That name carries no information about which spec/case the report belongs to,
 * making on-disk triage and custom report-parsing scripts impossible.
 *
 * The fix routes `reportFileName` through `groupAndCaseForTest`'s already
 * path-safe, retry-aware `title` field. These tests pin that behavior so it
 * cannot silently regress again.
 *
 * How it reproduces
 * -----------------
 * We mock `PlaywrightAgent` to capture the constructor options the fixture
 * synthesizes, then invoke `fixture.ai({page}, ...)` which is the cheapest
 * code path that runs `createOrReuseAgentForPage`.
 */
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  ctorOpts: [] as any[],
  reportFile: undefined as string | undefined,
}));

vi.mock('@/playwright/index', () => {
  class MockPlaywrightAgent {
    reportFile = mockState.reportFile;

    constructor(_page: any, opts: any) {
      mockState.ctorOpts.push(opts);
    }

    async destroy() {}
  }

  return { PlaywrightAgent: MockPlaywrightAgent };
});

import { PlaywrightAiFixture } from '@/playwright/ai-fixture';

const createPage = () =>
  ({
    on: vi.fn(),
  }) as any;

const runAi = async (testInfo: any) => {
  const fixture = PlaywrightAiFixture();
  await fixture.ai({ page: createPage() }, async () => {}, testInfo);
  return mockState.ctorOpts[0];
};

describe('PlaywrightAiFixture reportFileName derivation', () => {
  let tempDir: string;

  beforeEach(() => {
    mockState.ctorOpts.length = 0;
    mockState.reportFile = undefined;
    tempDir = mkdtempSync(join(tmpdir(), 'midscene-fixture-report-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('uses the human-readable test title and drops the Playwright UUID testId', async () => {
    const opts = await runAi({
      testId: '01e1ae2eda378fcdc79a-5b19ff8659b54d79108c',
      titlePath: [
        'repayment.spec.ts',
        'repay within 7 days with 108 coupon [smoke]',
      ],
      annotations: [],
      retry: 0,
    });

    expect(opts.reportFileName).toContain('repay');
    expect(opts.reportFileName).toContain('108-coupon');
    expect(opts.reportFileName).not.toContain('01e1ae2eda378fcdc79a');
    expect(opts.reportFileName).not.toContain('5b19ff8659b54d79108c');
    // Kept in lockstep with reportFileName so the deprecated testId fallback
    // in @midscene/core Agent does not reintroduce a UUID-based filename if
    // reportFileName is ever dropped.
    expect(opts.testId).toBe(opts.reportFileName);
  });

  it('embeds a retry marker so reruns do not overwrite the first attempt', async () => {
    const opts = await runAi({
      testId: 'does-not-matter',
      titlePath: ['flow.spec.ts', 'login case'],
      annotations: [],
      retry: 2,
    });

    // replaceIllegalPathCharsAndSpace turns ' ' and '#' into '-', so the
    // retry marker surfaces as "(retry--2)" on disk.
    expect(opts.reportFileName).toContain('login-case(retry--2)');
  });

  it('caps very long titles and appends a stable hash to avoid ENAMETOOLONG', async () => {
    const longTitle = 'policy-template-name-duplicates-existing-name-'.repeat(
      20,
    );
    const opts = await runAi({
      testId: 'uuid',
      titlePath: ['1426803.spec.ts', longTitle],
      annotations: [],
      retry: 1,
    });

    expect(Buffer.byteLength(opts.reportFileName, 'utf8')).toBeLessThan(200);
    expect(opts.reportFileName).toMatch(
      /^playwright-.+-[0-9a-f]{10}-[0-9a-f-]{36}$/,
    );
    expect(opts.groupName).toContain(
      'policy-template-name-duplicates-existing-name',
    );
  });

  it('preserves the page-level uuid suffix so multiple pages in one test do not clash', async () => {
    const fixture = PlaywrightAiFixture();
    const pageA = createPage();
    const pageB = createPage();
    const testInfo = {
      testId: 'uuid',
      titlePath: ['shop.spec.ts', 'checkout'],
      annotations: [],
      retry: 0,
    } as any;

    let getAgent: any;
    await fixture.agentForPage(
      { page: pageA },
      async (fn: any) => {
        getAgent = fn;
      },
      testInfo,
    );

    await getAgent(pageA);
    await getAgent(pageB);

    expect(mockState.ctorOpts).toHaveLength(2);
    const [a, b] = mockState.ctorOpts;
    expect(a.reportFileName).toContain('checkout');
    expect(b.reportFileName).toContain('checkout');
    expect(a.reportFileName).not.toBe(b.reportFileName);
  });

  it('sanitizes filename-hostile characters so the result passes ReportGenerator validation', async () => {
    const opts = await runAi({
      testId: 'uuid',
      titlePath: ['auth.spec.ts', 'can I click "Submit" on #home?'],
      annotations: [],
      retry: 0,
    });

    // replaceIllegalPathCharsAndSpace scrubs these filename-hostile chars.
    for (const forbidden of [':', '*', '?', '"', '<', '>', '|', '#']) {
      expect(opts.reportFileName.includes(forbidden)).toBe(false);
    }
    // Readable words still come through.
    expect(opts.reportFileName).toContain('Submit');
    expect(opts.reportFileName).toContain('home');
  });

  it('strips path separators from the title so ReportGenerator.create does not throw', async () => {
    const opts = await runAi({
      testId: 'uuid',
      titlePath: ['auth.spec.ts', 'login / sign\\up flow'],
      annotations: [],
      retry: 0,
    });

    // ReportGenerator's validateReportFileName rejects `/` and `\`. The
    // fixture must strip them even though replaceIllegalPathCharsAndSpace
    // intentionally leaves path separators alone for groupName.
    expect(opts.reportFileName).not.toContain('/');
    expect(opts.reportFileName).not.toContain('\\');
    // Surrounding words still survive so the filename stays recognizable.
    expect(opts.reportFileName).toContain('login');
    expect(opts.reportFileName).toContain('sign');
    expect(opts.reportFileName).toContain('up');
    // groupName keeps the original hierarchy-carrying separators.
    expect(opts.groupName).toContain('/');
    expect(opts.groupName).toContain('\\');
  });

  it('preserves its finalized report when the Playwright reporter is not configured', async () => {
    const reportPath = join(tempDir, 'fixture-owned-report.html');
    writeFileSync(reportPath, 'fixture report', 'utf-8');
    mockState.reportFile = reportPath;

    const fixture = PlaywrightAiFixture();
    const page = createPage();
    const testInfo = {
      testId: 'fixture-only-test',
      titlePath: ['fixture-only.spec.ts', 'keeps its report'],
      annotations: [],
      retry: 0,
    } as any;
    let getAgent: any;

    await fixture.agentForPage(
      { page },
      async (fn: any) => {
        getAgent = fn;
      },
      testInfo,
    );
    await getAgent(page);

    const [finalizeReports] = fixture._midsceneFinalizeReports as any;
    await finalizeReports({}, async () => {}, testInfo);

    expect(existsSync(reportPath)).toBe(true);
    expect(testInfo.annotations).toContainEqual({
      type: 'MIDSCENE_DUMP_ANNOTATION',
      description: reportPath,
    });
  });
});
