import {
  type IModelConfig,
  type TIntent,
  globalModelConfigManager,
} from '@midscene/shared/env';
import { describe, expect, it, vi } from 'vitest';
import { loadDotenvConfig } from '../src/cli/dotenv-loader';
import {
  buildModelVerifyCurlCommands,
  runModelCommand,
} from '../src/cli/model-command';

vi.mock('@midscene/core', () => ({ runConnectivityTest: vi.fn() }));

vi.mock('../src/cli/dotenv-loader', () => ({
  loadDotenvConfig: vi.fn(),
}));

vi.spyOn(globalModelConfigManager, 'getModelConfig');

function createModelConfig(
  overrides: Partial<IModelConfig> = {},
): IModelConfig {
  return {
    modelName: 'gpt-4o',
    modelFamily: 'gpt-5',
    openaiBaseURL: 'https://api.example.com/v1',
    openaiApiKey: 'sk-test',
    intent: 'default',
    slot: 'default',
    ...overrides,
  } as IModelConfig;
}

function createIO() {
  return {
    stdout: vi.fn(),
    stderr: vi.fn(),
  };
}

describe('model command', () => {
  it('prints models, safe endpoints, actual request counts and mixed check results', async () => {
    const io = createIO();
    const checks = [
      {
        name: 'text' as const,
        intent: 'planning' as const,
        modelName: 'planner',
        passed: true,
        requestCount: 1,
        durationMs: 120,
        endpoints: [
          'https://user:secret@example.com/v1/responses?api_key=secret',
        ],
        message: '',
      },
      {
        name: 'vision' as const,
        intent: 'insight' as const,
        modelName: 'vision',
        passed: false,
        requestCount: 0,
        durationMs: 0,
        endpoints: [],
        message: 'Invalid configuration',
      },
      {
        name: 'aiLocate' as const,
        intent: 'default' as const,
        modelName: 'locator',
        passed: true,
        requestCount: 2,
        durationMs: 250,
        endpoints: ['https://example.com/v1/chat/completions'],
        message: '',
      },
    ];
    expect(
      await runModelCommand(
        ['model', 'verify'],
        {
          loadDotenv: vi.fn(),
          getModelConfig: (intent) =>
            createModelConfig({
              intent,
              openaiBaseURL:
                'https://user:secret@example.com/v1?api_key=secret',
            }),
          verifyModel: vi.fn().mockResolvedValue({
            passed: false,
            requestCount: 3,
            checks,
            message: 'Invalid configuration',
          }),
        },
        io,
      ),
    ).toBe(1);
    const output = io.stdout.mock.calls.flat().join('\n');
    expect(output).toMatch(/Model role\s+Model\s+Check\s+Endpoint/);
    expect(output).toMatch(/planning\s+gpt-4o\s+Text response\s+\[1\]/);
    expect(output).toContain('[1] Base URL: https://example.com/v1');
    expect(output.match(/Base URL:/g)).toHaveLength(1);
    expect(output).toMatch(/planning\s+Text response\s+PASS\s+1\s+120 ms/);
    expect(output).toMatch(/insight\s+Image understanding\s+FAIL\s+0\s+0 ms/);
    expect(output).toMatch(/default\s+AI locate\s+PASS\s+2\s+250 ms/);
    expect(output).toContain('planning: https://example.com/v1/responses');
    expect(output).toContain('Requests sent: 3. Checks: 2 passed, 1 failed.');
    expect(output).not.toContain('secret');
  });

  it('deduplicates curl commands by base URL, API key, and model name', () => {
    const commands = buildModelVerifyCurlCommands([
      {
        intent: 'default',
        modelConfig: createModelConfig({ intent: 'default' }),
      },
      {
        intent: 'planning',
        modelConfig: createModelConfig({ intent: 'planning' }),
      },
      {
        intent: 'insight',
        modelConfig: createModelConfig({
          intent: 'insight',
          modelName: 'gpt-4o-mini',
        }),
      },
    ]);

    expect(commands).toHaveLength(2);
    expect(commands[0].intents).toEqual(['default', 'planning']);
    expect(commands[0].curl).toContain(
      "curl -X POST 'https://api.example.com/v1/chat/completions'",
    );
    expect(commands[0].curl).toContain("-H 'Authorization: Bearer sk-test'");
    expect(commands[0].curl).toContain('"model": "gpt-4o"');
    expect(commands[0].curl).toContain('"content": "What is 1+1?"');
    expect(commands[0].curl).not.toContain('max_tokens');
    expect(commands[1].intents).toEqual(['insight']);
    expect(commands[1].curl).toContain('"model": "gpt-4o-mini"');
  });

  it('marks curl commands that use the OpenAI SDK default base URL', () => {
    const commands = buildModelVerifyCurlCommands([
      {
        intent: 'default',
        modelConfig: createModelConfig({
          openaiBaseURL: undefined,
        }),
      },
    ]);

    expect(commands).toHaveLength(1);
    expect(commands[0].usesDefaultBaseURL).toBe(true);
    expect(commands[0].curl).toContain(
      "curl -X POST 'https://api.openai.com/v1/chat/completions'",
    );
  });

  it('runs model verify with model configs', async () => {
    const io = createIO();
    const loadDotenv = vi.fn();
    const configs: Record<TIntent, IModelConfig> = {
      default: createModelConfig({ intent: 'default', slot: 'default' }),
      planning: createModelConfig({ intent: 'planning', slot: 'planning' }),
      insight: createModelConfig({ intent: 'insight', slot: 'insight' }),
    };
    const getModelConfig = vi.fn((intent: TIntent) => configs[intent]);
    const verifyModel = vi
      .fn()
      .mockResolvedValue({ checks: [], requestCount: 0, passed: true });

    const exitCode = await runModelCommand(
      ['model', 'verify'],
      {
        loadDotenv,
        getModelConfig,
        verifyModel,
      },
      io,
    );

    expect(exitCode).toBe(0);
    expect(loadDotenv).toHaveBeenCalledOnce();
    expect(verifyModel).toHaveBeenCalledWith({
      defaultModelConfig: configs.default,
      planningModelConfig: configs.planning,
      insightModelConfig: configs.insight,
    });
    expect(io.stdout).toHaveBeenCalledWith(
      'Model verify started. This usually completes within 30 seconds.',
    );
    expect(io.stdout).toHaveBeenCalledWith('');
    expect(io.stdout).toHaveBeenCalledWith('✅ Model verify passed.');
    expect(vi.mocked(io.stdout).mock.invocationCallOrder[0]).toBeLessThan(
      loadDotenv.mock.invocationCallOrder[0],
    );
  });

  it('loads dotenv with override enabled for model verify', async () => {
    const io = createIO();
    const defaultConfig = createModelConfig({
      intent: 'default',
      slot: 'default',
    });
    const planningConfig = createModelConfig({
      intent: 'planning',
      slot: 'planning',
    });
    const insightConfig = createModelConfig({
      intent: 'insight',
      slot: 'insight',
    });
    const getModelConfig = vi.mocked(globalModelConfigManager.getModelConfig);
    getModelConfig.mockImplementation((intent: TIntent) => {
      const configs: Record<TIntent, IModelConfig> = {
        default: defaultConfig,
        planning: planningConfig,
        insight: insightConfig,
      };
      return configs[intent];
    });

    const exitCode = await runModelCommand(
      ['model', 'verify'],
      {
        verifyModel: vi
          .fn()
          .mockResolvedValue({ checks: [], requestCount: 0, passed: true }),
      },
      io,
    );

    expect(exitCode).toBe(0);
    expect(loadDotenvConfig).toHaveBeenCalledWith({
      dotenvDebug: true,
      dotenvOverride: true,
      log: io.stdout,
    });
  });

  it('prints failure details and generated curl commands when model verify fails', async () => {
    const io = createIO();
    const configs: Record<TIntent, IModelConfig> = {
      default: createModelConfig({
        intent: 'default',
        slot: 'default',
        openaiBaseURL: 'https://api.example.com/v1',
        openaiApiKey: 'sk-default',
        modelName: 'gpt-4o',
      }),
      planning: createModelConfig({
        intent: 'planning',
        slot: 'planning',
        openaiBaseURL: 'https://api.example.com/v1',
        openaiApiKey: 'sk-default',
        modelName: 'gpt-4o',
      }),
      insight: createModelConfig({
        intent: 'insight',
        slot: 'insight',
        openaiBaseURL: 'https://ark.example.com/api/v3',
        openaiApiKey: 'ark-key',
        modelName: 'ep-vision',
      }),
    };

    const exitCode = await runModelCommand(
      ['model', 'verify'],
      {
        loadDotenv: vi.fn(),
        getModelConfig: vi.fn((intent: TIntent) => configs[intent]),
        verifyModel: vi.fn().mockResolvedValue({
          checks: [],
          requestCount: 0,
          passed: false,
          message: '[Vision check - ep-vision (insight)]: 404 Not Found',
        }),
      },
      io,
    );

    expect(exitCode).toBe(1);
    const output = vi.mocked(io.stderr).mock.calls[0][0];
    expect(output).toContain('────────────────────────────────────────');
    expect(output).toContain('❌ Model verify failed with messages:');
    expect(output).toContain(
      '[Vision check - ep-vision (insight)]: 404 Not Found',
    );
    expect(output).toContain(
      'Generated curl requests for basic API connectivity:',
    );
    expect(output).toContain(
      'If the error is a basic connectivity issue, use these requests to test the base URL, API key, and model name directly.',
    );
    expect(output).toContain('These commands contain your API key.');
    expect(output).toContain('# default, planning');
    expect(output).toContain('# insight');
    expect(output).toContain('sk-default');
    expect(output).toContain('ark-key');
    expect(output.match(/curl -X POST/g)).toHaveLength(2);
  });

  it('explains when a generated curl command uses the default base URL', async () => {
    const io = createIO();
    const configs: Record<TIntent, IModelConfig> = {
      default: createModelConfig({
        intent: 'default',
        slot: 'default',
        openaiBaseURL: undefined,
      }),
      planning: createModelConfig({
        intent: 'planning',
        slot: 'planning',
        openaiBaseURL: 'https://api.example.com/v1',
      }),
      insight: createModelConfig({
        intent: 'insight',
        slot: 'insight',
        openaiBaseURL: 'https://api.example.com/v1',
      }),
    };

    await runModelCommand(
      ['model', 'verify'],
      {
        loadDotenv: vi.fn(),
        getModelConfig: vi.fn((intent: TIntent) => configs[intent]),
        verifyModel: vi.fn().mockResolvedValue({
          checks: [],
          requestCount: 0,
          passed: false,
          message: 'failed',
        }),
      },
      io,
    );

    const output = vi.mocked(io.stderr).mock.calls[0][0];
    expect(output).toContain(
      '# default (base URL not configured; using OpenAI SDK default)',
    );
    expect(output).toContain(
      "curl -X POST 'https://api.openai.com/v1/chat/completions'",
    );
  });

  it('keeps model eval as a reserved placeholder', async () => {
    const io = createIO();

    const exitCode = await runModelCommand(['model', 'eval'], {}, io);

    expect(exitCode).toBe(1);
    expect(io.stderr).toHaveBeenCalledWith(
      'midscene-test model eval is not implemented yet. It is reserved for future model evaluation suites.',
    );
  });
});
