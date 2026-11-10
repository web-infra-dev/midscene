import { rs } from '@rstest/core';
import type { Page } from 'playwright';
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
    addCookies: rs.fn(async () => undefined),
    clearCookies: rs.fn(async () => undefined),
  };
  let viewport = { width: 800, height: 600 };
  const page = {
    context: () => browserContext,
    goto: rs.fn(
      async (): Promise<{ status(): number }> => ({
        status: () => 200,
      }),
    ),
    url: rs.fn(() => 'https://example.com/final'),
    title: rs.fn(async () => 'Example'),
    setViewportSize: rs.fn(async (size: typeof viewport) => {
      viewport = size;
    }),
    viewportSize: rs.fn(() => viewport),
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
