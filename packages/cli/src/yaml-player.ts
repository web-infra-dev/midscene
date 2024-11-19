import { createServer } from 'http-server';
import yaml from 'js-yaml';
import puppeteer from 'puppeteer';

import assert from 'node:assert';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { PuppeteerAgent } from '@midscene/web/puppeteer';
import chalk from 'chalk';
import type {
  MidsceneYamlFlowItem,
  MidsceneYamlFlowItemAIAction,
  MidsceneYamlFlowItemAIAssert,
  MidsceneYamlFlowItemAIQuery,
  MidsceneYamlFlowItemAIWaitFor,
  MidsceneYamlFlowItemSleep,
  MidsceneYamlScript,
} from './types';

export const defaultUA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';
export const defaultViewportWidth = 1280;
export const defaultViewportHeight = 960;
export const defaultViewportScale = process.platform === 'darwin' ? 2 : 1;

export function loadYamlScript(
  content: string,
  filePath?: string,
): MidsceneYamlScript {
  const obj = yaml.load(content) as MidsceneYamlScript;
  const pathTip = filePath ? `, failed to load ${filePath}` : '';
  assert(obj.target, `property "target" is required in yaml script${pathTip}`);
  assert(
    typeof obj.target === 'object',
    `property "target" must be an object${pathTip}`,
  );
  assert(
    typeof obj.target.url === 'string',
    `property "target.url" must be provided in yaml script: ${pathTip}`,
  );
  assert(obj.flow, `property "flow" is required in yaml script${pathTip}`);
  assert(Array.isArray(obj.flow), `property "flow" must be an array${pathTip}`);
  return obj;
}

export const launchServer = async (
  dir: string,
): Promise<ReturnType<typeof createServer>> => {
  // https://github.com/http-party/http-server/blob/master/bin/http-server
  return new Promise((resolve, reject) => {
    const server = createServer({
      root: dir,
    });
    server.listen(0, '127.0.0.1', () => {
      resolve(server);
    });
  });
};

interface MidsceneFileTask {
  file: string;
  player: ScriptPlayer;
}

const spinnerInterval = 80;
const spinnerFrames = ['◰', '◳', '◲', '◱']; // https://github.com/sindresorhus/cli-spinners/blob/main/spinners.json
const currentSpinningFrame = () => {
  return spinnerFrames[
    Math.floor(Date.now() / spinnerInterval) % spinnerFrames.length
  ];
};

const printAllTasks = (tasks: MidsceneFileTask[]) => {
  const indent = '  ';
  const currentSpinnerFrame = currentSpinningFrame();

  const prefixLines: string[] = [];
  let currentLine = '';
  const suffixText: string[] = [];
  for (const task of tasks) {
    const filePath = task.file;
    const fileName = basename(filePath);
    const fileDir = dirname(filePath);
    const fileNameToPrint = `${chalk.gray(`${fileDir}/`)}${fileName}`;

    if (task.player.status === 'init') {
      suffixText.push(`${chalk.gray('◌')} ${fileNameToPrint}`);
    } else if (task.player.status === 'running') {
      const actionTipText =
        task.player.currentStep === 0
          ? 'navigating'
          : `running action ${task.player.currentStep} / ${task.player.totalSteps}`;
      const actionIndicator = chalk.gray(`(${actionTipText})`);
      currentLine = `${currentSpinnerFrame} ${fileNameToPrint} ${actionIndicator}`;
    } else if (task.player.status === 'done') {
      prefixLines.push(
        `${chalk.green('✔︎')} ${fileNameToPrint}\n${indent}${chalk.gray(
          `report: ${task.player.reportFile}`,
        )}`,
      );
    } else if (task.player.status === 'error') {
      prefixLines.push(
        `${chalk.red('✘')} ${fileNameToPrint}\n${indent}${chalk.gray(
          'report:',
        )} ${task.player.reportFile || ''}`,
      );
      prefixLines.push(
        `${indent}${chalk.gray('error:')}\n${indent}${indent}${task.player.error?.message}`,
      );
    }
  }
  console.clear();
  console.log(
    `${prefixLines.join('\n')}\n${currentLine}\n${suffixText.join('\n')}`,
  );
};

