import { ScreenshotItem } from '@/screenshot-item';
import Service from '@/service';
import type { UIContext } from '@/types';
import type { IModelConfig, TIntent } from '@midscene/shared/env';
import { imageInfoOfBase64 } from '@midscene/shared/img';
import { callAI } from './service-caller';

const CONNECTIVITY_FIXTURE_IMAGE =
  'data:image/png;base64,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';

const TEXT_EXPECTED_TOKEN = 'CONNECTIVITY_OK';
const VISION_EXPECTED_TEXT = 'what needs to be done?';
const LOCATE_PROMPT = 'the main todo input box';

export interface ConnectivityCheckResultItem {
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
  checks: ConnectivityCheckResultItem[];
}

export interface ConnectivityTestConfig {
  defaultModelConfig: IModelConfig;
  planningModelConfig: IModelConfig;
  insightModelConfig: IModelConfig;
}

function normalizeText(text: string): string {
  return text
    .trim()
    .replace(/^['"`]+|['"`]+$/g, '')
    .toLowerCase();
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

async function buildFixtureContext(): Promise<UIContext> {
  const shotSize = await imageInfoOfBase64(CONNECTIVITY_FIXTURE_IMAGE);
  return {
    screenshot: ScreenshotItem.create(CONNECTIVITY_FIXTURE_IMAGE, Date.now()),
    shotSize,
    shrunkShotToLogicalRatio: 1,
  };
}

function buildCheckResult(
  name: ConnectivityCheckResultItem['name'],
  modelConfig: IModelConfig,
  result: Omit<
    ConnectivityCheckResultItem,
    'name' | 'intent' | 'modelName' | 'modelFamily'
  >,
): ConnectivityCheckResultItem {
  return {
    name,
    intent: modelConfig.intent,
    modelName: modelConfig.modelName,
    modelFamily: modelConfig.modelFamily,
    ...result,
  };
}

export async function runConnectivityTest(
  config: ConnectivityTestConfig,
): Promise<ConnectivityTestResult> {
  const checks: ConnectivityCheckResultItem[] = [];

  {
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
        config.planningModelConfig,
      );
      const content = result.content.trim();
      const passed = content.includes(TEXT_EXPECTED_TOKEN);
      checks.push(
        buildCheckResult('text', config.planningModelConfig, {
          passed,
          durationMs: Date.now() - startTime,
          message: passed ? '' : `Unexpected response: ${content}`,
        }),
      );
    } catch (error) {
      checks.push(
        buildCheckResult('text', config.planningModelConfig, {
          passed: false,
          durationMs: Date.now() - startTime,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  {
    const startTime = Date.now();
    try {
      const result = await callAI(
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
        config.insightModelConfig,
      );
      const normalized = normalizeText(result.content);
      checks.push(
        buildCheckResult('vision', config.insightModelConfig, {
          passed: true,
          durationMs: Date.now() - startTime,
          message: '',
        }),
      );
    } catch (error) {
      checks.push(
        buildCheckResult('vision', config.insightModelConfig, {
          passed: false,
          durationMs: Date.now() - startTime,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  {
    const startTime = Date.now();
    try {
      const context = await buildFixtureContext();
      const service = new Service(context);
      const locateResult = await service.locate(
        { prompt: LOCATE_PROMPT },
        {},
        config.defaultModelConfig,
      );
      const targetRect = locateResult.rect || locateResult.element?.rect;
      const center = locateResult.element?.center;
      const passed = hasValidRect(targetRect) && hasValidCenter(center);
      checks.push(
        buildCheckResult('aiLocate', config.defaultModelConfig, {
          passed,
          durationMs: Date.now() - startTime,
          message: passed
            ? ''
            : `Invalid locate result: ${JSON.stringify({
                rect: targetRect,
                center,
              })}`,
        }),
      );
    } catch (error) {
      checks.push(
        buildCheckResult('aiLocate', config.defaultModelConfig, {
          passed: false,
          durationMs: Date.now() - startTime,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  return {
    passed: checks.every((item) => item.passed),
    checks,
  };
}
