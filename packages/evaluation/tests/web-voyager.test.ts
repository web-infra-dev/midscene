import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PuppeteerAgent } from '@midscene/web/puppeteer';
import puppeteer from 'puppeteer';
import type { Browser } from 'puppeteer';
import { afterAll, beforeAll, describe, it } from 'vitest';
import 'dotenv/config'; // read environment variables from .env file
import { z } from '@midscene/core';
import { defineAction } from '@midscene/core/device';

// TypeScript interface definition for WebVoyager data items
interface WebVoyagerCase {
  web_name: string;
  id: string;
  ques: string;
  web: string;
}

// Variables for managing test state
let testCases: WebVoyagerCase[] = [];
let browser: Browser;
let currentCaseIndex = 0;

function loadNextCase(): WebVoyagerCase {
  if (currentCaseIndex >= testCases.length) {
    throw new Error('No more cases available');
  }

  const caseData = testCases[currentCaseIndex];
  currentCaseIndex++;
  return caseData;
}

// Load test cases synchronously at module level
const dataPath = path.join(__dirname, 'data', 'WebVoyager_data.jsonl');
const fileContent = fs.readFileSync(dataPath, 'utf-8');
const fileLines = fileContent.trim().split('\n');
testCases = fileLines.map((line) => JSON.parse(line) as WebVoyagerCase);

describe('WebVoyager Tests', () => {
  beforeAll(async () => {
    // Initialize browser
    browser = await puppeteer.launch({
      headless: true, // 'true' means we can't see the browser window
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    // Reset case index for test run
    currentCaseIndex = 0;
  });

  const caseToRun = testCases.slice(0, 1);

  // Generate test cases dynamically
  caseToRun.forEach((testCase, index) => {
    it(
      `WebVoyager case ${testCase.id} - ${testCase.web_name}`,
      { timeout: 0 },
      async () => {
        const page = await browser.newPage();

        try {
          await page.setViewport({
            width: 1280,
            height: 768,
            deviceScaleFactor: os.platform() === 'darwin' ? 2 : 1, // this is used to avoid flashing on UI Mode when doing screenshot on Mac
          });

          const data = loadNextCase();
          console.log('--------------------------------');
          console.log(data);
          console.log('--------------------------------');

          await page.goto(data?.web);
          await page.waitForNetworkIdle();

          // 👀 init Midscene agent
          const agent = new PuppeteerAgent(page, {
            replanningCycleLimit: 30,
            aiActionContext:
              'The user will give you a question to answer, you need to answer the question after manipulating the page and find the answer',
            customActions: [
              defineAction({
                name: 'printAnswer',
                description: 'use this to print the final answer you get',
                paramSchema: z.object({
                  answer: z.string(),
                }),
                call: async (param) => {
                  console.log('--------------------------------');
                  console.log(param.answer);
                },
              }),
            ],
          });

          // 👀 type keywords, perform a search
          await agent.aiAction(data.ques);

          await agent.destroy();
        } finally {
          await page.close();
        }
      },
    );
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });
});
