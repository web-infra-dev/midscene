import { createServer } from 'http-server';
import yaml from 'js-yaml';
import puppeteer from 'puppeteer';
import type { Browser, Page } from 'puppeteer';

import assert from 'node:assert';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { PuppeteerAgent } from '@midscene/web/puppeteer';
import {
  contextInfo,
  contextTaskListSummary,
  isTTY,
  singleTaskInfo,
  spinnerInterval,
} from './printer';
import { TTYWindowRenderer } from './tty-renderer';
import type {
  MidsceneYamlFileContext,
  MidsceneYamlFlowItemAIAction,
  MidsceneYamlFlowItemAIAssert,
  MidsceneYamlFlowItemAIQuery,
  MidsceneYamlFlowItemAIWaitFor,
  MidsceneYamlFlowItemSleep,
  MidsceneYamlScript,
  ScriptPlayerOptions,
  ScriptPlayerStatusValue,
  ScriptPlayerTaskStatus,
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
  assert(obj.tasks, `property "tasks" is required in yaml script${pathTip}`);
  assert(
    Array.isArray(obj.tasks),
    `property "tasks" must be an array${pathTip}`,
  );
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

let ttyRenderer: TTYWindowRenderer | undefined;
export async function playYamlFiles(
  files: string[],
  options?: ScriptPlayerOptions,
): Promise<boolean> {
  // prepare
  const fileContextList: MidsceneYamlFileContext[] = [];
  for (const file of files) {
    const script = loadYamlScript(readFileSync(file, 'utf-8'), file);
    const fileName = basename(file, extname(file));
    const player = new ScriptPlayer(script, {
      ...options,
      testId: fileName,
      onTaskStatusChange: (taskStatus) => {
        if (!isTTY) {
          const { nameText } = singleTaskInfo(taskStatus);
          // console.log(`${taskStatus.status} - ${nameText}`);
        }
      },
    });
    fileContextList.push({ file, player });
  }

  // play
  if (isTTY) {
    const summaryContents = () => {
      const summary: string[] = [''];
      for (const context of fileContextList) {
        summary.push(
          contextTaskListSummary(context.player.taskStatus, context),
        );
      }
      summary.push('');
      return summary;
    };
    ttyRenderer = new TTYWindowRenderer({
      outputStream: process.stdout,
      errorStream: process.stderr,
      getWindow: summaryContents,
      interval: spinnerInterval,
    });

    ttyRenderer.start();
    for (const context of fileContextList) {
      await context.player.play();
    }
    ttyRenderer.stop();
  } else {
    for (const context of fileContextList) {
      const { mergedText } = contextInfo(context);
      console.log(mergedText);
      await context.player.play();
      console.log(contextTaskListSummary(context.player.taskStatus, context));
    }
  }

  const ifFail = fileContextList.some((task) => task.player.status === 'error');
  return !ifFail;
}

export class ScriptPlayer {
  public currentTaskIndex?: number;
  public taskStatus: ScriptPlayerTaskStatus[] = [];
  public status: ScriptPlayerStatusValue = 'init';
  public reportFile?: string | null;
  public result: Record<string, any>;
  private unnamedResultIndex = 0;
  public output?: string | null;
  public errorInSetup?: Error;
  constructor(
    private script: MidsceneYamlScript,
    private options?: ScriptPlayerOptions,
  ) {
    this.result = {};
    this.output = script.target.output;
    this.taskStatus = (script.tasks || []).map((task, taskIndex) => ({
      ...task,
      index: taskIndex,
      status: 'init',
      totalSteps: task.flow?.length || 0,
    }));
  }

  private setPlayerStatus(status: ScriptPlayerStatusValue, error?: Error) {
    this.status = status;
    this.errorInSetup = error;
  }

  private setTaskStatus(
    index: number,
    statusValue: ScriptPlayerStatusValue,
    error?: Error,
  ) {
    this.taskStatus[index].status = statusValue;
    if (error) {
      this.taskStatus[index].error = error;
    }

    if (this.options?.onTaskStatusChange) {
      this.options.onTaskStatusChange(this.taskStatus[index]);
    }
  }

  private setTaskIndex(taskIndex: number) {
    this.currentTaskIndex = taskIndex;
  }

  private flushResult() {
    if (Object.keys(this.result).length && this.output) {
      const output = join(process.cwd(), this.output);
      // ensure the output directory exists
      const outputDir = dirname(output);
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }
      writeFileSync(output, JSON.stringify(this.result, undefined, 2));
    }
  }

  async playTask(
    taskStatus: ScriptPlayerTaskStatus,
    {
      agent,
      browser,
      page,
    }: {
      agent: PuppeteerAgent;
      browser: Browser;
      page: Page;
    },
  ) {
    const { flow } = taskStatus;
    assert(flow, 'missing flow in task');

    for (const flowItemIndex in flow) {
      taskStatus.currentStep = Number.parseInt(flowItemIndex, 10);
      const flowItem = flow[flowItemIndex];
      if (
        (flowItem as MidsceneYamlFlowItemAIAction).aiAction ||
        (flowItem as MidsceneYamlFlowItemAIAction).ai
      ) {
        const actionTask = flowItem as MidsceneYamlFlowItemAIAction;
        const prompt = actionTask.aiAction || actionTask.ai;
        assert(prompt, 'missing prompt for ai (aiAction)');
        assert(
          typeof prompt === 'string',
          'prompt for aiAction must be a string',
        );
        await agent.aiAction(prompt);
      } else if ((flowItem as MidsceneYamlFlowItemAIAssert).aiAssert) {
        const assertTask = flowItem as MidsceneYamlFlowItemAIAssert;
        const prompt = assertTask.aiAssert;
        assert(prompt, 'missing prompt for aiAssert');
        assert(
          typeof prompt === 'string',
          'prompt for aiAssert must be a string',
        );
        await agent.aiAssert(prompt);
      } else if ((flowItem as MidsceneYamlFlowItemAIQuery).aiQuery) {
        const queryTask = flowItem as MidsceneYamlFlowItemAIQuery;
        const prompt = queryTask.aiQuery;
        assert(prompt, 'missing prompt for aiQuery');
        assert(
          typeof prompt === 'string',
          'prompt for aiQuery must be a string',
        );
        const queryResult = await agent.aiQuery(prompt);
        const resultKey = queryTask.name || this.unnamedResultIndex++;
        if (this.result[resultKey]) {
          console.warn(
            `result key ${resultKey} already exists, will overwrite`,
          );
        }

        this.result[resultKey] = queryResult;
        this.flushResult();
      } else if ((flowItem as MidsceneYamlFlowItemAIWaitFor).aiWaitFor) {
        const waitForTask = flowItem as MidsceneYamlFlowItemAIWaitFor;
        const prompt = waitForTask.aiWaitFor;
        assert(prompt, 'missing prompt for aiWaitFor');
        assert(
          typeof prompt === 'string',
          'prompt for aiWaitFor must be a string',
        );
        const timeout = waitForTask.timeout;
        await agent.aiWaitFor(prompt, { timeoutMs: timeout });
      } else if ((flowItem as MidsceneYamlFlowItemSleep).sleep) {
        const sleepTask = flowItem as MidsceneYamlFlowItemSleep;
        const ms = sleepTask.sleep;
        assert(
          ms && ms > 0,
          `ms for sleep must be greater than 0, but got ${ms}`,
        );
        await new Promise((resolve) => setTimeout(resolve, ms));
      } else {
        throw new Error(`unknown flowItem: ${JSON.stringify(flowItem)}`);
      }
    }
    this.reportFile = agent.reportFile;
  }

  async play() {
    const { target, tasks } = this.script;
    this.setPlayerStatus('running');

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

    const headed = this.options?.headed || this.options?.keepWindow;
    // launch the browser
    if (headed && process.env.CI === '1') {
      console.warn(
        'you are probably running headed mode in CI, this will usually fail.',
      );
    }
    const browser = await puppeteer.launch({
      headless: !headed,
    });
    freeFn.push({
      name: 'puppeteer_browser',
      fn: () => {
        if (!this.options?.keepWindow) {
          browser.close();
        }
      },
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
        this.setPlayerStatus('error', newError);
        return;
      }
      const newMessage = `failed to wait for network idle after ${waitForNetworkIdleTimeout}ms, but the script will continue.`;
      console.warn(newMessage);
    }

    // prepare Midscene agent
    const agent = new PuppeteerAgent(page, {
      autoPrintReportMsg: false,
      testId: this.options?.testId,
    });

    freeFn.push({
      name: 'midscene_puppeteer_agent',
      fn: () => agent.destroy(),
    });

    let taskIndex = 0;
    this.setPlayerStatus('running');
    let errorFlag = false;
    while (taskIndex < tasks.length) {
      const task = tasks[taskIndex];
      this.setTaskStatus(taskIndex, 'running' as any);
      // const taskStatus = this.taskStatus[taskIndex];

      try {
        this.setTaskIndex(taskIndex);
        await this.playTask(this.taskStatus[taskIndex], {
          agent,
          browser,
          page,
        });
      } catch (e) {
        this.setTaskStatus(taskIndex, 'error' as any, e as Error);
        this.setPlayerStatus('error');
        errorFlag = true;

        this.reportFile = agent.reportFile;
        taskIndex++;
        continue;
      }
      this.reportFile = agent.reportFile;
      this.setTaskStatus(taskIndex, 'done' as any);
      taskIndex++;
    }

    if (!errorFlag) {
      this.setPlayerStatus('done');
    }

    // free the resources
    freeFn.forEach((fn) => {
      try {
        fn.fn();
      } catch (e) {}
    });
  }
}
