import { ScreenshotItem } from '@/screenshot-item';
import Service from '@/service';
import type { UIContext } from '@/types';
import type { IModelConfig, TIntent } from '@midscene/shared/env';
import { getModelRuntime } from '../models';
import type { ModelRuntime } from '../models';
import { callAI } from '../service-caller';
import {
  CONNECTIVITY_FIXTURE_IMAGE,
  CONNECTIVITY_FIXTURE_SHOT_SIZE,
} from './fixture';

const TEXT_EXPECTED_TOKEN = 'CONNECTIVITY_OK';

interface ConnectivityCheckResultItem {
  name: 'text' | 'vision' | 'aiLocate';
  intent: TIntent;
  modelName: string;
  modelFamily?: string;
  passed: boolean;
  durationMs: number;
  message: string;
}

export interface ConnectivityTestResult {
  passed: boolean;
  message?: string;
}

export interface ConnectivityTestConfig {
  defaultModelConfig: IModelConfig;
  planningModelConfig: IModelConfig;
  insightModelConfig: IModelConfig;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasValidRect(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const rect = value as {
    left?: unknown;
    top?: unknown;
    width?: unknown;
    height?: unknown;
  };

  return (
    isFiniteNumber(rect.left) &&
    isFiniteNumber(rect.top) &&
    isFiniteNumber(rect.width) &&
    isFiniteNumber(rect.height)
  );
}

function hasValidCenter(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    isFiniteNumber(value[0]) &&
    isFiniteNumber(value[1])
  );
}

function buildFixtureContext(): UIContext {
  return {
    screenshot: ScreenshotItem.create(CONNECTIVITY_FIXTURE_IMAGE, Date.now()),
    shotSize: CONNECTIVITY_FIXTURE_SHOT_SIZE,
    shrunkShotToLogicalRatio: 1,
  };
}

function buildCheckResult(
  name: ConnectivityCheckResultItem['name'],
  modelRuntime: ModelRuntime,
  result: Omit<
    ConnectivityCheckResultItem,
    'name' | 'intent' | 'modelName' | 'modelFamily'
  >,
): ConnectivityCheckResultItem {
  const { config } = modelRuntime;
  return {
    name,
    intent: config.intent,
    modelName: config.modelName,
    modelFamily: config.modelFamily,
    ...result,
  };
}

function buildConnectivityModelRuntime(
  modelConfig: IModelConfig,
): ModelRuntime {
  return getModelRuntime({
    ...modelConfig,
    retryCount: 0,
  });
}

function formatConnectivityCheckName(
  check: ConnectivityCheckResultItem,
): string {
  const checkName =
    check.name === 'aiLocate'
      ? 'AI locate check'
      : `${check.name[0]?.toUpperCase()}${check.name.slice(1)} check`;
  const modelLabel = check.modelName || check.intent;
  return `${checkName} - ${modelLabel} (${check.intent})`;
}

function buildConnectivityFailureMessage(
  checks: ConnectivityCheckResultItem[],
): string {
  const failedChecks = checks.filter((item) => !item.passed);
  if (failedChecks.length === 0) {
    return 'Connectivity test failed, but no failed check details were generated.';
  }

  return failedChecks
    .map((item) => {
      const detail = item.message || 'Failed without details.';
      return `[${formatConnectivityCheckName(item)}]: ${detail}`;
    })
    .join('\n');
}

async function runTextConnectivityCheck(
  modelRuntime: ModelRuntime,
): Promise<ConnectivityCheckResultItem> {
  const startTime = Date.now();
  try {
    const result = await callAI(
      [
        {
          role: 'system',
          content: 'Reply with the exact token the user asks for.',
        },
        {
          role: 'user',
          content: `Return exactly ${TEXT_EXPECTED_TOKEN}`,
        },
      ],
      modelRuntime,
    );
    const content = result.content.trim();
    const passed = content.includes(TEXT_EXPECTED_TOKEN);
    return buildCheckResult('text', modelRuntime, {
      passed,
      durationMs: Date.now() - startTime,
      message: passed ? '' : `Unexpected response: ${content}`,
    });
  } catch (error) {
    return buildCheckResult('text', modelRuntime, {
      passed: false,
      durationMs: Date.now() - startTime,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function runVisionConnectivityCheck(
  modelRuntime: ModelRuntime,
): Promise<ConnectivityCheckResultItem> {
  const startTime = Date.now();
  try {
    await callAI(
      [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'What is the main content of this image ? It is a photo or a form ?',
            },
            {
              type: 'image_url',
              image_url: {
                url: CONNECTIVITY_FIXTURE_IMAGE,
                detail: 'high',
              },
            },
          ],
        },
      ],
      modelRuntime,
    );
    return buildCheckResult('vision', modelRuntime, {
      passed: true,
      durationMs: Date.now() - startTime,
      message: '',
    });
  } catch (error) {
    return buildCheckResult('vision', modelRuntime, {
      passed: false,
      durationMs: Date.now() - startTime,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function runAiLocateConnectivityCheck(
  modelRuntime: ModelRuntime,
): Promise<ConnectivityCheckResultItem> {
  const startTime = Date.now();
  try {
    const context = buildFixtureContext();
    const service = new Service(context);
    const locateResult = await service.locate(
      { prompt: 'the main todo input box' },
      {},
      modelRuntime,
    );
    const targetRect = locateResult.rect || locateResult.element?.rect;
    const center = locateResult.element?.center;
    const passed = hasValidRect(targetRect) && hasValidCenter(center);
    return buildCheckResult('aiLocate', modelRuntime, {
      passed,
      durationMs: Date.now() - startTime,
      message: passed
        ? ''
        : `Invalid locate result: ${JSON.stringify({
            rect: targetRect,
            center,
          })}`,
    });
  } catch (error) {
    return buildCheckResult('aiLocate', modelRuntime, {
      passed: false,
      durationMs: Date.now() - startTime,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function runConnectivityTest(
  config: ConnectivityTestConfig,
): Promise<ConnectivityTestResult> {
  const planningModelRuntime = buildConnectivityModelRuntime(
    config.planningModelConfig,
  );
  const insightModelRuntime = buildConnectivityModelRuntime(
    config.insightModelConfig,
  );
  const defaultModelRuntime = buildConnectivityModelRuntime(
    config.defaultModelConfig,
  );
  const checks = await Promise.all([
    runTextConnectivityCheck(planningModelRuntime),
    runVisionConnectivityCheck(insightModelRuntime),
    runAiLocateConnectivityCheck(defaultModelRuntime),
  ]);

  const passed = checks.every((item) => item.passed);
  return {
    passed,
    message: passed ? undefined : buildConnectivityFailureMessage(checks),
  };
}