export async function playYamlFiles(files: string[]): Promise<boolean> {
  const tasks: MidsceneFileTask[] = [];
  for (const file of files) {
    const script = loadYamlScript(readFileSync(file, 'utf-8'), file);
    const player = new ScriptPlayer(script);
    tasks.push({ file, player });
  }

  const interval = setInterval(() => {
    printAllTasks(tasks);
  }, spinnerInterval);

  for (const task of tasks) {
    await task.player.play();
  }
  clearInterval(interval);
  printAllTasks(tasks);

  const ifFail = tasks.some((task) => task.player.status === 'error');
  return !ifFail;
}

export type ScriptPlayerStatus = 'init' | 'running' | 'done' | 'error';
export class ScriptPlayer {
  public currentStep = 0;
  public totalSteps: number;
  public status: ScriptPlayerStatus = 'init';
  public reportFile?: string | null;
  public error?: Error;
  public result: Record<string, any>;
  private unnamedResultIndex = 0;

  constructor(
    private script: MidsceneYamlScript,
    private options?: {
      onStepChange?: (step: number, totalSteps: number) => void;
      onStatusChange?: (status: ScriptPlayerStatus) => void;
    },
  ) {
    this.totalSteps = script.flow.length;
    this.result = {};
    if (this.totalSteps === 0) {
      throw new Error('no steps to play');
    }
  }

  private setStatus(status: ScriptPlayerStatus, error?: Error) {
    this.status = status;
    this.error = error;
    this.options?.onStatusChange?.(status);
  }

  private setStep(stepIndex: number) {
    this.currentStep = stepIndex + 1;
    this.options?.onStepChange?.(stepIndex, this.totalSteps);
  }

