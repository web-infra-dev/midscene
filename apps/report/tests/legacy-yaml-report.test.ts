import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Script } from 'node:vm';
import {
  Agent,
  GroupedActionDump,
  ReportGenerator,
  ReportImageStore,
  restoreImageReferences,
} from '@midscene/core';
import {
  buildTestRunReportDump,
  executionRecordsToReportInput,
} from '@midscene/core/internal/test-runner';
import { getLegacyYamlPlayerState } from '@midscene/core/internal/yaml-runtime';
import { ScriptPlayer, parseYamlScript } from '@midscene/core/yaml';
import { antiEscapeScriptTag } from '@midscene/shared/utils';
import { afterEach, describe, expect, it } from '@rstest/core';
import {
  buildRunnerVisualIndex,
  flattenRunnerCases,
  getRunnerHealth,
  getStepForVisualFrame,
  getVisualFrames,
} from '../src/components/test-runner/model';
import {
  buildOverviewProjects,
  createOverviewState,
  filterOverviewProjects,
} from '../src/components/test-runner/overview-model';
import { parseDumpAttributes } from '../src/utils/report-dump';
import {
  parseTestRunReportDump,
  runnerHashForRoute,
  runnerRouteFromHash,
  runnerStepIdFromHash,
} from '../src/utils/test-run-report';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function createFixtureAgent(
  reportPath: string,
  screenshotMode: 'inline' | 'directory',
) {
  const agent = new Agent(
    {
      interfaceType: 'compatibility-fixture',
      actionSpace: () => [],
      describe: () => 'deterministic page',
      size: async () => ({ width: 1, height: 1 }),
      screenshotBase64: async () =>
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=',
      evaluateJavaScript: async (script: string) =>
        new Script(script).runInNewContext(),
      destroy: async () => {},
    } as any,
    {
      generateReport: false,
      autoPrintReportMsg: false,
      modelConfig: {
        MIDSCENE_MODEL_NAME: 'test',
        MIDSCENE_MODEL_API_KEY: 'test',
      },
    },
  );
  // Use a real generator at an isolated path, without changing global run dirs.
  (agent as any).reportState.generator = new ReportGenerator({
    reportPath,
    screenshotMode,
    autoPrint: false,
  });
  return agent;
}

