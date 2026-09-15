import type {
  MidsceneYamlConfig,
  MidsceneYamlScript,
  MidsceneYamlScriptAgentOpt,
  MidsceneYamlScriptAndroidEnv,
  MidsceneYamlScriptComputerEnv,
  MidsceneYamlScriptEnvGeneralInterface,
  MidsceneYamlScriptHarmonyEnv,
  MidsceneYamlScriptIOSEnv,
  MidsceneYamlScriptWebEnv,
  MidsceneYamlTargetConfig,
} from '@midscene/core';
import { describe, expect, it } from 'vitest';
import {
  adaptLegacyExecutionPlan,
  adaptLegacyWorkflow,
} from '../src/cli/legacy-adapter';
import {
  type LegacyTestRunPlan,
  defaultLegacyConfig,
} from '../src/runtime/legacy-config';

type ExactKeys<T, Keys extends PropertyKey> = Exclude<
  keyof T,
  Keys
> extends never
  ? Exclude<Keys, keyof T> extends never
    ? true
    : never
  : never;

const scriptFields = [
  'target',
  'page',
  'browser',
  'web',
  'android',
  'ios',
  'harmony',
  'computer',
  'interface',
  'config',
  'agent',
  'tasks',
] as const;
const batchFields = [
  'target',
  'page',
  'browser',
  'web',
  'android',
  'ios',
  'harmony',
  'computer',
  'interface',
  'concurrent',
  'continueOnError',
  'retry',
  'summary',
  'shareBrowserContext',
  'setup',
  'files',
  'headed',
  'keepWindow',
  'dotenvOverride',
  'dotenvDebug',
] as const;
const agentFields = [
  'testId',
  'groupName',
  'groupDescription',
  'generateReport',
  'outputFormat',
  'persistExecutionDump',
  'autoPrintReportMsg',
  'reportFileName',
  'replanningCycleLimit',
  'aiContexts',
  'aiActContext',
  'aiActionContext',
  'cache',
  'screenshotShrinkFactor',
] as const;
const platformFields = {
  web: [
    'acceptInsecureCerts',
    'aiActContext',
    'aiActionContext',
    'aiContexts',
    'autoFollowNewPage',
    'autoPrintReportMsg',
    'bridgeMode',
    'cache',
    'cdpEndpoint',
    'chromeArgs',
    'closeNewTabsAfterDisconnect',
    'cookie',
    'deviceScaleFactor',
    'downloadPath',
    'extraHTTPHeaders',
    'forceSameTabNavigation',
    'generateReport',
    'groupDescription',
    'groupName',
    'mode',
    'output',
    'outputFormat',
    'persistExecutionDump',
    'replanningCycleLimit',
    'reportFileName',
    'screenshotShrinkFactor',
    'serve',
    'testId',
    'unstableLogContent',
    'url',
    'userAgent',
    'viewportHeight',
    'viewportWidth',
    'waitForNetworkIdle',
  ],
  android: [
    'alwaysRefreshScreenInfo',
    'androidAdbPath',
    'autoDismissKeyboard',
    'deviceId',
    'displayId',
    'exposeRunAdbShellAction',
    'imeStrategy',
    'inputStrategy',
    'keyboardDismissStrategy',
    'keyboardTypeDelay',
    'launch',
    'minScreenshotBufferSize',
    'output',
    'remoteAdbHost',
    'remoteAdbPort',
    'scrcpyConfig',
    'screenshotResizeScale',
    'screenshotStrategy',
    'unstableLogContent',
    'usePhysicalDisplayIdForDisplayLookup',
    'usePhysicalDisplayIdForScreenshot',
  ],
  ios: [
    'autoDismissKeyboard',
    'inputStrategy',
    'iOSDeviceClassOverride',
    'keyboardTypeDelay',
    'launch',
    'output',
    'sessionId',
    'unstableLogContent',
    'wdaHost',
    'wdaMjpegFrameSource',
    'wdaMjpegPort',
    'wdaPort',
  ],
  harmony: [
    'appNameMapping',
    'autoDismissKeyboard',
    'deviceId',
    'hdcPath',
    'inputStrategy',
    'keyboardDismissStrategy',
    'keyboardTypeDelay',
    'launch',
    'output',
    'screenshotResizeScale',
    'unstableLogContent',
  ],
  computer: ['displayId', 'output', 'unstableLogContent'],
  interface: ['export', 'module', 'param'],
} as const;

// This is a permanent inventory of the legacy YAML surface. If a future Test
// or platform feature makes one of these checks fail, decouple its new type
// from the legacy YAML type; do not add the new field to this inventory.
const scriptFieldsAreExhaustive: ExactKeys<
  MidsceneYamlScript,
  (typeof scriptFields)[number]
> = true;
const batchFieldsAreExhaustive: ExactKeys<
  MidsceneYamlConfig,
  (typeof batchFields)[number]
> = true;
const agentFieldsAreExhaustive: ExactKeys<
  MidsceneYamlScriptAgentOpt,
  (typeof agentFields)[number]
> = true;
const webFieldsAreExhaustive: ExactKeys<
  MidsceneYamlScriptWebEnv,
  (typeof platformFields.web)[number]
> = true;
const androidFieldsAreExhaustive: ExactKeys<
  MidsceneYamlScriptAndroidEnv,
  (typeof platformFields.android)[number]
> = true;
const iosFieldsAreExhaustive: ExactKeys<
  MidsceneYamlScriptIOSEnv,
  (typeof platformFields.ios)[number]
