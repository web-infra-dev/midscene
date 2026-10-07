import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Agent } from '@/agent/agent';
import { extractTestRunReportDumpSync } from '@/dump/html-utils';
import { mergeReportFiles } from '@/report-cli';
import { ReportGenerator } from '@/report-generator';
import type { TestRunReportDump } from '@/test-run-report';
import { ExecutionDump } from '@/types';
import type { MidsceneYamlScript } from '@/types';
import { ScriptPlayer } from '@/yaml/player';
import { getLegacyYamlPlayerState } from '@/yaml/player-state';
import { antiEscapeScriptTag } from '@midscene/shared/utils';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  rs,
  test,
} from '@rstest/core';

let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'yaml-standard-report-'));
});
afterEach(() => {
  rs.restoreAllMocks();
  rmSync(directory, { recursive: true, force: true });
});

const createAgent = (enabled = true) => {
  const agent = new Agent(
    {
      interfaceType: 'puppeteer',
      actionSpace: () => [],
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
  if (enabled) {
    (agent as any).reportGenerator = new ReportGenerator({
      reportPath: join(directory, 'unchanged-name.html'),
      screenshotMode: 'inline',
      autoPrint: false,
    });
  }
  rs.spyOn(agent, 'getActionSpace').mockResolvedValue([]);
  rs.spyOn(agent, 'evaluateJavaScript').mockResolvedValue({ answer: 42 });
  return agent;
};

const yaml = `tasks:
  - name: old task
    flow:
      - javascript: return 42
        name: answer
`;
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const readHtmlDump = (html: string): TestRunReportDump => {
  const matches = [
    ...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g),
  ].filter((match) => /(?:^|\s)type="midscene_test_run_dump"/.test(match[1]));
  expect(matches).toHaveLength(1);
  return JSON.parse(antiEscapeScriptTag(matches[0][2]));
};
const readDump = (path: string) => readHtmlDump(readFileSync(path, 'utf8'));

describe('old YAML entries publish standard Runner reports', () => {
  test.each(
    (['web', 'page', 'browser', 'target'] as const).flatMap((source) =>
      [
        { targetEnabled: false, agentEnabled: undefined, enabled: false },
        { targetEnabled: true, agentEnabled: undefined, enabled: true },
        { targetEnabled: false, agentEnabled: true, enabled: true },
        { targetEnabled: true, agentEnabled: false, enabled: false },
      ].map((policy) => ({ source, ...policy })),
    ),
  )(
    'respects $source report=$targetEnabled with Agent override=$agentEnabled when setup fails',
    async ({ source, targetEnabled, agentEnabled, enabled }) => {
      const error = new Error('setup failed');
      const script: MidsceneYamlScript = {
        [source]: { url: 'about:blank', generateReport: targetEnabled },
        ...(agentEnabled === undefined
          ? {}
          : { agent: { generateReport: agentEnabled } }),
        tasks: [],
      };
      const player = new ScriptPlayer(script, async () => {
        throw error;
      });
      const reportPath = join(directory, 'fallback.html');
      const create = rs.spyOn(ReportGenerator, 'create').mockImplementation(
        () =>
          new ReportGenerator({
            reportPath,
            screenshotMode: 'inline',
            autoPrint: false,
          }),
      );
      await player.run();
      const record = getLegacyYamlPlayerState(player).executionRecord!;
      expect(player.status).toBe('error');
      expect(record.setupError).toBe(error);
      expect(record.reportSources ?? []).toHaveLength(enabled ? 1 : 0);
      expect(
        readdirSync(directory).filter((file) => file.endsWith('.html')),
      ).toEqual(enabled ? ['fallback.html'] : []);
      if (enabled) {
        expect(create).toHaveBeenCalledTimes(1);
        expect(player.reportFile).toBe(reportPath);
        expect(readDump(reportPath).status).toBe('failed');
      } else {
        expect(create).not.toHaveBeenCalled();
        expect(player.reportFile).toBeUndefined();
      }
    },
  );

  test('uses the host-reserved report name even if no Agent could be created', async () => {
    const error = new Error('setup failed');
    const player = new ScriptPlayer({ tasks: [] }, async () => {
      throw error;
    });
    getLegacyYamlPlayerState(player).fallbackReportFileName = 'host-reserved';
    const create = rs.spyOn(ReportGenerator, 'create').mockImplementation(
      (name) =>
        new ReportGenerator({
          reportPath: join(directory, `${name}.html`),
          screenshotMode: 'inline',
          autoPrint: false,
        }),
    );
    await player.run();
    expect(create).toHaveBeenCalledWith('host-reserved', {});
    expect(player.reportFile).toBe(join(directory, 'host-reserved.html'));
    expect(getLegacyYamlPlayerState(player).executionRecord?.setupError).toBe(
      error,
    );
    expect(readDump(player.reportFile!).status).toBe('failed');
  });
  test('rejects independent public runs without changing the active Agent or its report', async () => {
    const agent = createAgent();
    const entered = deferred();
    const release = deferred();
    const publish = rs.spyOn(agent, '_writeYamlExecutionReport');
    const destroy = rs.spyOn(agent, 'destroy');
    rs.mocked(agent.evaluateJavaScript).mockImplementationOnce(async () => {
      entered.resolve();
      await release.promise;
      return { answer: 42 };
    });
    const first = agent.runYaml(yaml);
    await entered.promise;
    try {
      await expect(agent.runYaml(yaml)).rejects.toMatchObject({
        code: 'YAML_EXECUTION_OVERLAP',
      });
      expect(publish).not.toHaveBeenCalled();
      expect(destroy).not.toHaveBeenCalled();
      expect(agent.evaluateJavaScript).toHaveBeenCalledTimes(1);
    } finally {
      release.resolve();
      await first;
    }
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][0].children).toBeUndefined();
    await agent.runYaml(yaml);
    expect(publish).toHaveBeenCalledTimes(2);
    await agent.destroy();
  });

  test('keeps ownership until root report publication finishes', async () => {
    const agent = createAgent(false);
    const entered = deferred();
    const release = deferred();
    rs.spyOn(agent, '_writeYamlExecutionReport').mockImplementationOnce(
      async () => {
        entered.resolve();
        await release.promise;
        return undefined;
      },
    );
    const first = agent.runYaml(yaml);
    await entered.promise;
    try {
      await expect(agent.runYaml(yaml)).rejects.toMatchObject({
        code: 'YAML_EXECUTION_OVERLAP',
      });
    } finally {
      release.resolve();
      await first;
      await agent.destroy();
    }
  });

  test('retains nested ownership across awaits but rejects sibling overlap', async () => {
    const agent = createAgent();
    const entered = deferred();
    const release = deferred();
    const publish = rs.spyOn(agent, '_writeYamlExecutionReport');
    rs.mocked(agent.evaluateJavaScript).mockImplementationOnce(async () => {
      entered.resolve();
      await release.promise;
      return { answer: 42 };
    });
    rs.spyOn(agent, 'aiAct').mockImplementation(async () => {
      await Promise.resolve();
      const child = agent.runYaml(yaml);
      await entered.promise;
      try {
        await expect(agent.runYaml(yaml)).rejects.toMatchObject({
          code: 'YAML_EXECUTION_OVERLAP',
        });
      } finally {
        release.resolve();
        await child;
      }
      return '';
    });
    await agent.runYaml('tasks: [{ name: parent, flow: [{ aiAct: cached }] }]');
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][0].children).toHaveLength(1);
    await agent.destroy();
  });

  test('rejects a detached nested run after its owner has closed', async () => {
    const agent = createAgent(false);
    const release = deferred();
    let detached!: Promise<unknown>;
    rs.spyOn(agent, 'aiAct').mockImplementation(async () => {
      detached = release.promise
        .then(() => agent.runYaml(yaml))
        .catch((error: unknown) => error);
      return '';
    });
    await agent.runYaml(
      'tasks: [{ name: parent, flow: [{ aiAct: detached }] }]',
    );
    release.resolve();
    expect(await detached).toMatchObject({
      code: 'YAML_EXECUTION_SCOPE_CLOSED',
    });
    expect(agent.evaluateJavaScript).not.toHaveBeenCalled();
    await agent.destroy();
  });

  test('keeps the existing report name after owned Agent cleanup, including non-AI flows', async () => {
    const agent = createAgent();
    const player = new ScriptPlayer(
      {
        tasks: [
          {
            name: 'old task',
            flow: [{ javascript: 'return 42', name: 'answer' }],
          },
        ],
      },
      async () => ({
        agent,
        freeFn: [{ name: 'agent', fn: () => agent.destroy() }],
      }),
    );
    player.output = undefined;
    await player.run();
    expect(player.reportFile).toBe(join(directory, 'unchanged-name.html'));
    const dump = readDump(player.reportFile!);
    expect(dump.kind).toBe('test-runner');
    expect(dump.summary).toMatchObject({ total: 1, passed: 1 });
    expect(
      dump.projects[0].documents[0].cases[0].attempts[0].steps[0].output?.data
        ?.value,
    ).toEqual({ answer: 42 });
    expect(player.result.answer).toEqual({ answer: 42 });
  });

  test('replaces the root snapshot across consecutive public Agent.runYaml calls', async () => {
    const agent = createAgent();
    const script = `config:\n  output: ${join(directory, 'output.json')}\n${yaml}`;
    await agent.runYaml(script);
    await agent.runYaml(script);
    await agent.destroy();
    const dump = readDump(agent.reportFile!);
    expect(dump.summary).toMatchObject({ total: 2, passed: 2 });
    expect(dump.projects[0].documents).toHaveLength(2);
    expect(
      readdirSync(directory).filter((file) => file.endsWith('.html')),
    ).toHaveLength(1);
  });

  test('nested cached-style replay contributes to the parent without another report or Agent destroy', async () => {
    const agent = createAgent();
    const publish = rs.spyOn(agent, '_writeYamlExecutionReport');
    const destroy = rs.spyOn(agent, 'destroy');
    rs.spyOn(agent, 'aiAct').mockImplementation(async () => {
      await agent.runYaml(
        `config:\n  output: ${join(directory, 'child.json')}\n${yaml}`,
      );
      return '';
    });
    const player = new ScriptPlayer(
      { tasks: [{ name: 'parent', flow: [{ aiAct: 'cached action' }] }] },
      async () => ({ agent, freeFn: [] }),
    );
    player.output = undefined;
    await player.run();
    expect(publish).toHaveBeenCalledTimes(1);
    expect(destroy).not.toHaveBeenCalled();
    expect(
      getLegacyYamlPlayerState(player).executionRecord?.children,
    ).toHaveLength(1);
    expect(readDump(player.reportFile!).summary.total).toBe(1);
    await agent.destroy();
  });

  test('respects generateReport false', async () => {
    const agent = createAgent(false);
    const player = new ScriptPlayer({ tasks: [] }, async () => ({
      agent,
      freeFn: [],
    }));
    player.output = undefined;
    await player.run();
    expect(player.reportFile).toBeUndefined();
    expect(readdirSync(directory)).toHaveLength(0);
    await agent.destroy();
  });

  test('exports the same YAML hierarchy when no file writer is available', async () => {
    const agent = createAgent(false);
    await agent.runYaml('tasks: [{ name: old task, flow: [] }]');
    const html = agent.reportHTMLString();
    const dump = readHtmlDump(html);
    expect(dump.summary).toMatchObject({ total: 1, passed: 1 });
    expect(dump.projects[0].documents[0].cases[0].name).toBe('old task');
    expect(agent.reportFile).toBeUndefined();
    expect(readdirSync(directory)).toHaveLength(0);
    await agent.destroy();
  });

  test('keeps exported Agent detail references attached to the YAML step', async () => {
    const agent = createAgent();
    rs.spyOn(agent, 'aiAct').mockImplementation(async () => {
      const execution = new ExecutionDump({
        id: 'yaml-action',
        name: 'Submit',
        logTime: Date.now(),
        tasks: [],
      });
      agent.dump.executions.push(execution);
      agent.writeOutActionDumps(execution);
      (agent as any).notifyDumpUpdateListeners(execution);
      return '';
    });
    await agent.runYaml('tasks: [{ name: submit, flow: [{ aiAct: submit }] }]');
    const html = agent.reportHTMLString();
    const exported = readHtmlDump(html);
    const file = readDump(agent.reportFile!);
    expect(exported.summary).toEqual(file.summary);
    expect(exported.projects[0].documents[0].cases[0].name).toBe('submit');
    const detail =
      exported.projects[0].documents[0].cases[0].attempts[0].steps[0]
        .agentDetails![0];
    expect(detail.executionId).toBe('yaml-action');
    expect(html).toContain(
      `data-report-id="${encodeURIComponent(detail.reportId)}"`,
    );
    expect(
      file.projects[0].documents[0].cases[0].attempts[0].steps[0]
        .agentDetails![0].executionId,
    ).toBe(detail.executionId);
    await agent.destroy();
  });

  test('preserves Runner-only failure through the public report merge API', async () => {
    const agent = createAgent();
    rs.mocked(agent.evaluateJavaScript).mockRejectedValue(
      new Error('submit failed'),
    );
    await expect(agent.runYaml(yaml)).rejects.toThrow('submit failed');
    const exported = agent.reportHTMLString();
    expect(exported).toContain('submit failed');
    await agent.destroy();
    const { mergedReportPath } = mergeReportFiles({
      htmlPaths: [agent.reportFile!],
      outputDir: join(directory, 'merged'),
      outputName: 'failed-yaml',
    });
    const dump = extractTestRunReportDumpSync(mergedReportPath)!;
    expect(dump.status).toBe('failed');
    expect(dump.summary).toMatchObject({ total: 1, failed: 1 });
    expect(
      dump.projects[0].documents[0].cases[0].attempts[0].steps[0].error
        ?.message,
    ).toContain('submit failed');
    expect(readFileSync(mergedReportPath, 'utf8')).toContain(
      'playwright_test_status="failed"',
    );
  });

  test('records finalization failure and rejects instead of claiming success', async () => {
    const agent = createAgent(false);
    const failure = new Error('report cannot be written');
    rs.spyOn(agent, '_writeYamlExecutionReport').mockRejectedValue(failure);
    const player = new ScriptPlayer({ tasks: [] }, async () => ({
      agent,
      freeFn: [],
    }));
    player.output = undefined;
    await expect(player.run()).rejects.toBe(failure);
    expect(getLegacyYamlPlayerState(player).executionRecord).toMatchObject({
      status: 'failed',
      reportError: failure,
    });
    expect(player.status).toBe('error');
    await agent.destroy();
  });
});
