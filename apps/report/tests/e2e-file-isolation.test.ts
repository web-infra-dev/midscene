import { expect, it } from '@rstest/core';
import config from '../e2e/midscene.config';

it('gives concurrent Report files independent Agent slots without copying the browser', async () => {
  const project = config.projects![0];
  const browser = {};
  const projectContext = { browser, baseUrl: 'http://127.0.0.1:1234/' };
  const setup = project.fileSetup!.setup;
  const first = await setup({ projectContext } as Parameters<typeof setup>[0]);
  const second = await setup({ projectContext } as Parameters<typeof setup>[0]);
  expect(first).not.toBe(second);
  expect(first).not.toBe(projectContext);
  expect(first.browser).toBe(browser);
  expect(second.browser).toBe(browser);
  const agent = {} as NonNullable<typeof first.agent>;
  first.agent = agent;
  expect(second.agent).toBeUndefined();
  expect(projectContext).not.toHaveProperty('agent');
  second.agent = {} as NonNullable<typeof second.agent>;
  first.agent = undefined;
  expect(second.agent).toBeDefined();
  expect(config.test?.maxConcurrentFiles).toBe(4);
  expect(project.maxConcurrentFiles).toBe(4);
  expect(project.files?.include).toEqual(['e2e/*.yaml']);
});
