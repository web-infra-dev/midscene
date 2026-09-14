import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from '@rstest/core';

import {
  loadLocalAgentConfig,
  localAgentConfigSchema,
  resolveTaskScript,
} from '../../src/config/schema';
import { runLocalAgentConfig } from '../../src/runner/run';
import type {
  AndroidCapabilities,
  AndroidTransport,
} from '../../src/transport/types';

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'midscene-local-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

const CAPABILITIES: AndroidCapabilities = {
  backend: 'device-bridge',
  channel: 'shizuku',
  shell: true,
  screenshot: true,
  input: true,
  appManagement: true,
  multiDisplay: false,
  gestures: true,
  textInput: 'full',
  privileged: true,
  uid: 2000,
};

/** Minimal transport stub: the runner only needs capabilities and close(). */
function createStubTransport(): AndroidTransport {
  return {
    backend: 'device-bridge',
    channel: 'shizuku',
    async getCapabilities() {
      return CAPABILITIES;
    },
    async screenshot() {
      return Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    },
    async getDisplayInfo() {
      return {
        id: 0,
        name: 'stub',
        width: 1080,
        height: 2400,
        density: 440,
        rotation: 0 as const,
        isDefault: true,
        isVirtual: false,
      };
    },
    async listDisplays() {
      return [await this.getDisplayInfo()];
    },
    async tap() {},
    async swipe() {},
    async keyEvent() {},
    async inputText() {},
    async startActivity() {},
    async forceStop() {},
    async runShell() {
      return {
        stdout:
          '  mResumedActivity: ActivityRecord{1 u0 com.example.launcher/.Home t1}',
        stderr: '',
        exitCode: 0,
      };
    },
    async healthCheck() {
      return {
        ok: true,
        backend: 'device-bridge',
        channel: 'shizuku',
        uid: 2000,
        latencyMs: 1,
        checkedAt: Date.now(),
      };
    },
    async close() {},
  } as AndroidTransport;
}

function createRecordingAgent() {
  const calls: string[] = [];
  const agent = {
    async aiAct(prompt: string) {
      calls.push(`aiAct:${prompt}`);
      return undefined;
    },
    async aiAssert(prompt: string) {
      calls.push(`aiAssert:${prompt}`);
      if (prompt.includes('FAIL')) {
        throw new Error('Assertion failed on purpose');
      }
    },
    async aiQuery(prompt: string) {
      calls.push(`aiQuery:${prompt}`);
      return { answer: 42 };
    },
    async runYaml(content: string) {
      calls.push(
        `runYaml:${content.includes('tasks:') ? 'script' : 'unknown'}`,
      );
      return { result: {} };
    },
    async destroy() {
      calls.push('destroy');
    },
  };

  return { agent, calls };
}

describe('local agent config schema', () => {
  test('applies defaults for device and agent', () => {
    const config = localAgentConfigSchema.parse({
      tasks: [{ name: 'open', type: 'aiAct', prompt: 'open settings' }],
    });

    expect(config.name).toBe('midscene-local');
    expect(config.device.backend).toBe('device-bridge');
    expect(config.agent.generateReport).toBe(true);
    expect(config.tasks).toHaveLength(1);
  });

  test('rejects a config without tasks', () => {
    const result = localAgentConfigSchema.safeParse({ tasks: [] });

    expect(result.success).toBe(false);
  });

  test('rejects an unknown backend', () => {
    const result = localAgentConfigSchema.safeParse({
      device: { backend: 'carrier-pigeon' },
      tasks: [{ name: 'x', prompt: 'y' }],
    });

    expect(result.success).toBe(false);
  });

  test('loads YAML from disk with a readable error for missing files', () => {
    const dir = createTempDir();
    const configPath = path.join(dir, 'agent.yaml');
    fs.writeFileSync(
      configPath,
      [
        'name: phone-smoke',
        'device:',
        '  backend: shizuku-userservice',
        '  displayId: 0',
        'tasks:',
        '  - name: search',
        '    type: aiAct',
        '    prompt: tap the search box',
      ].join('\n'),
    );

    const config = loadLocalAgentConfig(configPath);

    expect(config.name).toBe('phone-smoke');
    expect(config.device.displayId).toBe(0);
    expect(config.tasks[0]?.prompt).toBe('tap the search box');

    expect(() => loadLocalAgentConfig(path.join(dir, 'missing.yaml'))).toThrow(
      /Config file not found/,
    );
  });

  test('resolves an inline script and a script path', () => {
    const dir = createTempDir();
    const scriptPath = path.join(dir, 'task.yaml');
    fs.writeFileSync(
      scriptPath,
      ['tasks:', '  - name: inline', '    flow:', '      - ai: hello'].join(
        '\n',
      ),
    );

    expect(
      resolveTaskScript(
        { name: 'a', type: 'yaml', script: 'tasks:\n  - name: x' },
        path.join(dir, 'agent.yaml'),
      ),
    ).toContain('tasks:');

    expect(
      resolveTaskScript(
        { name: 'b', type: 'yaml', script: 'task.yaml' },
        path.join(dir, 'agent.yaml'),
      ),
    ).toContain('- ai: hello');

    expect(() =>
      resolveTaskScript(
        { name: 'c', type: 'yaml', script: 'nope.yaml' },
        path.join(dir, 'agent.yaml'),
      ),
    ).toThrow(/not found/);
  });
});

