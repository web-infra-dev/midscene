import * as actual from '@midscene/web/puppeteer' with {
  rstest: 'importActual',
};
import { expect, it, rs } from '@rstest/core';
import config from '../midscene.config';

rs.mock('@midscene/web/puppeteer', () => {
  return {
    ...actual,
    PuppeteerAgent: class {
      static getTestRunnerNodeDefinitions =
        actual.PuppeteerAgent.getTestRunnerNodeDefinitions;
      destroy = rs.fn();
    },
  };
});

it('isolates concurrent Report files and cleans up only the completed file', async () => {
  const project = config.projects![0];
  const contexts = [0, 1].map(() => ({
    newPage: rs.fn().mockResolvedValue({}),
    close: rs.fn(),
  }));
  const browser = {
    createBrowserContext: rs
      .fn()
      .mockResolvedValueOnce(contexts[0])
      .mockResolvedValueOnce(contexts[1]),
  };
  const projectContext = { browser, baseUrl: 'http://127.0.0.1:1234/' };
  const setup = project.fileSetup!.setup;
  const cleanups: Array<Array<() => unknown>> = [[], []];
  const [first, second] = await Promise.all(
    cleanups.map((callbacks) =>
      setup({
        projectContext,
        signal: new AbortController().signal,
        onTeardown: (callback: () => unknown) => callbacks.push(callback),
      } as unknown as Parameters<typeof setup>[0]),
    ),
  );
  expect(browser.createBrowserContext).toHaveBeenCalledTimes(2);
  expect(first.page).not.toBe(second.page);
  expect(first.agent).not.toBe(second.agent);
  expect(projectContext).not.toHaveProperty('agent');
  for (const callback of cleanups[0].reverse()) await callback();
  expect(first.agent.destroy).toHaveBeenCalledTimes(1);
  expect(contexts[0].close).toHaveBeenCalledTimes(1);
  expect(second.agent.destroy).not.toHaveBeenCalled();
  expect(contexts[1].close).not.toHaveBeenCalled();
  for (const callback of cleanups[1].reverse()) await callback();
  expect(second.agent.destroy).toHaveBeenCalledTimes(1);
  expect(contexts[1].close).toHaveBeenCalledTimes(1);
  expect(config.test?.maxConcurrentFiles).toBe(3);
  expect(project.files?.include).toEqual(['e2e/*.yaml']);
});
