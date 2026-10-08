import { vi } from 'vitest';
import type { CollectedCase } from '../src/parser/types';

export const collected = (
  steps: CollectedCase['definition']['steps'],
): CollectedCase => ({
  caseId: 'puppeteer-nodes',
  projectId: 'project',
  sourcePath: 'flows/puppeteer.yaml',
  caseIndex: 0,
  definition: { name: 'puppeteer nodes', steps },
});

export const step = (node: string, input: Record<string, unknown>) => ({
  node,
  input,
  meta: { continueOnError: false },
});

export const createPage = () => {
  const browserContext = {
    cookies: vi.fn(async () => [
      { name: 'session', value: 'secret', domain: 'example.com', path: '/' },
    ]),
    deleteCookie: vi.fn(async () => undefined),
  };
  let viewport = { width: 800, height: 600 };
  const page = {
    browserContext: () => browserContext,
    setCookie: vi.fn(async () => undefined),
    goto: vi.fn(
      async (): Promise<{ status(): number }> => ({ status: () => 200 }),
    ),
    url: vi.fn(() => 'https://example.com/final'),
    title: vi.fn(async () => 'Example'),
    setViewport: vi.fn(async (size: typeof viewport) => {
      viewport = size;
    }),
    viewport: vi.fn(() => viewport),
  };
  return {
    browserContext,
    page,
    pageMock: page,
  };
};