  async play() {
    const { target, flow } = this.script;
    this.setStatus('running');

    // prepare the environment
    const ua = target.userAgent || defaultUA;
    let width = defaultViewportWidth;
    if (target.viewportWidth) {
      assert(
        typeof target.viewportWidth === 'number',
        'viewportWidth must be a number',
      );
      width = Number.parseInt(target.viewportWidth as unknown as string, 10);
      assert(
        width > 0,
        `viewportWidth must be greater than 0, but got ${width}`,
      );
    }
    let height = defaultViewportHeight;
    if (target.viewportHeight) {
      assert(
        typeof target.viewportHeight === 'number',
        'viewportHeight must be a number',
      );
      height = Number.parseInt(target.viewportHeight as unknown as string, 10);
      assert(
        height > 0,
        `viewportHeight must be greater than 0, but got ${height}`,
      );
    }
    let dpr = defaultViewportScale;
    if (target.viewportScale) {
      assert(
        typeof target.viewportScale === 'number',
        'viewportScale must be a number',
      );
      dpr = Number.parseInt(target.viewportScale as unknown as string, 10);
      assert(dpr > 0, `viewportScale must be greater than 0, but got ${dpr}`);
    }
    const viewportConfig = {
      width,
      height,
      deviceScaleFactor: dpr,
    };

    const freeFn: {
      name: string;
      fn: () => void;
    }[] = [];

    let localServer: Awaited<ReturnType<typeof launchServer>> | undefined;
    let urlToVisit: string | undefined;
    assert(typeof target.url === 'string', 'url is required');
    if (target.serve) {
      localServer = await launchServer(target.serve);
      const serverAddress = localServer.server.address();
      freeFn.push({
        name: 'local_server',
        fn: () => localServer?.server.close(),
      });
      if (target.url.startsWith('/')) {
        urlToVisit = `http://${serverAddress?.address}:${serverAddress?.port}${target.url}`;
      } else {
        urlToVisit = `http://${serverAddress?.address}:${serverAddress?.port}/${target.url}`;
      }
    } else {
      urlToVisit = target.url;
    }

    // launch the browser
    if (target.headed && process.platform === 'linux') {
      console.warn(
        'you are running headed mode on linux, this will usually fail.\nTo temporarily open headed mode, you can set `export MIDSCENE_HEADED=1`',
      );
    }
    const browser = await puppeteer.launch({
      headless: !(target.headed || process.env.MIDSCENE_HEADED === '1'),
    });
    freeFn.push({
      name: 'puppeteer_browser',
      fn: () => browser.close(),
    });

    const pages = await browser.pages();
    const page = pages[0];
    await page.setUserAgent(ua);
    await page.setViewport(viewportConfig);

    if (target.cookie) {
      const cookieFileContent = readFileSync(target.cookie, 'utf-8');
      await page.setCookie(...JSON.parse(cookieFileContent));
    }

    await page.goto(urlToVisit);
    const waitForNetworkIdleTimeout =
      typeof target.waitForNetworkIdle?.timeout === 'number'
        ? target.waitForNetworkIdle.timeout
        : 30 * 1000;
    try {
      if (waitForNetworkIdleTimeout > 0) {
        await page.waitForNetworkIdle({
          timeout: waitForNetworkIdleTimeout,
        });
      }
    } catch (e) {
      if (
        typeof target.waitForNetworkIdle?.continueOnNetworkIdleError ===
          'boolean' &&
        !target.waitForNetworkIdle?.continueOnNetworkIdleError
      ) {
        const newError = new Error(`failed to wait for network idle: ${e}`, {
          cause: e,
        });
        this.setStatus('error', newError);
        return;
      }
      const newMessage = `failed to wait for network idle after ${waitForNetworkIdleTimeout}ms, but the script will continue.`;
      console.warn(newMessage);
    }

    // play the scripts
    let currentTask: MidsceneYamlFlowItem | undefined;
    const agent = new PuppeteerAgent(page, {
      autoPrintReportMsg: false,
    });
    try {
      freeFn.push({
        name: 'midscene_puppeteer_agent',
        fn: () => agent.destroy(),
      });

      let stepIndex = 0;
      while (stepIndex < this.totalSteps) {
        const task = flow[stepIndex];
        currentTask = task;
        this.setStep(stepIndex);

        if (
          (task as MidsceneYamlFlowItemAIAction).aiAction ||
          (task as MidsceneYamlFlowItemAIAction).ai
        ) {
          const actionTask = task as MidsceneYamlFlowItemAIAction;
          const actionConfig = actionTask.aiAction || actionTask.ai;

          const prompt =
            typeof actionConfig === 'string'
              ? actionConfig
              : actionConfig!.prompt;
          assert(prompt, 'missing prompt for ai (aiAction)');
          await agent.aiAction(prompt);
        } else if ((task as MidsceneYamlFlowItemAIAssert).aiAssert) {
          const assertTask = task as MidsceneYamlFlowItemAIAssert;
          const prompt =
            typeof assertTask.aiAssert === 'string'
              ? assertTask.aiAssert
              : assertTask.aiAssert!.prompt;
          await agent.aiAssert(prompt);
        } else if ((task as MidsceneYamlFlowItemAIQuery).aiQuery) {
          const queryTask = task as MidsceneYamlFlowItemAIQuery;
          const prompt =
            typeof queryTask.aiQuery === 'string'
              ? queryTask.aiQuery
              : queryTask.aiQuery!.prompt;
          const queryResult = await agent.aiQuery(prompt);
          const resultKey =
            typeof queryTask.aiQuery === 'object' && queryTask.aiQuery.name
              ? queryTask.aiQuery.name
              : this.unnamedResultIndex++;
          this.result[resultKey] = queryResult;
        } else if ((task as MidsceneYamlFlowItemAIWaitFor).aiWaitFor) {
          const waitForTask = task as MidsceneYamlFlowItemAIWaitFor;
          const prompt =
            typeof waitForTask.aiWaitFor === 'string'
              ? waitForTask.aiWaitFor
              : waitForTask.aiWaitFor!.prompt;
          await agent.aiWaitFor(prompt);
        } else if ((task as MidsceneYamlFlowItemSleep).sleep) {
          const sleepTask = task as MidsceneYamlFlowItemSleep;
          const ms =
            typeof sleepTask.sleep === 'string'
              ? Number.parseInt(sleepTask.sleep, 10)
              : sleepTask.sleep!.ms;
          await new Promise((resolve) => setTimeout(resolve, ms));
        } else {
          throw new Error(`unknown task: ${JSON.stringify(task)}`);
        }
        stepIndex++;
      }
      this.reportFile = agent.reportFile;
      console.log('Done', `report: ${agent.reportFile}`);
    } catch (e: any) {
      freeFn.forEach((fn) => {
        try {
          fn.fn();
        } catch (e) {}
      });

      this.setStatus('error', e);
      this.reportFile = agent.reportFile;
      return;
    }

    if (target.output) {
      writeFileSync(target.output, JSON.stringify(this.result, undefined, 2));
    }

    let err: Error | undefined;
    freeFn.forEach((fn) => {
      try {
        fn.fn();
      } catch (e) {
        console.error(`failed to free ${fn.name}:`, e);
        err = new Error(`failed to free ${fn.name}`, { cause: e });
      }
    });
    if (err) {
      this.setStatus('error', err);
      return;
    }

    this.setStatus('done');
  }
}
