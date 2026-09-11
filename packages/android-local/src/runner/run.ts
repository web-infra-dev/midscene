import fs from 'node:fs';
import path from 'node:path';

import { type Agent, Agent as CoreAgent } from '@midscene/core/agent';
import { overrideAIConfig } from '@midscene/shared/env';
import { getDebug } from '@midscene/shared/logger';

import {
  type LocalAgentConfig,
  type LocalAgentTask,
  loadLocalAgentConfig,
  resolveTaskScript,
} from '../config/schema';
import { LocalAndroidDevice } from '../device';
import { AdbShellTransport } from '../transport/adb-shell';
import { RishTransport } from '../transport/rish';
import type { AndroidTransport } from '../transport/types';

const debugRunner = getDebug('android-local:runner');

export interface LocalAgentTaskResult {
  name: string;
  type: LocalAgentTask['type'];
  status: 'ok' | 'error';
  ms: number;
  output?: unknown;
  error?: string;
}

export interface LocalAgentRunResult {
  name: string;
  startedAt: number;
  durationMs: number;
  ok: boolean;
  device: string;
  capabilities: Record<string, unknown>;
  tasks: LocalAgentTaskResult[];
  resultFile?: string;
}

export interface RunLocalAgentOptions {
  /** Path of the config file, used to resolve relative script paths. */
  configPath?: string;
  /** Injectable for tests: build a device from the config. */
  createTransport?: (config: LocalAgentConfig) => AndroidTransport;
  /** Injectable for tests: build an agent for a device. */
  createAgent?: (device: LocalAndroidDevice, config: LocalAgentConfig) => Agent;
  onEvent?: (event: { type: string; message: string }) => void;
}

function buildTransport(config: LocalAgentConfig): AndroidTransport {
  const device = config.device;

  if (device.backend === 'adb-shell') {
    return new AdbShellTransport({
      adbPath: device.adbPath,
      serial: device.serial,
      displayId: device.displayId,
      yadbPath: device.yadbPath,
    });
  }

  return new RishTransport({
    rishPath: device.rishPath,
    fileChannelDir: device.fileChannelDir,
    displayId: device.displayId,
    yadbPath: device.yadbPath,
  });
}

function applyModelConfig(config: LocalAgentConfig): void {
  const model = config.model;
  if (!model) {
    return;
  }

  const overrides: Record<string, string> = {};
  if (model.apiKey) overrides.MIDSCENE_MODEL_API_KEY = model.apiKey;
  if (model.baseUrl) overrides.MIDSCENE_MODEL_BASE_URL = model.baseUrl;
  if (model.name) overrides.MIDSCENE_MODEL_NAME = model.name;
  if (model.family) overrides.MIDSCENE_MODEL_FAMILY = model.family;

  if (Object.keys(overrides).length > 0) {
    debugRunner(
      `applying ${Object.keys(overrides).length} model config entries`,
    );
    overrideAIConfig(overrides as never, true);
  }
}

async function runTask(
  agent: Agent,
  task: LocalAgentTask,
  configPath: string | undefined,
): Promise<unknown> {
  switch (task.type) {
    case 'aiAct':
      return await agent.aiAct(requirePrompt(task));
    case 'aiAssert':
      return await agent.aiAssert(requirePrompt(task));
    case 'aiQuery':
      return await agent.aiQuery(requirePrompt(task));
    case 'yaml': {
      const script = resolveTaskScript(task, configPath ?? process.cwd());
      await agent.runYaml(script);
      return 'yaml script completed';
    }
    default:
      throw new Error(`Unsupported task type: ${task.type as string}`);
  }
}

function requirePrompt(task: LocalAgentTask): string {
  if (typeof task.prompt !== 'string' || task.prompt.trim() === '') {
    throw new Error(`Task "${task.name}" of type ${task.type} needs a prompt`);
  }

  return task.prompt;
}

