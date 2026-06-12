/**
 * Adapter tests for OpencodeGeneralAgent / CodexGeneralAgent using fixture
 * shell scripts as fake CLI bins (via the test-only MIDSCENE_BDD_*_BIN env
 * overrides). No real opencode/codex, no model calls. Fake-bin behavior is
 * driven by FAKE_* env vars passed through `generalAgent.env`; each run
 * records argv / stdin / OPENCODE_CONFIG_CONTENT into a per-test dir.
 */
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { outputTail, resolveModelEnv } from '../../src/agents/cli-agent';
import {
  CodexGeneralAgent,
  parseCodexThreadId,
} from '../../src/agents/codex-agent';
import {
  OpencodeGeneralAgent,
  parseOpencodeJsonEvents,
} from '../../src/agents/opencode-agent';
import type { GeneralAgentConfig, GeneralAgentRequest } from '../../src/types';

// ———————————————————————————— harness ————————————————————————————

const FAKE_OPENCODE = `#!/bin/sh
printf '%s\\n' "$@" > "$RECORD_DIR/args.txt"
printf '%s' "$OPENCODE_CONFIG_CONTENT" > "$RECORD_DIR/opencode-config.json"
cat > "$RECORD_DIR/stdin.txt"
prev=""
for a in "$@"; do
  if [ "$prev" = "-f" ] || [ "$prev" = "-i" ]; then
    if [ -f "$a" ]; then echo yes > "$RECORD_DIR/attachment-exists.txt"; else echo no > "$RECORD_DIR/attachment-exists.txt"; fi
  fi
  prev="$a"
done
if [ -n "$FAKE_SLEEP" ]; then sleep "$FAKE_SLEEP"; fi
if [ -n "$FAKE_STDOUT" ]; then printf '%s' "$FAKE_STDOUT"; fi
if [ -n "$FAKE_STDERR" ]; then printf '%s' "$FAKE_STDERR" >&2; fi
exit "\${FAKE_EXIT:-0}"
`;

const FAKE_CODEX = `#!/bin/sh
printf '%s\\n' "$@" > "$RECORD_DIR/args.txt"
cat > "$RECORD_DIR/stdin.txt"
prev=""
out=""
for a in "$@"; do
  if [ "$prev" = "-o" ]; then out="$a"; fi
  if [ "$prev" = "-i" ]; then
    if [ -f "$a" ]; then echo yes > "$RECORD_DIR/attachment-exists.txt"; else echo no > "$RECORD_DIR/attachment-exists.txt"; fi
  fi
  prev="$a"
done
if [ -n "$FAKE_SLEEP" ]; then sleep "$FAKE_SLEEP"; fi
if [ -n "$out" ] && [ -n "$FAKE_LAST_MESSAGE" ]; then printf '%s' "$FAKE_LAST_MESSAGE" > "$out"; fi
if [ -n "$FAKE_STDOUT" ]; then printf '%s' "$FAKE_STDOUT"; fi
if [ -n "$FAKE_STDERR" ]; then printf '%s' "$FAKE_STDERR" >&2; fi
exit "\${FAKE_EXIT:-0}"
`;

let recordDir: string;
let opencodeBin: string;
let codexBin: string;

const MODEL_ENV_KEYS = [
  'MIDSCENE_MODEL_BASE_URL',
  'MIDSCENE_MODEL_API_KEY',
  'MIDSCENE_MODEL_NAME',
  'OPENAI_BASE_URL',
  'OPENAI_API_KEY',
  'MIDSCENE_BDD_OPENCODE_BIN',
  'MIDSCENE_BDD_CODEX_BIN',
] as const;
const savedEnv: Partial<Record<(typeof MODEL_ENV_KEYS)[number], string>> = {};

beforeEach(() => {
  // The adapters resolve model env from process.env + config.env at
  // construction time — strip any developer-machine MIDSCENE_*/OPENAI_*
  // values so tests are hermetic.
  for (const key of MODEL_ENV_KEYS) {
    savedEnv[key] = process.env[key];
    Reflect.deleteProperty(process.env, key);
  }

  recordDir = mkdtempSync(path.join(os.tmpdir(), 'midscene-bdd-cli-'));
  opencodeBin = path.join(recordDir, 'fake-opencode');
  codexBin = path.join(recordDir, 'fake-codex');
  writeFileSync(opencodeBin, FAKE_OPENCODE);
  writeFileSync(codexBin, FAKE_CODEX);
  chmodSync(opencodeBin, 0o700);
  chmodSync(codexBin, 0o700);
  process.env.MIDSCENE_BDD_OPENCODE_BIN = opencodeBin;
  process.env.MIDSCENE_BDD_CODEX_BIN = codexBin;
});

