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
import {
  ExecBridgeCommandRunner,
  bridgeFromEnv,
  createBridgeFileIo,
} from '../transport/bridge';
import { RishTransport } from '../transport/rish';
import type { AndroidTransport } from '../transport/types';

const debugRunner = getDebug('android-local:runner');

/**
 * Structured progress events for the host app's overlay.
 *
 * They are printed as `[event] {json}` lines on the same stream as the human log,
 * so a terminal shows both while the Android host can build a live state machine
 * (phase, step index, timings) instead of parsing prose.
 */
function emitEvent(
  onEvent: ((event: { type: string; message: string }) => void) | undefined,
  payload: Record<string, unknown>,
): void {
  const line = `[event] ${JSON.stringify(payload)}`;
  // stdout only: the host prints onEvent messages as well, which duplicated every
  // event in the log.
  process.stdout.write(`${line}\n`);
}

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
  /**
   * HTML report produced by the agent for this run, when report generation is
   * enabled. Discovered by scanning the run directory, so the app does not have
   * to know Midscene's internal report naming.
   */
  reportFile?: string;
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

  // On device the app hands us a loopback bridge backed by a Shizuku user
  // service; it takes precedence because rish cannot run from an app process on
  // Android 14.
  const bridge = bridgeFromEnv();
  if (bridge && device.backend !== 'adb-shell') {
    const runner = new ExecBridgeCommandRunner(bridge);
    return new RishTransport({
      runner,
      fileIo: createBridgeFileIo(runner),
      // The channel dir must be readable by the app process (it serves the
      // payloads) and writable by the shell, which is what the app's external
      // files directory provides.
      fileChannelDir: device.fileChannelDir,
      displayId: device.displayId,
      yadbPath: device.yadbPath,
      unsetEnv: [],
    });
  }

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

/**
 * Press HOME so the run does not record the app that started it.
 *
 * Midscene's reports include the screenshots the model saw; starting a run from
 * the controller UI would otherwise capture that UI in the first steps (and can
 * even make the agent try to operate it). The resumed package is read before and
 * after, so the log shows what the device actually switched to.
 */
