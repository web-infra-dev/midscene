import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
const { Agent } = createRequire(import.meta.url)(
  '@midscene/core/agent',
) as typeof import('@midscene/core/agent');
import { WorkflowExecutionFailure } from '@midscene/core/internal/test-runner';
import {
  readReportActionDump,
  readReportArtifactManifest,
  readReportRunnerDump,
} from '@midscene/core/report';
import { setMidsceneRunDir } from '@midscene/shared/common';
import { afterEach, describe, expect, it } from 'vitest';
import { runTestProject } from '../src/cli';
import { createMidsceneNodes } from '../src/midscene';

const roots: string[] = [];
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';
const createAgent = () =>
  new Agent(
    {
      interfaceType: 'puppeteer',
      actionSpace: () => [],
      screenshotBase64: async () => png,
      destroy: async () => {},
    } as any,
    {
      autoPrintReportMsg: false,
      modelConfig: {
        MIDSCENE_MODEL_NAME: 'fixture',
        MIDSCENE_MODEL_API_KEY: 'unused',
      },
    },
  );
const walk = (root: string): string[] =>
  readdirSync(root, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(root, e.name)) : [join(root, e.name)],
  );
const state = (value: unknown) => {
  (globalThis as any).__hostedReports = value;
};
afterEach(() => {
  state(undefined);
  setMidsceneRunDir(undefined);
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function project(format?: string, extraSetup = '') {
  const root = mkdtempSync(join(tmpdir(), 'midscene-hosted-run-'));
  roots.push(root);
  setMidsceneRunDir(join(root, 'agent-default'));
  state({ createAgent, createMidsceneNodes, Agent });
  writeFileSync(
    join(root, 'midscene.config.ts'),
    `
    const state = globalThis.__hostedReports;
    const agents = new Map();
    const provider = {
      getAgent(id) { if(!agents.has(id)) agents.set(id,state.createAgent()); return agents.get(id); },
      async releaseAgent(id) { const agent=agents.get(id);await agent.destroy();agents.delete(id);return agent.reportFile ? {reportPath:agent.reportFile} : undefined; },
    };
    const setup = { name: 'hosted', async setup({onTeardown}) { ${extraSetup} return {}; } };
    export default {
      projects: [{ name: 'hosted', setup, retry: 1 }],
      test: { teardownTimeout: 1000 },
      output: { reportDir: './reports', ${format ? `reportFormat: '${format}',` : ''} },
      nodes: [ ...state.createMidsceneNodes({agentClass:state.Agent,agentProvider:provider}),
        {name:'failOnce',execute(ctx){ if(ctx.case.attemptIndex===0) throw new Error('first attempt failed'); }},
        {name:'fail',execute(){throw new Error('expected failure');}},
      ],
    };
  `,
  );
  return root;
}

describe('native Test report ownership', () => {
  it.each([undefined, 'html-and-external-assets'])(
    'publishes one page with complete facts and images, format=%s',
    async (format) => {
      const root = project(format);
      writeFileSync(
        join(root, 'cases.yaml'),
        `cases:
  - name: screenshot evidence
    steps:
      - recordToReport: { title: first }
      - recordToReport: { title: same page second observation }
  - name: retry evidence
    steps:
      - recordToReport: { title: before retry }
      - failOnce: {}
  - name: failure evidence
    steps:
      - recordToReport: { title: before failure }
      - fail: {}
      - recordToReport: { title: MUST NOT RUN }
`,
      );
      const result = await runTestProject({
        projectRoot: root,
        resultDir: join(root, 'results'),
      });
      expect(result.summary).toMatchObject({
        passed: 2,
        failed: 1,
        passedAfterRetry: 1,
      });
      expect(walk(root).filter((file) => file.endsWith('.html'))).toEqual([
        result.reportPath,
      ]);
      expect(result.reportPath).toBeTruthy();
      const dump = await readReportActionDump(result.reportPath!);
      expect(dump.executions.map((e) => e.name)).toEqual([
        'Log - first',
        'Log - same page second observation',
        'Log - before retry',
        'Log - before retry',
        'Log - before failure',
        'Log - before failure',
      ]);
      expect(readReportRunnerDump(result.reportPath!)?.status).toBe('failed');
      const records = join(dirname(result.summaryPath), 'records');
      expect(existsSync(join(records, 'data'))).toBe(false);
      expect(readdirSync(join(records, 'screenshots'))).toHaveLength(1);
      for (const outcome of result.cases)
        for (const attempt of outcome.attempts ?? [])
          for (const step of [
            ...attempt.beforeEach,
            ...attempt.steps,
            ...attempt.afterEach,
          ])
            for (const source of step.report?.sources ?? []) {
              expect(existsSync(source.sourcePath)).toBe(true);
              expect(existsSync(source.dumpPath!)).toBe(true);
            }
      if (format) {
        expect(readReportArtifactManifest(result.reportPath!)?.kind).toBe(
          'test',
        );
        expect(readFileSync(result.reportPath!, 'utf8')).not.toContain(
          'Log - first',
        );
        expect(
          readdirSync(join(dirname(result.reportPath!), 'screenshots')),
        ).toHaveLength(1);
      } else expect(readFileSync(result.reportPath!, 'utf8')).toContain(png);
    },
  );

  it('retains actual setup evidence even when Project setup throws before Case execution', async () => {
    const root = project(
      undefined,
      `const agent=state.createAgent();onTeardown(()=>agent.destroy());await agent.recordToReport('setup diagnostic');throw new Error('setup failed');`,
    );
    writeFileSync(
      join(root, 'case.yaml'),
      'cases: [{ name: blocked, steps: [{ recordToReport: { title: MUST NOT RUN } }] }]',
    );
    const result = await runTestProject({
      projectRoot: root,
      resultDir: join(root, 'results'),
    });
    expect(result.summary.notRun).toBe(1);
    expect(
      (await readReportActionDump(result.reportPath!)).executions[0].name,
    ).toBe('Log - setup diagnostic');
    expect(walk(root).filter((file) => file.endsWith('.html'))).toEqual([
      result.reportPath,
    ]);
  });
  it('retains cleanup diagnostics and reports Project teardown failure', async () => {
    const root = project(
      undefined,
      `onTeardown(async()=>{const agent=state.createAgent();await agent.recordToReport('cleanup diagnostic');await agent.destroy();throw new Error('cleanup failed');});`,
    );
    writeFileSync(
      join(root, 'case.yaml'),
      'cases: [{ name: complete, steps: [{ recordToReport: { title: case } }] }]',
    );
    const result = await runTestProject({
      projectRoot: root,
      resultDir: join(root, 'results'),
    });
    expect(result.exitCode).toBe(1);
    expect(result.summary.passed).toBe(1);
    expect(result.summary.projectFailures).toBe(1);
    expect(
      (await readReportActionDump(result.reportPath!)).executions.map(
        (e) => e.name,
      ),
    ).toEqual(['Log - case', 'Log - cleanup diagnostic']);
    expect(walk(root).filter((file) => file.endsWith('.html'))).toEqual([
      result.reportPath,
    ]);
  });
  it('preserves a timeout cutoff while the real Agent operation finishes later', async () => {
    const root = project();
    const original = createAgent;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let destroyed!: () => void;
    const disposed = new Promise<void>((resolve) => {
      destroyed = resolve;
    });
    state({
      Agent,
      createMidsceneNodes,
      createAgent: () => {
        const agent = original();
        let calls = 0;
        agent.interface.screenshotBase64 = async () => {
          if (++calls > 1) await gate;
          return png;
        };
        const destroy = agent.destroy.bind(agent);
        agent.destroy = async () => {
          await destroy();
          destroyed();
        };
        return agent;
      },
    });
    const config = join(root, 'midscene.config.ts');
    writeFileSync(
      config,
      readFileSync(config, 'utf8')
        .replace('retry: 1', 'retry: 0')
        .replace('teardownTimeout: 1000', 'teardownTimeout: 10'),
    );
    writeFileSync(
      join(root, 'case.yaml'),
      `cases:
  - name: times out
    steps:
      - recordToReport: { title: completed }
      - recordToReport: { title: pending, $: { timeout: 10 } }
`,
    );
    try {
      const result = await runTestProject({
        projectRoot: root,
        resultDir: join(root, 'results'),
      }).catch((error) => {
        if (error instanceof WorkflowExecutionFailure) return error.result;
        throw error;
      });
      expect(result.exitCode).toBe(1);
      expect(result.summary.failed).toBe(1);
      const frozen = readFileSync(result.reportPath!, 'utf8');
      expect(
        (await readReportActionDump(result.reportPath!)).executions.map(
          (e) => e.name,
        ),
      ).toEqual(['Log - completed']);
      expect(
        existsSync(join(dirname(result.summaryPath), 'records', 'data')),
      ).toBe(true);
      release();
      await disposed;
      expect(readFileSync(result.reportPath!, 'utf8')).toBe(frozen);
      expect(walk(root).filter((file) => file.endsWith('.html'))).toEqual([
        result.reportPath,
      ]);
    } finally {
      release();
      await disposed;
    }
  });
});
