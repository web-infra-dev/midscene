import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Agent as AgentType } from '@midscene/core/agent';
import type { WorkflowDocumentRunResult } from '@midscene/core/internal/test-runner';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectTeardown } from '../src/cli/test-project';
import {
  type YamlRuntimeContext,
  createYamlProjectSetup,
} from '../src/runtime';

const require = createRequire(import.meta.url);
const { Agent } = require('@midscene/core/agent') as {
  Agent: typeof AgentType;
};

const host = vi.hoisted(() => ({ createYamlAgent: vi.fn() }));
vi.mock('../src/runtime/create-yaml-player', () => host);
const directories: string[] = [];
const temporaryDirectory = () => {
  const directory = mkdtempSync(join(tmpdir(), 'yaml-runtime-output-'));
  directories.push(directory);
  return directory;
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('YAML platform setup for native Test projects', () => {
  const documentResult = (): WorkflowDocumentRunResult => ({
    documentId: 'document',
    documentRunId: 'run',
    projectId: 'project',
    projectName: 'project',
    sourcePath: 'native.yaml',
    status: 'success',
    startedAt: '2026-01-01T00:00:00.000Z',
    endedAt: '2026-01-01T00:00:00.000Z',
    durationMs: 0,
    beforeAll: [],
    afterAll: [],
    outputs: { price: 42, check: { pass: false } },
  });

  it.each(['page', 'browser', 'harmony'] as const)(
    'publishes native named results and logs through %s YAML fields',
    async (platform) => {
      const directory = temporaryDirectory();
      const output = join(directory, 'result.json');
      const log = join(directory, 'log.json');
      const definition = createYamlProjectSetup({
        file: 'runtime.yaml',
        script: {
          [platform]: {
            ...(platform === 'harmony' ? {} : { url: 'about:blank' }),
            output,
            unstableLogContent: log,
          },
        },
      });
      const agent = {
        _unstableLogContent: vi.fn(() => ({ messages: ['completed'] })),
      };
      await definition.onDocumentResult!(documentResult(), {
        agent: agent as any,
      });
      expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual({
        price: 42,
        check: { pass: false },
      });
      expect(JSON.parse(readFileSync(log, 'utf8'))).toEqual({
        messages: ['completed'],
      });
      expect(host.createYamlAgent).not.toHaveBeenCalled();
    },
  );

  it('uses top-level config output for a custom interface and permits disabling logs', async () => {
    const directory = temporaryDirectory();
    const output = join(directory, 'result.json');
    const definition = createYamlProjectSetup({
      file: 'runtime.yaml',
      script: {
        interface: { module: './device.mjs' },
        config: { output, unstableLogContent: false },
      },
    });
    const agent = { _unstableLogContent: vi.fn() };
    await definition.onDocumentResult!(documentResult(), {
      agent: agent as any,
    });
    expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual(
      documentResult().outputs,
    );
    expect(agent._unstableLogContent).not.toHaveBeenCalled();
  });

  it.each(['output', 'unstableLogContent'] as const)(
    'classifies native %s file errors as publication failures',
    async (field) => {
      const directory = temporaryDirectory();
      const blocker = join(directory, 'file');
      writeFileSync(blocker, 'not a directory');
      const path = join(blocker, 'result.json');
      const definition = createYamlProjectSetup({
        file: 'runtime.yaml',
        script: {
          config: { output: join(directory, 'result.json'), [field]: path },
        },
      });
      await expect(
        Promise.resolve().then(() =>
          definition.onDocumentResult!(documentResult(), {
            agent: { _unstableLogContent: () => ({ messages: [] }) } as any,
          }),
        ),
      ).rejects.toMatchObject({
        code: 'WORKFLOW_PUBLICATION_FAILED',
        details: { operation: 'write-result', path },
      });
    },
  );

  it('shares one Agent and preserves the platform cleanup plan order', async () => {
    const calls: string[] = [];
    const agent = { runYaml: vi.fn(async () => calls.push('setup')) };
    let disconnected = false;
    host.createYamlAgent.mockResolvedValue({
      agent,
      freeFn: [
        {
          name: 'agent',
          fn: async () => {
            calls.push('agent');
          },
        },
        {
          name: 'page',
          fn: async () => {
            if (disconnected) throw new Error('CDP connection is closed');
            calls.push('page');
          },
        },
        {
          name: 'cdp_browser_disconnect',
          fn: async () => {
            disconnected = true;
            calls.push('disconnect');
          },
        },
      ],
    });
    const teardowns: Array<() => Promise<void>> = [];
    const definition = createYamlProjectSetup({
      file: 'runtime.yaml',
      script: { web: { url: 'https://example.com', cdpEndpoint: 'ws://cdp' } },
      setup: 'tasks:\n  - name: login\n    flow: []',
    });
    const context = await definition.setup({
      signal: new AbortController().signal,
      onTeardown: (fn: ProjectTeardown<YamlRuntimeContext>) =>
        teardowns.push(fn as () => Promise<void>),
    } as any);
    expect(context.agent).toBe(agent);
    expect(host.createYamlAgent).toHaveBeenCalledWith(
      'runtime.yaml',
      { web: { url: 'https://example.com', cdpEndpoint: 'ws://cdp' } },
      undefined,
    );
    expect(calls).toEqual(['setup']);
    await teardowns[0]();
    expect(calls).toEqual(['setup', 'agent', 'page', 'disconnect']);
  });

  it('registers teardown before setup YAML can fail and retains all cleanup failures', async () => {
    const agent = {
      runYaml: vi.fn(async () => {
        throw new Error('login failed');
      }),
    };
    const first = new Error('first cleanup');
    const second = new Error('second cleanup');
    host.createYamlAgent.mockResolvedValue({
      agent,
      freeFn: [
        {
          name: 'first',
          fn: async () => {
            throw first;
          },
        },
        {
          name: 'second',
          fn: async () => {
            throw second;
          },
        },
      ],
    });
    const onTeardown = vi.fn();
    await expect(
      createYamlProjectSetup({
        file: 'runtime.yaml',
        script: { web: { url: 'https://example.com' } },
        setup: 'login',
      }).setup({ signal: new AbortController().signal, onTeardown } as any),
    ).rejects.toThrow('login failed');
    expect(onTeardown).toHaveBeenCalledTimes(1);
    await expect(onTeardown.mock.calls[0][0]()).rejects.toMatchObject({
      errors: [first, second],
    });
  });

  it('skips setup YAML after cancellation during Agent creation and keeps cleanup registered', async () => {
    const controller = new AbortController();
    const agent = { runYaml: vi.fn() };
    const cleanup = vi.fn(async () => {});
    let ready!: (value: {
      agent: typeof agent;
      freeFn: { name: string; fn: typeof cleanup }[];
    }) => void;
    host.createYamlAgent.mockReturnValue(
      new Promise((resolve) => {
        ready = resolve;
      }),
    );
    const onTeardown = vi.fn();
    const pending = createYamlProjectSetup({
      file: 'runtime.yaml',
      script: { web: { url: 'https://example.com' } },
      setup: 'tasks:\n  - name: login\n    flow: []',
    }).setup({ signal: controller.signal, onTeardown } as any);
    controller.abort(new Error('Stopped during launch'));
    ready({ agent, freeFn: [{ name: 'agent', fn: cleanup }] });
    await expect(pending).rejects.toThrow('Stopped during launch');
    expect(agent.runYaml).not.toHaveBeenCalled();
    expect(onTeardown).toHaveBeenCalledTimes(1);
    await onTeardown.mock.calls[0][0]();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('cancels running setup YAML through the Project signal without destroying a borrowed Agent', async () => {
    const destroy = vi.fn(async () => {});
    const evaluateJavaScript = vi.fn(async () => undefined);
    const agent = new Agent(
      {
        interfaceType: 'fixture',
        actionSpace: () => [],
        evaluateJavaScript,
        destroy,
      } as any,
      { generateReport: false, autoPrintReportMsg: false },
    );
    host.createYamlAgent.mockResolvedValue({ agent, freeFn: [] });
    const runYaml = vi.spyOn(agent, 'runYaml');
    const controller = new AbortController();
    const onTeardown = vi.fn();
    const pending = createYamlProjectSetup({
      file: 'runtime.yaml',
      script: {},
      options: { agent },
      setup:
        'tasks:\n  - name: login\n    flow:\n      - sleep: 10000\n      - javascript: must-not-run',
    }).setup({ signal: controller.signal, onTeardown } as any);
    await vi.waitFor(() => expect(runYaml).toHaveBeenCalledTimes(1));
    controller.abort(new Error('Stopped setup'));
    await expect(pending).rejects.toThrow();
    expect(evaluateJavaScript).not.toHaveBeenCalled();
    await onTeardown.mock.calls[0][0]();
    expect(destroy).not.toHaveBeenCalled();
  });
});
