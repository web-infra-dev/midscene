import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IModelConfig } from '@midscene/shared/env';
import ts from 'typescript';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  callAI: vi.fn(),
  callAIWithObjectResponse: vi.fn(),
  AiExtractElementInfo: vi.fn(),
  AiLocateElement: vi.fn(),
  AiLocateSection: vi.fn(),
  buildSearchAreaConfig: vi.fn(),
}));

vi.mock('@/ai-model/service-caller', () => ({
  AIResponseParseError: class AIResponseParseError extends Error {},
  callAI: mocks.callAI,
  callAIWithObjectResponse: mocks.callAIWithObjectResponse,
}));

vi.mock('@/ai-model/service-caller/index', () => ({
  AIResponseParseError: class AIResponseParseError extends Error {},
  callAI: mocks.callAI,
  callAIWithObjectResponse: mocks.callAIWithObjectResponse,
}));

vi.mock('@/ai-model/inspect', () => ({
  AiExtractElementInfo: mocks.AiExtractElementInfo,
  AiLocateElement: mocks.AiLocateElement,
  AiLocateSection: mocks.AiLocateSection,
  buildSearchAreaConfig: mocks.buildSearchAreaConfig,
}));

vi.mock('@midscene/shared/img', async () => {
  const actual = await vi.importActual<typeof import('@midscene/shared/img')>(
    '@midscene/shared/img',
  );
  return {
    ...actual,
    imageInfoOfBase64: vi.fn().mockResolvedValue({ width: 800, height: 450 }),
  };
});

import { runConnectivityTest } from '@/ai-model/connectivity';

function readImports(filePath: string): string[] {
  const source = readFileSync(filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const imports: string[] = [];

  sourceFile.forEachChild((node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      imports.push(node.moduleSpecifier.text);
    }
  });

  return imports;
}

describe('runConnectivityTest service load order', () => {
  const defaultModelConfig: IModelConfig = {
    modelName: 'test-model',
    modelDescription: 'test-model-desc',
    modelFamily: 'qwen2.5-vl',
    intent: 'default',
    slot: 'default',
  };
  const planningModelConfig: IModelConfig = {
    modelName: 'test-planning-model',
    modelDescription: 'test-planning-model-desc',
    modelFamily: 'qwen2.5-vl',
    intent: 'planning',
    slot: 'planning',
  };
  const insightModelConfig: IModelConfig = {
    modelName: 'test-insight-model',
    modelDescription: 'test-insight-model-desc',
    modelFamily: 'gpt-5',
    intent: 'insight',
    slot: 'insight',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs the default locate check through the real Service constructor', async () => {
    mocks.callAI
      .mockResolvedValueOnce({ content: 'CONNECTIVITY_OK' })
      .mockResolvedValueOnce({ content: 'What needs to be done?' });
    mocks.AiLocateElement.mockResolvedValue({
      parseResult: {
        element: {
          center: [300, 120],
          rect: { left: 120, top: 90, width: 360, height: 60 },
          description: 'main todo input box',
          xpaths: [],
          attributes: {},
        },
        errors: [],
      },
      rect: { left: 120, top: 90, width: 360, height: 60 },
      rawResponse: '{}',
      usage: undefined,
      reasoning_content: undefined,
    });

    const result = await runConnectivityTest({
      defaultModelConfig,
      planningModelConfig,
      insightModelConfig,
    });

    expect(result.passed).toBe(true);
    expect(result.checks.map((item) => item.intent)).toEqual([
      'planning',
      'insight',
      'default',
    ]);
    expect(mocks.AiLocateElement).toHaveBeenCalledWith(
      expect.objectContaining({
        targetElementDescription: 'the main todo input box',
        modelRuntime: expect.objectContaining({
          config: defaultModelConfig,
        }),
      }),
    );
  });

  it('keeps service independent from the ai-model barrel', () => {
    const serviceImports = readImports(
      join(__dirname, '../../src/service/index.ts'),
    );

    expect(serviceImports).not.toContain('@/ai-model');
    expect(serviceImports).not.toContain('@/ai-model/index');
  });
});