describe('old YAML reports consume the existing viewer protocol', () => {
  it.each(['setup', 'cleanup'] as const)(
    'keeps legacy host %s failures at File scope with the real source path',
    async (phase) => {
      const root = mkdtempSync(join(tmpdir(), 'legacy-host-overview-'));
      roots.push(root);
      const agent = createFixtureAgent(join(root, 'report.html'), 'inline');
      const script = parseYamlScript(
        `agent:
  generateReport: false
tasks:
  - name: First task
    flow:
      - recordToReport: First snapshot
  - name: Second task
    flow:
      - recordToReport: Second snapshot
`,
        'yaml',
      );
      const player = new ScriptPlayer(
        script,
        async () => {
          if (phase === 'setup') throw new Error('Legacy setup failed');
          return {
            agent,
            freeFn: [
              {
                name: 'legacy-cleanup',
                fn: () => {
                  throw new Error('Legacy cleanup failed');
                },
              },
            ],
          };
        },
        undefined,
        '/fixtures/legacy-host.yaml',
      );
      player.output = join(root, 'output.json');
      try {
        if (phase === 'cleanup')
          await expect(player.run()).rejects.toThrow('Legacy cleanup failed');
        else await player.run();
      } finally {
        await agent.destroy();
      }
      const record = getLegacyYamlPlayerState(player).executionRecord;
      expect(record).toBeDefined();
      const dump = buildTestRunReportDump(
        executionRecordsToReportInput([record!], { runId: record!.runId }),
        {
          sources: [],
          metrics: {
            modelCallCount: 0,
            modelTimeMs: 0,
            promptTokens: 0,
            cachedInputTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          },
        },
      );
      const projects = buildOverviewProjects(dump, flattenRunnerCases(dump));
      expect(projects[0].files[0]).toMatchObject({
        sourcePath: '/fixtures/legacy-host.yaml',
        status: 'failed',
        hasScopeError: true,
        totalCaseCount: 2,
      });
      expect(projects[0].files[0].cases.map((item) => item.status)).toEqual(
        phase === 'setup' ? ['not-run', 'not-run'] : ['passed', 'passed'],
      );
      expect(
        projects[0].files[0].issues.some((issue) =>
          issue.message.includes(`Legacy ${phase} failed`),
        ),
      ).toBe(true);
      expect(projects[0].files[0].document!.beforeAll).toEqual([]);
      expect(projects[0].files[0].document!.afterAll).toEqual([]);
    },
  );

  it('maps old tasks/flow, continueOnError and blocked tasks to one Inline YAML file', async () => {
    const root = mkdtempSync(join(tmpdir(), 'legacy-overview-'));
    roots.push(root);
    const reportPath = join(root, 'report.html');
    const agent = createFixtureAgent(reportPath, 'inline');
    try {
      await expect(
        agent.runYaml(`tasks:
  - name: Continue after failure
    continueOnError: true
    flow:
      - javascript: throw new Error('Expected legacy failure')
  - name: Snapshot after failure
    flow:
      - recordToReport: Legacy snapshot
  - name: Stop the document
    flow:
      - javascript: throw new Error('Expected stopping failure')
  - name: Blocked task
    flow:
      - recordToReport: Must not run
`),
      ).rejects.toThrow('Error(s) occurred');
    } finally {
      await agent.destroy();
    }
    const html = readFileSync(reportPath, 'utf8');
    const script = [
      ...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g),
    ].find((match) => /(?:^|\s)type="midscene_test_run_dump"/.test(match[1]));
    expect(script).toBeDefined();
    const dump = parseTestRunReportDump(script![2]);
    const cases = flattenRunnerCases(dump);
    expect(cases.map((item) => item.status)).toEqual([
      'failed',
      'passed',
      'failed',
      'not-run',
    ]);
    expect(cases.map((item) => item.testCase.caseIndex)).toEqual([0, 1, 2, 3]);
    expect(getRunnerHealth(cases).retryPassedCount).toBe(0);
    const projects = buildOverviewProjects(dump, cases);
    expect(projects).toHaveLength(1);
    expect(projects[0].files).toHaveLength(1);
    expect(projects[0].files[0]).toMatchObject({
      sourceKind: 'inline',
      totalCaseCount: 4,
      passedCount: 1,
      failedCount: 2,
      notRunCount: 1,
    });
    expect(projects[0].files[0].document!.beforeAll).toEqual([]);
    expect(projects[0].files[0].document!.afterAll).toEqual([]);
    const filtered = filterOverviewProjects(projects, {
      ...createOverviewState(projects),
      statuses: ['failed'],
    });
    expect(
      filtered[0].files[0].cases.filter((item) => item.status === 'failed'),
    ).toHaveLength(2);
    expect(cases[1].finalAttempt!.steps[0].agentDetails).toHaveLength(1);
    expect(cases[3].testCase.attempts).toEqual([]);
  });

  it.each(['inline', 'directory'] as const)(
    'resolves Case and Step navigation to real Agent execution IDs (%s screenshots)',
    async (screenshotMode) => {
      const root = mkdtempSync(join(tmpdir(), 'yaml-viewer-contract-'));
      roots.push(root);
      const reportPath = join(root, 'report.html');
      const agent = createFixtureAgent(reportPath, screenshotMode);
      try {
        await agent.runYaml(
          'tasks:\n  - name: unchanged task\n    flow:\n      - recordToReport: unchanged snapshot\n',
        );
      } finally {
        await agent.destroy();
      }
      const html = readFileSync(reportPath, 'utf8');
      // Parse executable inline scripts without executing browser globals. A
      // literal closing tag inside bundled writer code would truncate a script.
      const scriptElements = [
        ...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g),
      ];
      const executableScripts = scriptElements.filter(
        (match) => !/\b(?:src|type)\s*=/.test(match[1]),
      );
      expect(executableScripts.length).toBeGreaterThan(0);
      for (const [, , source] of executableScripts)
        expect(() => new Script(source)).not.toThrow();
      const scripts = scriptElements.filter((match) =>
        /(?:^|\s)type="midscene_test_run_dump"/.test(match[1]),
      );
      expect(scripts).toHaveLength(1);
      const dump = parseTestRunReportDump(scripts[0][2]);
      const cases = flattenRunnerCases(dump);
      expect(cases).toHaveLength(1);
      const item = cases[0];
      expect(item).toMatchObject({
        status: 'passed',
        testCase: { name: 'unchanged task' },
      });
      const step = item.finalAttempt!.steps[0];
      expect(step.node).toBe('recordToReport');
      expect(step.agentDetails).toHaveLength(1);
      expect(step.agentDetailDiagnostic).toBeUndefined();
      const hash = runnerHashForRoute({
        page: 'case',
        projectId: item.project.projectId,
        caseKey: item.key,
        stepId: step.id,
      });
      const route = runnerRouteFromHash(hash);
      expect(route).toEqual({
        page: 'case',
        projectId: item.project.projectId,
        caseKey: item.key,
      });
      expect(runnerStepIdFromHash(hash)).toBe(step.id);

      const [detail] = step.agentDetails!;
      const sources = scriptElements.filter((match) =>
        /(?:^|\s)type="midscene_web_dump"/.test(match[1]),
      );
      const source = sources.find((match) =>
        ['data-report-id', 'data-group-id'].some((attribute) =>
          match[1].includes(
            `${attribute}="${encodeURIComponent(detail.reportId)}"`,
          ),
        ),
      );
      expect(source).toBeDefined();
      const agentDump = JSON.parse(antiEscapeScriptTag(source![2]));
      expect(agentDump.executions).toContainEqual(
        expect.objectContaining({ id: detail.executionId }),
      );
      expect(JSON.stringify(agentDump)).toContain('midscene_screenshot_ref');
      const imageStore = new ReportImageStore({
        mode: screenshotMode,
        reportPath,
      });
      const restored = restoreImageReferences(agentDump, (ref) =>
        imageStore.loadDataUri(ref),
      );
      const visuals = buildRunnerVisualIndex([
        {
          reportId: detail.reportId,
          attributes: parseDumpAttributes([]),
          get: () =>
            GroupedActionDump.fromJSON(
              restored as Parameters<typeof GroupedActionDump.fromJSON>[0],
            ),
        },
      ]);
      const frames = getVisualFrames(step.agentDetails, visuals);
      expect(frames.length).toBeGreaterThan(0);
      expect(frames[0].screenshot.base64).toMatch(/^data:image\/png;base64,/);
      expect(getStepForVisualFrame(item.finalAttempt!.steps, frames[0])).toBe(
        step,
      );
    },
  );
});