/**
 * Run a config file end to end: build the transport and device, start an agent,
 * execute every task, and persist the result next to the reports.
 *
 * This is the entry point a deployment shell (CLI, daemon, or Android app)
 * calls; it never reads process-wide state beyond the model configuration.
 */
export async function runLocalAgentConfig(
  config: LocalAgentConfig,
  options: RunLocalAgentOptions = {},
): Promise<LocalAgentRunResult> {
  const startedAt = Date.now();
  const transportFactory = options.createTransport ?? buildTransport;
  const transport = transportFactory(config);

  options.onEvent?.({
    type: 'device',
    message: `connecting via ${transport.backend}`,
  });

  const capabilities = await transport.getCapabilities();
  const device = await LocalAndroidDevice.create(transport, {
    displayId: config.device.displayId,
    appNameMapping: config.device.appNameMapping,
    exposeRunAdbShellAction: config.device.exposeRunAdbShellAction,
  });
  // Snapshot the description while capabilities are still known: destroy()
  // clears them, and the report should say which backend/uid actually ran.
  const deviceDescription = device.describe();

  applyModelConfig(config);

  const agentFactory =
    options.createAgent ??
    ((localDevice: LocalAndroidDevice) =>
      new CoreAgent(localDevice, {
        generateReport: config.agent.generateReport,
        autoPrintReportMsg: false,
        screenshotShrinkFactor: config.agent.screenshotShrinkFactor,
        aiContexts: config.agent.aiContexts,
      }));

  const agent = agentFactory(device, config);
  const taskResults: LocalAgentTaskResult[] = [];

  for (const task of config.tasks) {
    const taskStartedAt = Date.now();
    options.onEvent?.({ type: 'task', message: `running ${task.name}` });

    try {
      const output = await runTask(agent, task, options.configPath);
      taskResults.push({
        name: task.name,
        type: task.type,
        status: 'ok',
        ms: Date.now() - taskStartedAt,
        output,
      });
    } catch (error) {
      taskResults.push({
        name: task.name,
        type: task.type,
        status: 'error',
        ms: Date.now() - taskStartedAt,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (config.agent.reportDir) {
    try {
      await agent.destroy?.();
    } catch (error) {
      debugRunner(
        `agent cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } else {
    await agent.destroy?.().catch(() => undefined);
  }

  await device.destroy();

  const result: LocalAgentRunResult = {
    name: config.name,
    startedAt,
    durationMs: Date.now() - startedAt,
    ok: taskResults.every((task) => task.status === 'ok'),
    device: deviceDescription,
    capabilities: capabilities as unknown as Record<string, unknown>,
    tasks: taskResults,
  };

  if (config.agent.reportDir) {
    const resultFile = await persistResult(config, result, options.configPath);
    result.resultFile = resultFile;
  }

  return result;
}

/** Read a config file and run it (the shape a CLI or app shell needs). */
export async function runLocalAgentConfigFile(
  configPath: string,
  options: Omit<RunLocalAgentOptions, 'configPath'> = {},
): Promise<LocalAgentRunResult> {
  const config = loadLocalAgentConfig(configPath);
  return await runLocalAgentConfig(config, { ...options, configPath });
}

/**
 * Resolve the report directory against the config file, so a relative path means
 * "next to the config" regardless of the process working directory (the Android
 * app runs the CLI from a different directory than the user's config lives in).
 */
function resolveReportDir(
  reportDir: string,
  configPath: string | undefined,
): string {
  if (path.isAbsolute(reportDir) || !configPath) {
    return reportDir;
  }

  return path.resolve(path.dirname(path.resolve(configPath)), reportDir);
}

async function persistResult(
  config: LocalAgentConfig,
  result: LocalAgentRunResult,
  configPath: string | undefined,
): Promise<string> {
  const dir = resolveReportDir(config.agent.reportDir as string, configPath);
  await fs.promises.mkdir(dir, { recursive: true });
  const stamp = new Date(result.startedAt).toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `${config.name}-${stamp}.json`);
  await fs.promises.writeFile(file, `${JSON.stringify(result, null, 2)}\n`);
  return file;
}
