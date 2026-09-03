import { PuppeteerAgent } from '@/puppeteer';
import { afterAll, afterEach, beforeAll, describe, it, rs } from '@rstest/core';
import puppeteer, { type Browser, type Frame, type Page } from 'puppeteer';
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

rs.setConfig({ testTimeout: 180_000 });

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
  const context = contextForTarget(page, target);
  const element = await context.$(target.selector);
  if (!element) throw new Error(`Missing element: ${target.selector}`);
  const box = await element.boundingBox();
  if (!box) throw new Error(`Missing bounding box: ${target.selector}`);
  return {
    locatedPixelBbox: [box.x, box.y, box.x + box.width, box.y + box.height],
    prompt: description,
  };
}

function createHarness(
  page: Page,
  agent: PuppeteerAgent,
): InputScenarioHarness {
  return {
    aiAssert: async (prompt) => {
      await agent.aiAssert(prompt);
    },
    blur: async () => {
      await page.click('h1');
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
      contextForTarget(page, target).$eval(target.selector, readEditableValue),
    setCaret: async (target, offset) => {
      await contextForTarget(page, target).$eval(
        target.selector,
        setEditableCaret,
        offset,
      );
    },
  };
}

describe('comprehensive input actions in Puppeteer', () => {
  let agent: PuppeteerAgent | undefined;
  let browser: Browser;
  let page: Page | undefined;
  let servers: InputTestServers;

  beforeAll(async () => {
    servers = await startInputTestServers();
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  });

  afterEach(async () => {
    await agent?.destroy();
    agent = undefined;
    await page?.close();
    page = undefined;
  });

  afterAll(async () => {
    await browser?.close();
    await servers?.close();
  });

  for (const scenario of inputE2EScenarios) {
    it(scenario.name, async () => {
      page = await browser.newPage();
      await page.goto(scenario.url(servers), { waitUntil: 'networkidle0' });
      agent = new PuppeteerAgent(page);
      await scenario.run(createHarness(page, agent));
    });
  }
});