> = true;
const harmonyFieldsAreExhaustive: ExactKeys<
  MidsceneYamlScriptHarmonyEnv,
  (typeof platformFields.harmony)[number]
> = true;
const computerFieldsAreExhaustive: ExactKeys<
  MidsceneYamlScriptComputerEnv,
  (typeof platformFields.computer)[number]
> = true;
const interfaceFieldsAreExhaustive: ExactKeys<
  MidsceneYamlScriptEnvGeneralInterface,
  (typeof platformFields.interface)[number]
> = true;

describe('executable legacy YAML configuration contract', () => {
  it('keeps the reviewed public field inventories executable', () => {
    expect({
      scriptFieldsAreExhaustive,
      batchFieldsAreExhaustive,
      agentFieldsAreExhaustive,
      webFieldsAreExhaustive,
      androidFieldsAreExhaustive,
      iosFieldsAreExhaustive,
      harmonyFieldsAreExhaustive,
      computerFieldsAreExhaustive,
      interfaceFieldsAreExhaustive,
    }).toEqual({
      scriptFieldsAreExhaustive: true,
      batchFieldsAreExhaustive: true,
      agentFieldsAreExhaustive: true,
      webFieldsAreExhaustive: true,
      androidFieldsAreExhaustive: true,
      iosFieldsAreExhaustive: true,
      harmonyFieldsAreExhaustive: true,
      computerFieldsAreExhaustive: true,
      interfaceFieldsAreExhaustive: true,
    });
  });

  it('freezes old batch defaults and maps scheduling to one public Project', () => {
    expect(defaultLegacyConfig).toEqual({
      concurrent: 1,
      continueOnError: false,
      retry: 0,
      shareBrowserContext: false,
      headed: false,
      keepWindow: false,
      dotenvOverride: false,
      dotenvDebug: false,
    });

    const plan: LegacyTestRunPlan = {
      ...defaultLegacyConfig,
      files: ['/workspace/suite/b.yaml', '/workspace/suite/a.yaml'],
      setup: '/workspace/suite/setup.yaml',
      concurrent: 3,
      retry: 2,
      summary: '/workspace/summary.json',
      bail: 0,
    };
    expect(adaptLegacyExecutionPlan(plan, '/workspace')).toEqual({
      bail: 0,
      project: {
        name: 'legacy',
        files: {
          include: ['suite/b.yaml', 'suite/a.yaml'],
        },
        retry: 2,
      },
    });
  });

  it('preserves target and Agent fields while global target config wins deeply', () => {
    const sourceConfig: MidsceneYamlScript = {
      target: { url: 'target-source' },
      page: { url: 'page-source' },
      browser: { url: 'browser-source' },
      web: {
        url: 'web-source',
        viewportWidth: 800,
        extraHTTPHeaders: { Source: 'yes', Shared: 'source' },
      },
      android: { deviceId: 'android-source' },
      ios: { wdaHost: 'ios-source' },
      harmony: { deviceId: 'harmony-source' },
      computer: { displayId: 'computer-source' },
      interface: { module: './device.cjs', param: { source: true } },
      config: { output: './source.json', unstableLogContent: false },
      agent: {
        generateReport: false,
        reportFileName: 'source-report',
        cache: { id: 'source-cache', strategy: 'read-only' },
      },
      tasks: [{ name: 'source task', flow: [] }],
    };
    const globalConfig: MidsceneYamlTargetConfig = {
      web: {
        viewportWidth: 1200,
        extraHTTPHeaders: { Batch: 'yes', Shared: 'batch' },
      },
      android: { deviceId: 'android-batch' },
      interface: { param: { batch: true } },
    };
    const adapted = adaptLegacyWorkflow(
      {
        projectId: 'project',
        projectName: 'legacy',
        sourcePath: 'flow.yaml',
        absolutePath: '/workspace/flow.yaml',
      },
      sourceConfig,
      globalConfig,
    );

    expect(adapted.script).toEqual({
      ...sourceConfig,
      web: {
        ...sourceConfig.web,
        viewportWidth: 1200,
        extraHTTPHeaders: { Source: 'yes', Shared: 'batch', Batch: 'yes' },
      },
      android: { deviceId: 'android-batch' },
      interface: {
        module: './device.cjs',
        param: { source: true, batch: true },
      },
    });
    expect(adapted.sourceConfig).toBe(sourceConfig);
  });

  it('maps task continuation, order and result names to public Cases and Steps', () => {
    const adapted = adaptLegacyWorkflow(
      {
        projectId: 'project',
        projectName: 'legacy',
        sourcePath: 'flow.yaml',
        absolutePath: '/workspace/flow.yaml',
        invocationIndex: 2,
      },
      {
        tasks: [
          {
            name: 'continue after this case',
            continueOnError: true,
            flow: [
              { javascript: 'first()', name: 'named' },
              { javascript: 'second()' },
            ],
          },
          {
            name: 'stop after this case',
            flow: [{ javascript: 'third()' }],
          },
        ],
      },
    );

    expect(adapted.document.cases).toHaveLength(2);
    expect(
      adapted.document.cases.map((item) => item.definition.onFailure),
    ).toEqual(['continue', 'stop-document']);
    expect(
      adapted.document.cases.flatMap((item) =>
        item.definition.steps.map((step) => step.meta.resultName),
      ),
    ).toEqual(['named', '0', '1']);
    const caseIds = adapted.document.cases.map((item) => item.caseId);
    expect(new Set(caseIds).size).toBe(2);
    expect(caseIds.every((id) => /^[a-f0-9]{64}$/.test(id))).toBe(true);
  });
});
