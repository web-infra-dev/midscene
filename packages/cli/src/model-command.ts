import { runConnectivityTest } from '@midscene/core';
import {
  type IModelConfig,
  type TIntent,
  globalModelConfigManager,
} from '@midscene/shared/env';
import chalk from 'chalk';
import { loadDotenvConfig } from './dotenv-loader';

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const MODEL_VERIFY_SEPARATOR = '────────────────────────────────────────';
const MODEL_COMMAND_USAGE = `Usage:
  midscene model verify
  midscene model eval
`;

interface ModelCommandIO {
  stdout: (message: string) => void;
  stderr: (message: string) => void;
}

interface ModelCommandDeps {
  loadDotenv: () => void;
  getModelConfig: (intent: TIntent) => IModelConfig;
  verifyModel: typeof runConnectivityTest;
}

export interface CurlCommandItem {
  intents: TIntent[];
  curl: string;
  usesDefaultBaseURL: boolean;
}

function assertNoModelVerifyOptions(args: string[]) {
  for (const arg of args) {
    throw new Error(`Unknown option for midscene model verify: ${arg}`);
  }
}

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function buildChatCompletionsUrl(baseURL?: string): string {
  const normalizedBaseURL = (baseURL || DEFAULT_OPENAI_BASE_URL).replace(
    /\/+$/,
    '',
  );
  if (normalizedBaseURL.endsWith('/chat/completions')) {
    return normalizedBaseURL;
  }
  return `${normalizedBaseURL}/chat/completions`;
}

function buildCurlCommand(modelConfig: IModelConfig): string {
  const payload = {
    model: modelConfig.modelName,
    messages: [{ role: 'user', content: 'What is 1+1?' }],
  };

  return [
    `curl -X POST ${shellSingleQuote(buildChatCompletionsUrl(modelConfig.openaiBaseURL))} \\`,
    `  -H ${shellSingleQuote(`Authorization: Bearer ${modelConfig.openaiApiKey || ''}`)} \\`,
    `  -H ${shellSingleQuote('Content-Type: application/json')} \\`,
    `  -d ${shellSingleQuote(JSON.stringify(payload, null, 2))}`,
  ].join('\n');
}

function buildCurlDedupKey(modelConfig: IModelConfig): string {
  return JSON.stringify({
    baseURL: modelConfig.openaiBaseURL || DEFAULT_OPENAI_BASE_URL,
    apiKey: modelConfig.openaiApiKey || '',
    modelName: modelConfig.modelName,
  });
}

export function buildModelVerifyCurlCommands(
  configs: Array<{ intent: TIntent; modelConfig: IModelConfig }>,
): CurlCommandItem[] {
  const commandMap = new Map<string, CurlCommandItem>();

  for (const item of configs) {
    const key = buildCurlDedupKey(item.modelConfig);
    const existing = commandMap.get(key);
    if (existing) {
      existing.intents.push(item.intent);
      continue;
    }
    commandMap.set(key, {
      intents: [item.intent],
      curl: buildCurlCommand(item.modelConfig),
      usesDefaultBaseURL: !item.modelConfig.openaiBaseURL,
    });
  }

  return [...commandMap.values()];
}

function formatModelVerifyFailureOutput(
  message: string | undefined,
  curlCommands: CurlCommandItem[],
): string {
  const details = message?.trim() || 'No failure details were generated.';
  const curlSection = curlCommands
    .map((item) => {
      const baseUrlNote = item.usesDefaultBaseURL
        ? ' (base URL not configured; using OpenAI SDK default)'
        : '';
      return chalk.gray(
        `# ${item.intents.join(', ')}${baseUrlNote}\n${item.curl}`,
      );
    })
    .join('\n\n');

  return [
    chalk.red.bold('❌ Model verify failed with messages:'),
    MODEL_VERIFY_SEPARATOR,
    '',
    details,
    '',
    MODEL_VERIFY_SEPARATOR,
    'Generated curl requests for basic API connectivity:',
    'If the error is a basic connectivity issue, use these requests to test the base URL, API key, and model name directly.',
    'These commands contain your API key. Do not share them publicly.',
    '',
    curlSection,
  ].join('\n');
}

function getDefaultDeps(io: ModelCommandIO): ModelCommandDeps {
  return {
    loadDotenv: () => {
      loadDotenvConfig({
        dotenvDebug: true,
        dotenvOverride: true,
        log: io.stdout,
      });
    },
    getModelConfig: (intent) => globalModelConfigManager.getModelConfig(intent),
    verifyModel: runConnectivityTest,
  };
}

async function runModelVerifyCommand(
  args: string[],
  deps: ModelCommandDeps,
  io: ModelCommandIO,
): Promise<number> {
  try {
    if (args.includes('--help') || args.includes('-h')) {
      io.stdout(MODEL_COMMAND_USAGE);
      return 0;
    }

    assertNoModelVerifyOptions(args);
    io.stdout('Model verify started. This usually takes about 5 seconds.\n');
    deps.loadDotenv();
    io.stdout('');

    const defaultModelConfig = deps.getModelConfig('default');
    const planningModelConfig = deps.getModelConfig('planning');
    const insightModelConfig = deps.getModelConfig('insight');
    const curlCommands = buildModelVerifyCurlCommands([
      { intent: 'default', modelConfig: defaultModelConfig },
      { intent: 'planning', modelConfig: planningModelConfig },
      { intent: 'insight', modelConfig: insightModelConfig },
    ]);

    const result = await deps.verifyModel({
      defaultModelConfig,
      planningModelConfig,
      insightModelConfig,
    });

    if (result.passed) {
      io.stdout('✅ Model verify passed.');
      return 0;
    }

    io.stderr(formatModelVerifyFailureOutput(result.message, curlCommands));
    return 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr(
      [
        MODEL_VERIFY_SEPARATOR,
        '❌ Model verify failed with messages:',
        '',
        message,
        MODEL_VERIFY_SEPARATOR,
      ].join('\n'),
    );
    return 1;
  }
}

export async function runModelCommand(
  rawArgs: string[],
  deps?: Partial<ModelCommandDeps>,
  io: ModelCommandIO = {
    stdout: console.log,
    stderr: console.error,
  },
): Promise<number> {
  const [, action, ...restArgs] = rawArgs;
  const mergedDeps = {
    ...getDefaultDeps(io),
    ...deps,
  };

  if (!action || action === '--help' || action === '-h') {
    io.stdout(MODEL_COMMAND_USAGE);
    return 0;
  }

  if (action === 'verify') {
    return runModelVerifyCommand(restArgs, mergedDeps, io);
  }

  if (action === 'eval') {
    io.stderr(
      'midscene model eval is not implemented yet. It is reserved for future model evaluation suites.',
    );
    return 1;
  }

  io.stderr(
    `Unknown midscene model command: ${action}\n\n${MODEL_COMMAND_USAGE}`,
  );
  return 1;
}
