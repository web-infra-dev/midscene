import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type * as CoreRuntime from '@midscene/core';
import type { TestRunReportDump } from '@midscene/core';
import { antiEscapeScriptTag } from '@midscene/shared/utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TestProjectDefinition } from '../src/cli/test-project';
import { runTestProjectWithYamlCompatibility } from '../src/cli/test-project-runner';
import { createMidsceneNodes } from '../src/midscene';

// Use the published Node runtime, including its actual report writer.
const require = createRequire(import.meta.url);
const { Agent, ReportGenerator } =
  require('@midscene/core') as typeof CoreRuntime;
// Keep the actual host implementation while bypassing Vite's browser WASM
// resolution for its transitive Node-only platform dependencies.
vi.mock('../src/runtime/create-yaml-player', async () => {
  const { createRequire } = await import('node:module');
  return createRequire(import.meta.url)('@midscene/test/runtime');
});
const roots: string[] = [];
const state = globalThis as typeof globalThis & {
  __midsceneReportConfig?: TestProjectDefinition<{
    agent: InstanceType<typeof Agent>;
  }>;
};
afterEach(() => {
  state.__midsceneReportConfig = undefined;
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe('borrowed Agent report collection', () => {
  it('flushes native scopes and resolves a shared Agent across native, legacy and native documents', async () => {
    const root = mkdtempSync(join(tmpdir(), 'midscene-borrowed-report-'));
    roots.push(root);
    const sourcePath = join(root, 'shared.html');
    const destroy = vi.fn(async () => {});
    const agent = new Agent(
      {
        interfaceType: 'puppeteer',
        actionSpace: () => [],
        describe: () => 'deterministic page',
        size: async () => ({ width: 1, height: 1 }),
        screenshotBase64: async () =>
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=',
        destroy,
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
    (agent as any).reportGenerator = new ReportGenerator({
      reportPath: sourcePath,
      screenshotMode: 'inline',
      autoPrint: false,
    });
    state.__midsceneReportConfig = {
      nodes: createMidsceneNodes<{ agent: typeof agent }>({
        agentClass: Agent,
        getAgent: (ctx) => ctx.context.agent,
      }),
      setup: { name: 'shared-agent', setup: () => ({ agent }) },
    };
    writeFileSync(
      join(root, 'midscene.config.ts'),
      'export default globalThis.__midsceneReportConfig;',
    );
    writeFileSync(
      join(root, '01-native.yaml'),
      'beforeAll:\n  - recordToReport: setup snapshot\ncases:\n  - name: native first\n    steps:\n      - recordToReport: first snapshot\n',
    );
    writeFileSync(
      join(root, '02-legacy.yaml'),
      'web:\n  url: https://example.test\ntasks:\n  - name: legacy middle\n    flow:\n      - recordToReport: middle snapshot\n',
    );
    writeFileSync(
      join(root, '03-native.yaml'),
      'cases:\n  - name: native last\n    steps:\n      - recordToReport: last snapshot\n',
    );
    const result = await runTestProjectWithYamlCompatibility(
      { projectRoot: root },
      { getPlayerOptions: () => ({ agent }) },
    );
    expect(result.collectionErrors).toEqual([]);
    expect(result.status).toBe('success');
    expect(result.summary).toMatchObject({ total: 3, passed: 3 });
    const nativeCases = result.projects[0].cases.filter((item) =>
      item.name.startsWith('native'),
    );
    expect(nativeCases).toHaveLength(2);
    for (const item of nativeCases)
      expect(item.attempts?.[0].reportPaths).toEqual([sourcePath]);
    expect(result.projects[0].documents[0].reportPaths).toEqual([sourcePath]);
    expect(existsSync(sourcePath)).toBe(true);
    expect(destroy).not.toHaveBeenCalled();
    const html = readFileSync(result.reportPath!, 'utf8');
    const scripts = [
      ...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g),
    ];
    const runner = scripts.find((match) =>
      /(?:^|\s)type="midscene_test_run_dump"/.test(match[1]),
    )!;
    const dump = JSON.parse(
      antiEscapeScriptTag(runner[2]),
    ) as TestRunReportDump;
    expect(dump.diagnostics ?? []).toEqual([]);
    const steps = dump.projects[0].documents.flatMap((document) => [
      ...document.beforeAll,
      ...document.cases.flatMap((item) =>
        item.attempts.flatMap((attempt) => attempt.steps),
      ),
    ]);
    expect(steps).toHaveLength(4);
    const details = steps.flatMap((step) => step.agentDetails ?? []);
    expect(details).toHaveLength(4);
    expect(new Set(details.map(({ executionId }) => executionId)).size).toBe(4);
    for (const detail of details) {
      const source = scripts.find((match) =>
        match[1].includes(`data-report-id="${detail.reportId}"`),
      );
      expect(source).toBeDefined();
      const agentDump = JSON.parse(antiEscapeScriptTag(source![2]));
      expect(
        agentDump.executions.filter(
          (execution: { id: string }) => execution.id === detail.executionId,
        ),
      ).toHaveLength(1);
    }
    expect(
      scripts.filter((match) =>
        /(?:^|\s)type="midscene_web_dump"/.test(match[1]),
      ),
    ).toHaveLength(1);
    // Each scope has an immutable snapshot of the borrowed Agent.
    // Scope cleanup has not finalized the borrowed generator or disposed its device.
    await agent.recordToReport('still usable');
    await expect(agent.flushReport()).resolves.toBe(sourcePath);
    expect(readFileSync(sourcePath, 'utf8')).toContain('still usable');
    await agent.destroy();
    expect(destroy).toHaveBeenCalledOnce();
  });
});
