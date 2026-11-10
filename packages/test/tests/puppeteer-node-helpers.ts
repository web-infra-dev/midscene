import { rs } from '@rstest/core';
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
    cookies: rs.fn(async () => [
      { name: 'session', value: 'secret', domain: 'example.com', path: '/' },
    ]),
    deleteCookie: rs.fn(async () => undefined),
  };
  let viewport = { width: 800, height: 600 };
  const page = {
    browserContext: () => browserContext,
    setCookie: rs.fn(async () => undefined),
    goto: rs.fn(
      async (): Promise<{ status(): number }> => ({ status: () => 200 }),
    ),
    url: rs.fn(() => 'https://example.com/final'),
    title: rs.fn(async () => 'Example'),
    setViewport: rs.fn(async (size: typeof viewport) => {
      viewport = size;
    }),
    viewport: rs.fn(() => viewport),
  };
  return {
    browserContext,
    page,
    pageMock: page,
  };
};