async function resetDeviceToHome(
  transport: AndroidTransport,
  timeoutMs: number,
  controllerPackage: string | undefined,
  onEvent: ((event: { type: string; message: string }) => void) | undefined,
): Promise<{ foreground?: string; leftController: boolean }> {
  if (!transport.runShell) {
    return { leftController: false };
  }

  const before = await readForegroundPackage(transport);
  const deadline = Date.now() + timeoutMs;
  let current = before;

  try {
    // Press HOME, then re-press while the controller (or the previous activity)
    // is still in front: some devices need a second press, and a device with a
    // broken launcher falls back to the app that asked for HOME.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (current !== before && current !== controllerPackage) {
        break;
      }
      await transport.keyEvent(3);
      const attemptDeadline = Math.min(deadline, Date.now() + 2500);
      while (Date.now() < attemptDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        current = await readForegroundPackage(transport);
        const left = controllerPackage
          ? current !== controllerPackage
          : current !== before;
        if (current && left) {
          return { foreground: current, leftController: true };
        }
      }
      if (Date.now() >= deadline) {
        break;
      }
    }
  } catch (error) {
    onEvent?.({
      type: 'device',
      message: `could not press HOME before the run: ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
  }

  return { foreground: current, leftController: false };
}

/** Resumed package of the primary display, or undefined when unreadable. */
async function readForegroundPackage(
  transport: AndroidTransport,
): Promise<string | undefined> {
  if (!transport.runShell) {
    return undefined;
  }

  try {
    // Android 14 tops the list with `topResumedActivity`; older releases only
    // carry `mResumedActivity`, and some builds expose neither.
    const result = await transport.runShell(
      'dumpsys activity activities | grep -E "topResumedActivity|mResumedActivity" | head -2',
      { timeoutMs: 5000 },
    );
    const match = result.stdout.match(/([A-Za-z0-9_.]+)\/[A-Za-z0-9_.$]+/);
    return match?.[1];
  } catch {
    return undefined;
  }
}

interface LocatedRect {
  x: number;
  y: number;
  w: number;
  h: number;
  centerX?: number;
  centerY?: number;
}

/**
 * Walk the dump for element rectangles, newest last.
 *
 * The dump shape evolves, so this looks for the fields rather than a fixed path: any
 * object carrying x/y plus width/height (or w/h, or left/top/right/bottom) counts, as
 * does a [x, y] centre.
 */
function collectRects(node: unknown, found: LocatedRect[] = []): LocatedRect[] {
  if (Array.isArray(node)) {
    for (const item of node) {
      collectRects(item, found);
    }
    return found;
  }
  if (!node || typeof node !== 'object') {
    return found;
  }

  const record = node as Record<string, unknown>;
  const number = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined;

  const x = number(record.x) ?? number(record.left);
  const y = number(record.y) ?? number(record.top);
  const w =
    number(record.width) ??
    number(record.w) ??
    (number(record.right) !== undefined && x !== undefined
      ? (number(record.right) as number) - x
      : undefined);
  const h =
    number(record.height) ??
    number(record.h) ??
    (number(record.bottom) !== undefined && y !== undefined
      ? (number(record.bottom) as number) - y
      : undefined);

  const center = Array.isArray(record.center) ? record.center : undefined;
  const centerX = center ? number(center[0]) : undefined;
  const centerY = center ? number(center[1]) : undefined;

  if (
    x !== undefined &&
    y !== undefined &&
    w !== undefined &&
    h !== undefined &&
    w > 0 &&
    h > 0
  ) {
    found.push({ x, y, w, h, centerX, centerY });
  } else if (centerX !== undefined && centerY !== undefined) {
    found.push({ x: centerX, y: centerY, w: 0, h: 0, centerX, centerY });
  }

  for (const value of Object.values(record)) {
    collectRects(value, found);
  }
  return found;
}

/**
 * Report the located element to the host.
 *
 * Coordinates live in the screenshot the model saw, which Midscene scales by
 * `screenshotShrinkFactor`, so they are divided back into screen pixels here (the
 * transport owns the screen geometry; this keeps the mapping next to the config that
 * caused it).
 */
function attachLocationReporting(
  agent: { onDumpUpdate?: unknown },
  shrinkFactor: number | undefined,
  onEvent: ((event: { type: string; message: string }) => void) | undefined,
): void {
  const shrink = shrinkFactor && shrinkFactor > 0 ? shrinkFactor : 1;
  let lastKey = '';

  try {
    agent.onDumpUpdate = (dump: unknown) => {
      const rects = collectRects(dump).filter(
        (rect) => rect.w > 0 && rect.h > 0,
      );
      const latest = rects[rects.length - 1];
      if (!latest) {
        return;
      }

      const key = `${latest.x},${latest.y},${latest.w},${latest.h}`;
      if (key === lastKey) {
        return;
      }
      lastKey = key;

      const scale = (value: number) => Math.round(value / shrink);
      emitEvent(onEvent, {
        event: 'locate',
        rect: {
          x: scale(latest.x),
          y: scale(latest.y),
          w: scale(latest.w),
          h: scale(latest.h),
        },
        screenshot: { x: latest.x, y: latest.y, w: latest.w, h: latest.h },
        shrink,
      });
      if (latest.centerX !== undefined && latest.centerY !== undefined) {
        emitEvent(onEvent, {
          event: 'tap',
          x: scale(latest.centerX),
          y: scale(latest.centerY),
        });
      }
    };
  } catch (error) {
    debugRunner(
      `location reporting unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Prompt text of a task, used by the overlay to describe the current step. */
function promptOf(task: LocalAgentTask): string {
  const candidate = task as { prompt?: unknown; script?: unknown };
  if (typeof candidate.prompt === 'string') {
    return candidate.prompt;
  }
  if (typeof candidate.script === 'string') {
    return `script: ${candidate.script}`;
  }
  return task.name;
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

  if (config.agent.resetToHome) {
    const outcome = await resetDeviceToHome(
      transport,
      config.agent.resetToHomeTimeoutMs,
      config.agent.controllerPackage,
      options.onEvent,
    );
    options.onEvent?.({
      type: 'device',
      message: outcome.leftController
        ? `left the controller UI before the run (foreground: ${outcome.foreground ?? 'unknown'})`
        : `pressed HOME but the foreground is still ${outcome.foreground ?? 'unknown'}`,
    });
  }

  const agent = agentFactory(device, config);
  const taskResults: LocalAgentTaskResult[] = [];

  // Feed the host's overlay: every dump update carries the element the agent just
  // located, which is what the dashed box and the tap ripple visualise.
  attachLocationReporting(
    agent,
    config.agent.screenshotShrinkFactor,
    options.onEvent,
  );

  emitEvent(options.onEvent, {
    event: 'run.start',
    name: config.name,
    total: config.tasks.length,
    startedAt,
  });

  for (let index = 0; index < config.tasks.length; index += 1) {
    const task = config.tasks[index];
    const taskStartedAt = Date.now();
    options.onEvent?.({ type: 'task', message: `running ${task.name}` });
    emitEvent(options.onEvent, {
      event: 'step.start',
      index: index + 1,
      total: config.tasks.length,
      name: task.name,
      taskType: task.type,
      // The phase a UI should show while this step runs: an assertion observes,
      // everything else acts.
      phase: task.type === 'aiAssert' ? 'asserting' : 'acting',
      prompt: promptOf(task),
      startedAt: taskStartedAt,
    });

    try {
      const output = await runTask(agent, task, options.configPath);
      const ms = Date.now() - taskStartedAt;
      taskResults.push({
        name: task.name,
        type: task.type,
        status: 'ok',
        ms,
        output,
      });
      emitEvent(options.onEvent, {
        event: 'step.end',
        index: index + 1,
        total: config.tasks.length,
        name: task.name,
        status: 'ok',
        ms,
      });
    } catch (error) {
      const ms = Date.now() - taskStartedAt;
      taskResults.push({
        name: task.name,
        type: task.type,
        status: 'error',
        ms: Date.now() - taskStartedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      emitEvent(options.onEvent, {
        event: 'step.end',
        index: index + 1,
        total: config.tasks.length,
        name: task.name,
        status: 'error',
        ms,
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

  emitEvent(options.onEvent, {
    event: 'run.end',
    name: config.name,
    status: result.ok ? 'ok' : 'error',
    ms: result.durationMs,
    failed: taskResults.filter((task) => task.status !== 'ok').length,
  });

  if (config.agent.generateReport) {
    result.reportFile = findNewestReport(config.agent.reportDir, startedAt);
  }

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
 * Locate the newest HTML report written during this run.
 *
 * Midscene names reports `<tag>-<timestamp>-<uuid>` under
 * `$MIDSCENE_RUN_DIR/report`, so scanning is more stable than reconstructing the
 * name; anything older than the run itself is ignored.
 */
function findNewestReport(
  reportDir: string | undefined,
  startedAt: number,
): string | undefined {
  const runDir = process.env.MIDSCENE_RUN_DIR;
  const candidates: string[] = [];
  if (runDir) {
    candidates.push(path.join(runDir, 'report'));
  }
  if (reportDir) {
    candidates.push(reportDir);
  }

  let newest: { file: string; mtimeMs: number } | undefined;
  for (const dir of candidates) {
    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.endsWith('.html')) {
        continue;
      }
      const file = path.join(dir, entry);
      try {
        const stat = fs.statSync(file);
        if (stat.mtimeMs < startedAt - 2000) {
          continue;
        }
        if (!newest || stat.mtimeMs > newest.mtimeMs) {
          newest = { file, mtimeMs: stat.mtimeMs };
        }
      } catch {
        // ignore unreadable candidates
      }
    }
  }

  return newest?.file;
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
