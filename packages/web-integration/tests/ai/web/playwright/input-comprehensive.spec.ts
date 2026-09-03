import type { Agent } from '@midscene/core/agent';
import type { Frame, Page } from '@playwright/test';
import type { InputTestServers } from '../input-e2e-page';
import { startInputTestServers } from '../input-e2e-page';
import {
  type FrameMode,
  type InputAction,
  type InputScenarioHarness,
  type InputTarget,
  inputE2EScenarios,
  readControlledStateFromWindow,
  readEditableValue,
  readInputStateFromWindow,
  setEditableCaret,
} from '../input-e2e-scenarios';
import { test } from './fixture';

type DirectLocate = {
  locatedPixelBbox: [number, number, number, number];
  prompt: string;
};

function findFrame(page: Page, mode: FrameMode): Frame {
  const frame = page
    .frames()
    .find((candidate) => candidate.url().endsWith('/frame'));
  if (!frame) throw new Error(`Missing ${mode} iframe`);
  return frame;
}

function contextForTarget(page: Page, target: InputTarget): Page | Frame {
  return target.frame ? findFrame(page, target.frame) : page;
}

async function locateTarget(
  page: Page,
  target: InputTarget,
  description: string,
): Promise<DirectLocate> {
  const box = await contextForTarget(page, target)
    .locator(target.selector)
    .boundingBox();
  if (!box) throw new Error(`Missing bounding box: ${target.selector}`);
  return {
    locatedPixelBbox: [box.x, box.y, box.x + box.width, box.y + box.height],
    prompt: description,
  };
}

function createHarness(
  page: Page,
  agent: Agent,
  aiAssert: (prompt: string) => Promise<unknown>,
): InputScenarioHarness {
  return {
    aiAssert: async (prompt) => {
      await aiAssert(prompt);
    },
    blur: async () => {
      await page.locator('h1').click();
    },
    input: async (
      target: InputTarget,
      description: string,
      action: InputAction,
    ) => {
      await agent.callActionInActionSpace('Input', {
        ...action,
        locate: await locateTarget(page, target, description),
      });
    },
    isFrameSameOrigin: async (mode) => {
      const frame = findFrame(page, mode);
      return new URL(frame.url()).origin === new URL(page.url()).origin;
    },
    publicInput: async (prompt, value) => {
      await agent.aiInput(prompt, { value });
    },
    readControlledState: () => page.evaluate(readControlledStateFromWindow),
    readInputState: (frame) =>
      (frame ? findFrame(page, frame) : page).evaluate(
        readInputStateFromWindow,
      ),
    readValue: (target) =>
      contextForTarget(page, target)
        .locator(target.selector)
        .evaluate(readEditableValue),
    setCaret: async (target, offset) => {
      await contextForTarget(page, target)
        .locator(target.selector)
        .evaluate(setEditableCaret, offset);
    },
  };
}

test.describe('comprehensive input actions in Playwright', () => {
  let servers: InputTestServers;

  test.beforeAll(async () => {
    servers = await startInputTestServers();
  });

  test.afterAll(async () => {
    await servers?.close();
  });

  for (const scenario of inputE2EScenarios) {
    test(scenario.name, async ({ agentForPage, aiAssert, page }) => {
      await page.goto(scenario.url(servers));
      const agent = await agentForPage(page);
      await scenario.run(createHarness(page, agent, aiAssert));
    });
  }
});