describe('local agent runner', () => {
  test('runs every task type and reports ok', async () => {
    const { agent, calls } = createRecordingAgent();
    const result = await runLocalAgentConfig(
      localAgentConfigSchema.parse({
        name: 'unit',
        device: { backend: 'device-bridge' },
        tasks: [
          { name: 'act', type: 'aiAct', prompt: 'open settings' },
          { name: 'assert', type: 'aiAssert', prompt: 'settings is open' },
          { name: 'query', type: 'aiQuery', prompt: 'what is on screen' },
          { name: 'script', type: 'yaml', script: 'tasks:\n  - name: x' },
        ],
      }),
      {
        createTransport: () => createStubTransport(),
        createAgent: () => agent as never,
      },
    );

    expect(result.ok).toBe(true);
    expect(result.tasks.map((task) => task.status)).toEqual([
      'ok',
      'ok',
      'ok',
      'ok',
    ]);
    expect(result.capabilities.uid).toBe(2000);
    // The description is captured before destroy() clears capabilities.
    expect(result.device).toContain('uid=2000');
    expect(calls).toContain('aiAct:open settings');
    expect(calls).toContain('runYaml:script');
  });

  test('records a failing task without stopping the run', async () => {
    const { agent, calls } = createRecordingAgent();
    const result = await runLocalAgentConfig(
      localAgentConfigSchema.parse({
        name: 'unit',
        tasks: [
          { name: 'bad', type: 'aiAssert', prompt: 'FAIL please' },
          { name: 'good', type: 'aiAct', prompt: 'carry on' },
        ],
      }),
      {
        createTransport: () => createStubTransport(),
        createAgent: () => agent as never,
      },
    );

    expect(result.ok).toBe(false);
    expect(result.tasks[0]?.status).toBe('error');
    expect(result.tasks[0]?.error).toContain('Assertion failed');
    expect(result.tasks[1]?.status).toBe('ok');
    expect(calls).toContain('aiAct:carry on');
  });

  test('rejects a task without a prompt before running anything', async () => {
    const { agent, calls } = createRecordingAgent();
    const result = await runLocalAgentConfig(
      localAgentConfigSchema.parse({
        name: 'unit',
        tasks: [{ name: 'incomplete', type: 'aiAct' }],
      }),
      {
        createTransport: () => createStubTransport(),
        createAgent: () => agent as never,
      },
    );

    expect(result.ok).toBe(false);
    expect(result.tasks[0]?.error).toContain('needs a prompt');
    expect(calls).not.toContain('aiAct:undefined');
  });

  test('persists a result file when a report directory is configured', async () => {
    const dir = createTempDir();
    const { agent } = createRecordingAgent();
    const result = await runLocalAgentConfig(
      localAgentConfigSchema.parse({
        name: 'persisted',
        agent: { reportDir: path.join(dir, 'reports') },
        tasks: [{ name: 'smoke', type: 'aiAct', prompt: 'hello' }],
      }),
      {
        createTransport: () => createStubTransport(),
        createAgent: () => agent as never,
      },
    );

    expect(result.resultFile).toBeDefined();
    const written = JSON.parse(
      fs.readFileSync(result.resultFile as string, 'utf8'),
    );
    expect(written.name).toBe('persisted');
    expect(written.tasks[0].status).toBe('ok');
  });

  test('leaves the controller UI before the first task', async () => {
    const { agent, calls } = createRecordingAgent();
    const keys: number[] = [];
    let homePressed = false;
    const base = createStubTransport();
    const transport = {
      ...base,
      async keyEvent(keyCode: number) {
        keys.push(keyCode);
        homePressed = true;
      },
      async runShell() {
        // The controller is in front until HOME is pressed, then the launcher is.
        const pkg = homePressed
          ? 'com.example.launcher/.Home'
          : 'com.midscene.localagent/.MainActivity';
        return {
          stdout: `  mResumedActivity: ActivityRecord{1 u0 ${pkg} t1}`,
          stderr: '',
          exitCode: 0,
        };
      },
    } as AndroidTransport;

    await runLocalAgentConfig(
      localAgentConfigSchema.parse({
        name: 'home-first',
        agent: { controllerPackage: 'com.midscene.localagent' },
        tasks: [{ name: 'x', type: 'aiAct', prompt: 'y' }],
      }),
      {
        createTransport: () => transport,
        createAgent: () => agent as never,
      },
    );

    // HOME (keycode 3) is pressed exactly once, before any model call.
    expect(keys).toEqual([3]);
    expect(calls[0]).toBe('aiAct:y');
  });

  test('skips the HOME press when resetToHome is disabled', async () => {
    const keys: number[] = [];
    const base = createStubTransport();
    const transport = {
      ...base,
      async keyEvent(keyCode: number) {
        keys.push(keyCode);
      },
    } as AndroidTransport;

    await runLocalAgentConfig(
      localAgentConfigSchema.parse({
        name: 'no-home',
        agent: { resetToHome: false },
        tasks: [{ name: 'x', type: 'aiAct', prompt: 'y' }],
      }),
      {
        createTransport: () => transport,
        createAgent: () => createRecordingAgent().agent as never,
      },
    );

    expect(keys).toEqual([]);
  });

  test('resolves a relative report directory against the config file', async () => {
    const dir = createTempDir();
    const configPath = path.join(dir, 'agent.yaml');
    fs.writeFileSync(configPath, 'tasks:\n  - name: x\n    prompt: y\n');
    const { agent } = createRecordingAgent();

    const result = await runLocalAgentConfig(
      localAgentConfigSchema.parse({
        name: 'relative',
        agent: { reportDir: './reports' },
        tasks: [{ name: 'smoke', type: 'aiAct', prompt: 'hello' }],
      }),
      {
        configPath,
        createTransport: () => createStubTransport(),
        createAgent: () => agent as never,
      },
    );

    // Not resolved against process.cwd(), which differs inside the Android app.
    expect(result.resultFile).toContain(path.join(dir, 'reports'));
    expect(fs.existsSync(result.resultFile as string)).toBe(true);
  });
});