afterEach(() => {
  for (const key of MODEL_ENV_KEYS) {
    const saved = savedEnv[key];
    if (saved === undefined) {
      Reflect.deleteProperty(process.env, key);
    } else {
      process.env[key] = saved;
    }
  }
  rmSync(recordDir, { recursive: true, force: true });
});

const req = (over: Partial<GeneralAgentRequest> = {}): GeneralAgentRequest => ({
  kind: 'act',
  prompt: 'do the thing',
  skills: [],
  ...over,
});

/** Endpoint env + fake-bin knobs, merged through generalAgent.env. */
function cfg(
  fake: Record<string, string>,
  over: Partial<GeneralAgentConfig> = {},
): GeneralAgentConfig {
  return {
    env: {
      RECORD_DIR: recordDir,
      MIDSCENE_MODEL_BASE_URL: 'http://model.example/v1',
      MIDSCENE_MODEL_API_KEY: 'sk-test',
      MIDSCENE_MODEL_NAME: 'unit-model',
      ...fake,
    },
    timeoutMs: 5_000,
    ...over,
  };
}

function recordedArgs(): string[] {
  return readFileSync(path.join(recordDir, 'args.txt'), 'utf8')
    .split('\n')
    .filter((line) => line.length > 0);
}

function recorded(name: string): string {
  return readFileSync(path.join(recordDir, name), 'utf8');
}

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// ———————————————————————————— opencode ————————————————————————————

