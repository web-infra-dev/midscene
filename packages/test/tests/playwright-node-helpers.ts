import type { Page } from 'playwright';
import { vi } from 'vitest';
import type { CollectedCase } from '../src/parser/types';

export const collected = (
  steps: CollectedCase['definition']['steps'],
): CollectedCase => ({
  caseId: 'playwright-nodes',
  projectId: 'project',
  sourcePath: 'flows/playwright.yaml',
  caseIndex: 0,
  definition: { name: 'playwright nodes', steps },
});

export const step = (node: string, input: Record<string, unknown>) => ({
  node,
  input,
  meta: { continueOnError: false },
});

export const createPage = () => {
  const browserContext = {
    addCookies: vi.fn(async () => undefined),
    clearCookies: vi.fn(async () => undefined),
  };
  let viewport = { width: 800, height: 600 };
  const page = {
    context: () => browserContext,
    goto: vi.fn(
      async (): Promise<{ status(): number }> => ({
        status: () => 200,
      }),
    ),
    url: vi.fn(() => 'https://example.com/final'),
    title: vi.fn(async () => 'Example'),
    setViewportSize: vi.fn(async (size: typeof viewport) => {
      viewport = size;
    }),
    viewportSize: vi.fn(() => viewport),
  };
  return {
    browserContext,
    page: page as unknown as Page,
    pageMock: page,
  };
};

export const errorChainText = (error: unknown): string => {
  const messages: string[] = [];
  const seen = new Set<Error>();
  let current = error;
  while (current !== undefined) {
    if (!(current instanceof Error)) {
      messages.push(String(current));
      break;
    }
    if (seen.has(current)) break;
    seen.add(current);
    messages.push(`${current.name}: ${current.message}`);
    current = current.cause;
  }
  return messages.join('\n');
};
