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
import { antiEscapeScriptTag } from '@midscene/shared/utils';
import { afterEach, describe, expect, it } from '@rstest/core';
import {
  buildRunnerVisualIndex,
  flattenRunnerCases,
  getStepForVisualFrame,
  getVisualFrames,
} from '../src/components/test-runner/model';
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

describe('old YAML reports consume the existing viewer protocol', () => {
  it.each(['inline', 'directory'] as const)(
    'resolves Case and Step navigation to real Agent execution IDs (%s screenshots)',
    async (screenshotMode) => {
      const root = mkdtempSync(join(tmpdir(), 'yaml-viewer-contract-'));
      roots.push(root);
      const reportPath = join(root, 'report.html');
      const agent = new Agent(
        {
          interfaceType: 'compatibility-fixture',
          actionSpace: () => [],
          describe: () => 'deterministic page',
          size: async () => ({ width: 1, height: 1 }),
          screenshotBase64: async () =>
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=',
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
      (agent as any).reportGenerator = new ReportGenerator({
        reportPath,
        screenshotMode,
        autoPrint: false,
      });
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