describe('OpencodeGeneralAgent', () => {
  it('runs the CLI and returns stdout as text', async () => {
    const agent = new OpencodeGeneralAgent(
      cfg({ FAKE_STDOUT: 'all done' }),
      recordDir,
    );
    const result = await agent.run(req());
    expect(result.text).toBe('all done');

    const args = recordedArgs();
    expect(args[0]).toBe('run');
    expect(args).toContain('--dir');
    expect(args[args.indexOf('--dir') + 1]).toBe(recordDir);
    expect(args[args.indexOf('-m') + 1]).toBe('midscene/unit-model');
    expect(args[args.length - 1]).toBe('do the thing');
    expect(args).not.toContain('--dangerously-skip-permissions');
    expect(args).not.toContain('--format');
  });

  it('parses a verdict for assert requests', async () => {
    const agent = new OpencodeGeneralAgent(
      cfg({ FAKE_STDOUT: 'checked it {"pass": true, "reason": "ok"}' }),
      recordDir,
    );
    const result = await agent.run(req({ kind: 'assert' }));
    expect(result.verdict).toEqual({ pass: true, reason: 'ok' });
    // The assert prompt carries the verdict instructions.
    const args = recordedArgs();
    expect(args[args.length - 1]).toContain('fail-closed');
  });

  it('returns no verdict (fail-closed upstream) when the reply has none', async () => {
    const agent = new OpencodeGeneralAgent(
      cfg({ FAKE_STDOUT: 'looks fine to me' }),
      recordDir,
    );
    const result = await agent.run(req({ kind: 'assert' }));
    expect(result.verdict).toBeUndefined();
    expect(result.text).toBe('looks fine to me');
  });

  it('generates OPENCODE_CONFIG_CONTENT with the midscene provider and env-deferred key', async () => {
    const agent = new OpencodeGeneralAgent(
      cfg({ FAKE_STDOUT: 'ok' }),
      recordDir,
    );
    await agent.run(req());

    const generated = JSON.parse(recorded('opencode-config.json'));
    expect(generated).toEqual({
      share: 'disabled',
      autoupdate: false,
      provider: {
        midscene: {
          npm: '@ai-sdk/openai-compatible',
          options: {
            baseURL: 'http://model.example/v1',
            apiKey: '{env:MIDSCENE_MODEL_API_KEY}',
          },
          models: { 'unit-model': {} },
        },
      },
      model: 'midscene/unit-model',
    });
  });

  it('omits apiKey from the generated provider when no key env var is set', async () => {
    const config = cfg({ FAKE_STDOUT: 'ok' });
    Reflect.deleteProperty(
      config.env as Record<string, string>,
      'MIDSCENE_MODEL_API_KEY',
    );
    const agent = new OpencodeGeneralAgent(config, recordDir);
    await agent.run(req());
    const generated = JSON.parse(recorded('opencode-config.json'));
    expect(generated.provider.midscene.options).toEqual({
      baseURL: 'http://model.example/v1',
    });
  });

  it('falls back to legacy OPENAI_* env vars', async () => {
    const config: GeneralAgentConfig = {
      env: {
        RECORD_DIR: recordDir,
        OPENAI_BASE_URL: 'http://legacy.example/v1',
        OPENAI_API_KEY: 'sk-legacy',
        MIDSCENE_MODEL_NAME: 'legacy-model',
        FAKE_STDOUT: 'ok',
      },
      timeoutMs: 5_000,
    };
    const agent = new OpencodeGeneralAgent(config, recordDir);
    await agent.run(req());
    const generated = JSON.parse(recorded('opencode-config.json'));
    expect(generated.provider.midscene.options).toEqual({
      baseURL: 'http://legacy.example/v1',
      apiKey: '{env:OPENAI_API_KEY}',
    });
  });

  it('maps a bare model override onto the generated provider', async () => {
    const agent = new OpencodeGeneralAgent(
      cfg({ FAKE_STDOUT: 'ok' }, { model: 'coding-model' }),
      recordDir,
    );
    await agent.run(req());
    const args = recordedArgs();
    expect(args[args.indexOf('-m') + 1]).toBe('midscene/coding-model');
    const generated = JSON.parse(recorded('opencode-config.json'));
    expect(generated.provider.midscene.models).toEqual({ 'coding-model': {} });
  });

  it('passes a provider/model override through as-is', async () => {
    const agent = new OpencodeGeneralAgent(
      cfg({ FAKE_STDOUT: 'ok' }, { model: 'anthropic/claude-x' }),
      recordDir,
    );
    await agent.run(req());
    const args = recordedArgs();
    expect(args[args.indexOf('-m') + 1]).toBe('anthropic/claude-x');
  });

  it("permissions: 'read-only' adds a deny block to the generated config", async () => {
    const agent = new OpencodeGeneralAgent(
      cfg({ FAKE_STDOUT: 'ok' }, { permissions: 'read-only' }),
      recordDir,
    );
    await agent.run(req());
    const generated = JSON.parse(recorded('opencode-config.json'));
    expect(generated.permission).toEqual({ edit: 'deny', bash: 'deny' });
    expect(recordedArgs()).not.toContain('--dangerously-skip-permissions');
  });

  it("permissions: 'all' passes --dangerously-skip-permissions", async () => {
    const agent = new OpencodeGeneralAgent(
      cfg({ FAKE_STDOUT: 'ok' }, { permissions: 'all' }),
      recordDir,
    );
    await agent.run(req());
    expect(recordedArgs()).toContain('--dangerously-skip-permissions');
  });

  it('attaches the screenshot via -f and cleans the temp file up', async () => {
    const agent = new OpencodeGeneralAgent(
      cfg({ FAKE_STDOUT: 'ok' }),
      recordDir,
    );
    await agent.run(
      req({ screenshotBase64: `data:image/png;base64,${TINY_PNG_BASE64}` }),
    );
    const args = recordedArgs();
    const screenshotPath = args[args.indexOf('-f') + 1];
    expect(screenshotPath).toMatch(/bdd-agent-.*\.png$/);
    // Existed while the CLI ran (the fake bin checked), removed afterwards.
    expect(recorded('attachment-exists.txt').trim()).toBe('yes');
    expect(() => readFileSync(screenshotPath)).toThrow();
  });

  it('treats exit 0 + empty stdout as failure (documented opencode bug)', async () => {
    const agent = new OpencodeGeneralAgent(cfg({}), recordDir);
    await expect(agent.run(req())).rejects.toThrow(
      /\[midscene-bdd\] opencode produced no output \(exit code 0\)/,
    );
  });

  it('treats stderr Error: lines as failure despite exit 0', async () => {
    const agent = new OpencodeGeneralAgent(
      cfg({
        FAKE_STDOUT: 'partial output',
        FAKE_STDERR: 'Error: ProviderModelNotFoundError\n',
      }),
      recordDir,
    );
    await expect(agent.run(req())).rejects.toThrow(
      /opencode reported an error despite exit code 0/,
    );
  });

  it('reports a nonzero exit with the stderr tail', async () => {
    const agent = new OpencodeGeneralAgent(
      cfg({ FAKE_EXIT: '3', FAKE_STDERR: 'something broke badly' }),
      recordDir,
    );
    await expect(agent.run(req())).rejects.toThrow(
      /opencode exited with code 3[\s\S]*something broke badly/,
    );
  });

  it('adds an actionable auth hint when the output smells like an auth failure', async () => {
    const agent = new OpencodeGeneralAgent(
      cfg({ FAKE_EXIT: '1', FAKE_STDERR: 'Unauthorized: 401 from provider' }),
      recordDir,
    );
    await expect(agent.run(req())).rejects.toThrow(
      /MIDSCENE_MODEL_API_KEY[\s\S]*opencode auth login/,
    );
  });

  it('hard-kills the CLI after timeoutMs and reports the tail', async () => {
    const agent = new OpencodeGeneralAgent(
      cfg({ FAKE_SLEEP: '10' }, { timeoutMs: 300 }),
      recordDir,
    );
    const started = Date.now();
    await expect(agent.run(req())).rejects.toThrow(
      /opencode timed out after 300ms and was killed/,
    );
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it('throws the install hint when the binary does not exist', async () => {
    process.env.MIDSCENE_BDD_OPENCODE_BIN = path.join(recordDir, 'no-such-bin');
    const agent = new OpencodeGeneralAgent(
      cfg({ FAKE_STDOUT: 'ok' }),
      recordDir,
    );
    await expect(agent.run(req())).rejects.toThrow(
      /`opencode` CLI not found[\s\S]*npm i -g opencode-ai[\s\S]*generalAgent\.type: 'codex'/,
    );
  });

  it('sessionPerScenario: parses JSON events and reuses the session id', async () => {
    const events = [
      JSON.stringify({
        type: 'step_start',
        sessionID: 'ses_unit_1',
        part: { type: 'step-start' },
      }),
      JSON.stringify({
        type: 'text',
        sessionID: 'ses_unit_1',
        part: { type: 'text', text: 'first reply' },
      }),
    ].join('\n');
    const agent = new OpencodeGeneralAgent(
      cfg({ FAKE_STDOUT: events }, { sessionPerScenario: true }),
      recordDir,
    );

    const first = await agent.run(req());
    expect(first.text).toBe('first reply');
    let args = recordedArgs();
    expect(args).toContain('--format');
    expect(args).not.toContain('-s');

    await agent.run(req());
    args = recordedArgs();
    expect(args[args.indexOf('-s') + 1]).toBe('ses_unit_1');

    // dispose() resets the session for the next scenario.
    await agent.dispose();
    await agent.run(req());
    expect(recordedArgs()).not.toContain('-s');
  });

  it('errors at construction for a codex:// base URL', () => {
    expect(
      () =>
        new OpencodeGeneralAgent(
          {
            env: {
              RECORD_DIR: recordDir,
              MIDSCENE_MODEL_BASE_URL: 'codex://app-server',
            },
          },
          recordDir,
        ),
    ).toThrow(/which only Codex understands[\s\S]*generalAgent\.type: 'codex'/);
  });

  it('errors at construction when no model endpoint is usable', () => {
    expect(
      () =>
        new OpencodeGeneralAgent({ env: { RECORD_DIR: recordDir } }, recordDir),
    ).toThrow(
      /no usable model endpoint[\s\S]*MIDSCENE_MODEL_\*[\s\S]*generalAgent\.factory/,
    );
  });

  it('errors at construction when the endpoint is set but no model name is', () => {
    expect(
      () =>
        new OpencodeGeneralAgent(
          {
            env: {
              RECORD_DIR: recordDir,
              MIDSCENE_MODEL_BASE_URL: 'http://model.example/v1',
            },
          },
          recordDir,
        ),
    ).toThrow(/set MIDSCENE_MODEL_NAME or generalAgent\.model/);
  });

  it('skips provider injection when reuseMidsceneModelEnv is false and a provider/model is given', async () => {
    const agent = new OpencodeGeneralAgent(
      cfg(
        { FAKE_STDOUT: 'ok' },
        { reuseMidsceneModelEnv: false, model: 'myprovider/my-model' },
      ),
      recordDir,
    );
    await agent.run(req());
    const generated = JSON.parse(recorded('opencode-config.json'));
    expect(generated.provider).toBeUndefined();
    const args = recordedArgs();
    expect(args[args.indexOf('-m') + 1]).toBe('myprovider/my-model');
  });
});

// ————————————————————————————— codex —————————————————————————————

describe('CodexGeneralAgent', () => {
  it('invokes codex exec with provider -c overrides, stdin prompt, and the last-message file', async () => {
    const agent = new CodexGeneralAgent(
      cfg({ FAKE_LAST_MESSAGE: 'codex says hi' }, { type: 'codex' }),
      recordDir,
    );
    const result = await agent.run(req());
    expect(result.text).toBe('codex says hi');

    const args = recordedArgs();
    expect(args[0]).toBe('exec');
    expect(args).toContain('--json');
    expect(args[args.indexOf('--cd') + 1]).toBe(recordDir);
    expect(args).toContain('--skip-git-repo-check');
    expect(args[args.indexOf('--sandbox') + 1]).toBe('workspace-write');
    expect(args[args.indexOf('-m') + 1]).toBe('unit-model');
    expect(args[args.length - 1]).toBe('-');
    // -c values are TOML: strings must be quoted.
    expect(args).toContain('model_provider="midscene"');
    expect(args).toContain(
      'model_providers.midscene.base_url="http://model.example/v1"',
    );
    expect(args).toContain(
      'model_providers.midscene.env_key="MIDSCENE_MODEL_API_KEY"',
    );
    expect(args).toContain('model_providers.midscene.wire_api="chat"');
    expect(recorded('stdin.txt')).toBe('do the thing');
  });

  it('parses the verdict from the last-message file for asserts', async () => {
    const agent = new CodexGeneralAgent(
      cfg(
        {
          FAKE_LAST_MESSAGE:
            'verified. {"pass": false, "reason": "missing row"}',
        },
        {},
      ),
      recordDir,
    );
    const result = await agent.run(req({ kind: 'assert' }));
    expect(result.verdict).toEqual({ pass: false, reason: 'missing row' });
    expect(recorded('stdin.txt')).toContain('fail-closed');
  });

  it('degrades to plain codex exec (no -c overrides) for a codex:// base URL', async () => {
    const agent = new CodexGeneralAgent(
      {
        env: {
          RECORD_DIR: recordDir,
          MIDSCENE_MODEL_BASE_URL: 'codex://app-server',
          FAKE_LAST_MESSAGE: 'ok',
        },
        timeoutMs: 5_000,
      },
      recordDir,
    );
    await agent.run(req());
    const args = recordedArgs();
    expect(args).not.toContain('-c');
    expect(args).not.toContain('-m');
  });

  it('degrades to plain codex exec when no base URL is set at all', async () => {
    const agent = new CodexGeneralAgent(
      {
        env: { RECORD_DIR: recordDir, FAKE_LAST_MESSAGE: 'ok' },
        timeoutMs: 5_000,
      },
      recordDir,
    );
    await agent.run(req());
    expect(recordedArgs()).not.toContain('-c');
  });

  it('maps permissions onto sandbox policies', async () => {
    for (const [permissions, sandbox] of [
      ['read-only', 'read-only'],
      ['workspace', 'workspace-write'],
      ['all', 'danger-full-access'],
    ] as const) {
      const agent = new CodexGeneralAgent(
        cfg({ FAKE_LAST_MESSAGE: 'ok' }, { permissions }),
        recordDir,
      );
      await agent.run(req());
      const args = recordedArgs();
      expect(args[args.indexOf('--sandbox') + 1]).toBe(sandbox);
    }
  });

  it('attaches the screenshot via -i and cleans the temp file up', async () => {
    const agent = new CodexGeneralAgent(
      cfg({ FAKE_LAST_MESSAGE: 'ok' }),
      recordDir,
    );
    await agent.run(
      req({ screenshotBase64: `data:image/png;base64,${TINY_PNG_BASE64}` }),
    );
    const args = recordedArgs();
    const screenshotPath = args[args.indexOf('-i') + 1];
    expect(screenshotPath).toMatch(/bdd-agent-.*\.png$/);
    expect(recorded('attachment-exists.txt').trim()).toBe('yes');
    expect(() => readFileSync(screenshotPath)).toThrow();
  });

  it('treats a missing/empty last-message file as failure even on exit 0', async () => {
    const agent = new CodexGeneralAgent(
      cfg({ FAKE_STDOUT: 'events only' }),
      recordDir,
    );
    await expect(agent.run(req())).rejects.toThrow(
      /codex wrote no final message \(exit code 0\)/,
    );
  });

  it('reports a nonzero exit with an auth hint when applicable', async () => {
    const agent = new CodexGeneralAgent(
      cfg({ FAKE_EXIT: '1', FAKE_STDERR: 'Token refresh failed' }),
      recordDir,
    );
    await expect(agent.run(req())).rejects.toThrow(
      /codex exited with code 1[\s\S]*codex login/,
    );
  });

  it('throws the install hint when the binary does not exist', async () => {
    process.env.MIDSCENE_BDD_CODEX_BIN = path.join(recordDir, 'no-such-bin');
    const agent = new CodexGeneralAgent(
      cfg({ FAKE_LAST_MESSAGE: 'ok' }),
      recordDir,
    );
    await expect(agent.run(req())).rejects.toThrow(
      /`codex` CLI not found[\s\S]*npm i -g @openai\/codex/,
    );
  });

  it('errors at construction when reusing an endpoint without a model name', () => {
    expect(
      () =>
        new CodexGeneralAgent(
          {
            env: {
              RECORD_DIR: recordDir,
              MIDSCENE_MODEL_BASE_URL: 'http://model.example/v1',
            },
          },
          recordDir,
        ),
    ).toThrow(/set MIDSCENE_MODEL_NAME or generalAgent\.model/);
  });

  it('sessionPerScenario: resumes the thread from the first run', async () => {
    const events = JSON.stringify({
      type: 'thread.started',
      thread_id: 'thread-42',
    });
    const agent = new CodexGeneralAgent(
      cfg(
        { FAKE_LAST_MESSAGE: 'ok', FAKE_STDOUT: events },
        { sessionPerScenario: true },
      ),
      recordDir,
    );

    await agent.run(req());
    expect(recordedArgs()).not.toContain('resume');

    await agent.run(req());
    const args = recordedArgs();
    expect(args.slice(0, 3)).toEqual(['exec', 'resume', 'thread-42']);
    // resume has no --sandbox/--cd flags; the sandbox rides on -c.
    expect(args).toContain('sandbox_mode="workspace-write"');
    expect(args).not.toContain('--sandbox');
    expect(args).not.toContain('--cd');
  });
});

// ——————————————————————————— pure helpers ———————————————————————————

describe('resolveModelEnv', () => {
  it('classifies base URLs and prefers modern keys over legacy', () => {
    expect(
      resolveModelEnv({
        MIDSCENE_MODEL_BASE_URL: 'https://api.example/v1',
        OPENAI_BASE_URL: 'http://legacy.example/v1',
        MIDSCENE_MODEL_API_KEY: 'a',
        OPENAI_API_KEY: 'b',
        MIDSCENE_MODEL_NAME: 'm',
      }),
    ).toEqual({
      baseUrl: 'https://api.example/v1',
      baseUrlKind: 'http',
      apiKeyVar: 'MIDSCENE_MODEL_API_KEY',
      modelName: 'm',
    });
    expect(
      resolveModelEnv({ MIDSCENE_MODEL_BASE_URL: 'codex://app-server' }),
    ).toMatchObject({
      baseUrlKind: 'codex',
    });
    expect(
      resolveModelEnv({ MIDSCENE_MODEL_BASE_URL: 'ftp://x' }),
    ).toMatchObject({
      baseUrlKind: 'other',
    });
    expect(resolveModelEnv({})).toEqual({
      baseUrl: undefined,
      baseUrlKind: 'none',
      apiKeyVar: undefined,
      modelName: undefined,
    });
  });
});

describe('parseOpencodeJsonEvents', () => {
  it('joins text parts and captures the first session id', () => {
    const stdout = [
      '{"type":"step_start","sessionID":"ses_a","part":{}}',
      'not json',
      '{"type":"text","sessionID":"ses_a","part":{"type":"text","text":"one"}}',
      '{"type":"text","sessionID":"ses_a","part":{"type":"text","text":"two"}}',
    ].join('\n');
    expect(parseOpencodeJsonEvents(stdout)).toEqual({
      text: 'one\n\ntwo',
      sessionId: 'ses_a',
    });
  });
});

describe('parseCodexThreadId', () => {
  it('finds the thread.started event', () => {
    const stdout = [
      '{"type":"turn.started"}',
      '{"type":"thread.started","thread_id":"t-9"}',
    ].join('\n');
    expect(parseCodexThreadId(stdout)).toBe('t-9');
    expect(parseCodexThreadId('no events here')).toBeUndefined();
  });
});

describe('outputTail', () => {
  it('keeps short output and truncates long output from the end', () => {
    expect(outputTail('short')).toBe('short');
    const long = 'x'.repeat(5000);
    const tail = outputTail(long);
    expect(tail.length).toBe(2001);
    expect(tail.startsWith('…')).toBe(true);
  });
});
