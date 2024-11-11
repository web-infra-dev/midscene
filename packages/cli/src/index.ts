import assert from 'node:assert';
import { writeFileSync } from 'node:fs';
import type http from 'node:http';
import { join, resolve } from 'node:path';
import { PuppeteerAgent } from '@midscene/web/puppeteer';
import { createServer } from 'http-server';
import minimist from 'minimist';
import ora from 'ora-classic';
import puppeteer from 'puppeteer';
import { findOnlyItemInArgs, orderMattersParse } from './args';

let spinner: ora.Ora | undefined;
const stepString = (name: string, param?: any) => {
  let paramStr;
  if (typeof param === 'object') {
    paramStr = JSON.stringify(param, null, 2);
  } else if (name === 'sleep') {
    paramStr = `${param}ms`;
  } else {
    paramStr = param;
  }
  return `${name}\n  ${paramStr ? `${paramStr}` : ''}`;
};

const printStep = (name: string, param?: any) => {
  if (spinner) {
    spinner.stop();
  }
  console.log(`- ${stepString(name, param)}`);
};

const updateSpin = (text: string) => {
  if (!spinner) {
    spinner = ora(text);
    spinner.start();
  } else {
    spinner.text = text;
    spinner.start();
  }
};

const launchServer = async (
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

const preferenceArgs = {
  url: 'url',
  serve: 'serve',
  headed: 'headed',
  viewportWidth: 'viewport-width',
  viewportHeight: 'viewport-height',
  viewportScale: 'viewport-scale',
  useragent: 'user-agent',
  // preferCache: 'prefer-cache',
  // cookie: 'cookie',
};

const actionArgs = {
  action: 'action',
  assert: 'assert',
  queryOutput: 'query-output',
  query: 'query',
  sleep: 'sleep',
  waitFor: 'wait-for',
};

const defaultUA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';

const welcome = '\nWelcome to @midscene/cli\n';
console.log(welcome);

const args = minimist(process.argv);
if (findOnlyItemInArgs(args, 'version')) {
  const versionFromPkgJson = require('../package.json').version;
  console.log(`@midscene/cli version ${versionFromPkgJson}`);
  process.exit(0);
}

// check each arg is either in the preferenceArgs or actionArgs
Object.keys(args).forEach((arg) => {
  if (arg === '_') return;
  assert(
    Object.values(preferenceArgs).includes(arg) ||
      Object.values(actionArgs).includes(arg),
    `Unknown argument: ${arg}`,
  );
});

Promise.resolve(
  (async () => {
    // prepare the static server
    const staticServerConfig = findOnlyItemInArgs(args, 'serve');
    let staticServerUrl: string | undefined;
    if (staticServerConfig) {
      const serverDir =
        typeof staticServerConfig === 'string'
          ? staticServerConfig
          : process.cwd();
      const finalServerDir = resolve(process.cwd(), serverDir);

      const staticServerResult = await launchServer(finalServerDir);
      const server = staticServerResult.server;
      const serverAddress = server.address();
      staticServerUrl = `http://${serverAddress?.address}:${serverAddress?.port}`;
      printStep('static server', `${finalServerDir} @ ${staticServerUrl}`);
    }

    // prepare the viewport config
    const preferHeaded = findOnlyItemInArgs(args, preferenceArgs.headed);
    const userExpectWidth = findOnlyItemInArgs(
      args,
      preferenceArgs.viewportWidth,
    );
    const userExpectHeight = findOnlyItemInArgs(
      args,
      preferenceArgs.viewportHeight,
    );
    const userExpectDpr = findOnlyItemInArgs(
      args,
      preferenceArgs.viewportScale,
    );
    const defaultDpr = process.platform === 'darwin' ? 2 : 1;
    const viewportConfig = {
      width: typeof userExpectWidth === 'number' ? userExpectWidth : 1280,
      height: typeof userExpectHeight === 'number' ? userExpectHeight : 1280,
      deviceScaleFactor:
        typeof userExpectDpr === 'number' ? userExpectDpr : defaultDpr,
    };
    const url = findOnlyItemInArgs(args, preferenceArgs.url) as
      | string
      | undefined;
    let urlToVisit: string | undefined;
    if (staticServerUrl) {
      if (typeof url !== 'undefined') {
        if (url.startsWith('/')) {
          urlToVisit = `${staticServerUrl}${url}`;
        } else {
          urlToVisit = `${staticServerUrl}/${url}`;
        }
      }
    } else {
      urlToVisit = url;
    }
    assert(urlToVisit, 'URL is required');
    assert(typeof urlToVisit === 'string', 'URL must be a string');

    const preferredUA = findOnlyItemInArgs(args, preferenceArgs.useragent);
    const ua = typeof preferredUA === 'string' ? preferredUA : defaultUA;

    printStep(preferenceArgs.url, urlToVisit);
    printStep(preferenceArgs.useragent, ua);
    printStep('viewport', JSON.stringify(viewportConfig));
    if (preferHeaded) {
      printStep(preferenceArgs.headed, 'true');
    }

    // launch the browser
    updateSpin(stepString('launch', 'puppeteer'));
    const browser = await puppeteer.launch({
      headless: !preferHeaded,
    });

    const page = await browser.newPage();
    await page.setUserAgent(ua);
    await page.setViewport(viewportConfig);

    let errorWhenRunning: Error | undefined;
    let argName: string;
    let argValue: string | boolean | number | undefined;
    let agent: PuppeteerAgent | undefined;
    try {
      updateSpin(stepString('launch', urlToVisit));
      await page.goto(urlToVisit);
      updateSpin(stepString('waitForNetworkIdle', urlToVisit));
      await page.waitForNetworkIdle();
      printStep('launched', urlToVisit);

      agent = new PuppeteerAgent(page, {
        autoPrintReportMsg: false,
      });

      const orderedArgs = orderMattersParse(process.argv);

      let index = 0;
      let outputPath: string | undefined;
      let actionStarted = false;

      while (index <= orderedArgs.length - 1) {
        const arg = orderedArgs[index];
        argName = arg.name;
        argValue = arg.value;
        updateSpin(stepString(argName, String(argValue)));
        const validActionArg = Object.values(actionArgs).includes(argName);
        // once action started, you cannot use preferenceArgs
        if (actionStarted) {
          assert(
            validActionArg,
            `You cannot put --${argName} here. Please change the order of the arguments.`,
          );
        }
        if (validActionArg) {
          actionStarted = true;
        }
        switch (argName) {
          case actionArgs.action: {
            const param = arg.value;
            assert(param, 'missing action');
            assert(typeof param === 'string', 'action must be a string');
            await agent.aiAction(param);
            printStep(argName, String(argValue));
            break;
          }
          case actionArgs.assert: {
            const param = arg.value;
            assert(param, 'missing assert');
            assert(typeof param === 'string', 'assert must be a string');
            await agent.aiAssert(param);
            printStep(argName, String(argValue));
            break;
          }
          case actionArgs.queryOutput: {
            const param = arg.value;
            assert(param, 'missing query-output');
            assert(typeof param === 'string', 'query-output must be a string');
            outputPath = param;
            printStep(argName, String(argValue));
            break;
          }
          case actionArgs.query: {
            const param = arg.value;
            assert(param, 'missing query');
            assert(typeof param === 'string', 'query must be a string');
            const value = await agent.aiQuery(param);
            printStep(argName, String(argValue));
            printStep('answer', value);
            if (outputPath) {
              writeFileSync(
                outputPath,
                typeof value === 'object'
                  ? JSON.stringify(value, null, 2)
                  : value,
              );
            }
            break;
          }
          case actionArgs.sleep: {
            const param = arg.value;
            if (!param) break;
            assert(typeof param === 'number', 'sleep must be a number');
            await new Promise((resolve) => setTimeout(resolve, param));
            printStep(argName, String(argValue));
            break;
          }
          case actionArgs.waitFor: {
            const param = arg.value;
            assert(param, 'missing assertion for waitFor');
            assert(typeof param === 'string', 'assertion must be a string');
            await agent.aiWaitFor(param);
            printStep(argName, String(argValue));
            break;
          }
        }
        index += 1;
      }
      printStep('Done', `report: ${agent.reportFile}`);
    } catch (e: any) {
      printStep(`${argName!} - Failed`, String(argValue!));
      if (agent?.reportFile) {
        printStep('Report', agent.reportFile);
      }
      printStep('Error', e.message);
      errorWhenRunning = e;
    }

    await browser.close();
    process.exit(errorWhenRunning ? 1 : 0);
  })(),
);
