import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { assert, ifInBrowser, ifInWorker } from '@midscene/shared/utils';
import { type ZodTypeAny, z } from 'zod';

// previous defined yaml flow, as a helper
interface MidsceneYamlFlowItemAIInput extends LocateOption {
  // previous version
  // aiInput: string; // value to input
  // locate: TUserPrompt; // where to input
  aiInput: TUserPrompt | undefined; // where to input
  value: string | number; // value to input
}

interface MidsceneYamlFlowItemAIKeyboardPress extends LocateOption {
  // previous version
  // aiKeyboardPress: string;
  // locate?: TUserPrompt; // where to press, optional
  aiKeyboardPress: TUserPrompt | undefined; // where to press
  keyName: string; // key to press
}

interface MidsceneYamlFlowItemAIScroll extends LocateOption, ScrollParam {
  // previous version
  // aiScroll: null;
  // locate?: TUserPrompt; // which area to scroll, optional
  aiScroll: TUserPrompt | undefined; // which area to scroll
}

import type { Agent } from '@/agent/agent';
import type { TUserPrompt } from '@/common';
import type {
  DeviceAction,
  FreeFn,
  LocateOption,
  MidsceneYamlFlowItemAIAction,
  MidsceneYamlFlowItemAIAssert,
  MidsceneYamlFlowItemAIWaitFor,
  MidsceneYamlFlowItemEvaluateJavaScript,
  MidsceneYamlFlowItemLogScreenshot,
  MidsceneYamlFlowItemSleep,
  MidsceneYamlScript,
  MidsceneYamlScriptEnv,
  ScriptPlayerStatusValue,
  ScriptPlayerTaskStatus,
  ScrollParam,
} from '@/types';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import { getDebug } from '@midscene/shared/logger';
import {
  buildDetailedLocateParam,
  buildDetailedLocateParamAndRestParams,
} from './utils';

const debug = getDebug('yaml-player');
const aiTaskHandlerMap = {
  aiQuery: 'aiQuery',
  aiNumber: 'aiNumber',
  aiString: 'aiString',
  aiBoolean: 'aiBoolean',
  aiAsk: 'aiAsk',
  aiLocate: 'aiLocate',
} as const;

type AISimpleTaskKey = keyof typeof aiTaskHandlerMap;

const isStringParamSchema = (schema?: ZodTypeAny): boolean => {
  if (!schema) {
    return false;
  }

  const schemaDef = (schema as any)?._def;
  if (!schemaDef?.typeName) {
    return false;
  }

  switch (schemaDef.typeName) {
    case z.ZodFirstPartyTypeKind.ZodString:
    case z.ZodFirstPartyTypeKind.ZodEnum:
    case z.ZodFirstPartyTypeKind.ZodNativeEnum:
      return true;
    case z.ZodFirstPartyTypeKind.ZodLiteral:
      return typeof schemaDef.value === 'string';
    case z.ZodFirstPartyTypeKind.ZodOptional:
    case z.ZodFirstPartyTypeKind.ZodNullable:
    case z.ZodFirstPartyTypeKind.ZodDefault:
      return isStringParamSchema(schemaDef.innerType);
    case z.ZodFirstPartyTypeKind.ZodEffects:
      return isStringParamSchema(schemaDef.schema);
    case z.ZodFirstPartyTypeKind.ZodPipeline:
      return isStringParamSchema(schemaDef.out);
    case z.ZodFirstPartyTypeKind.ZodUnion: {
      const options = schemaDef.options as ZodTypeAny[] | undefined;
      return Array.isArray(options)
        ? options.every((option) => isStringParamSchema(option))
        : false;
    }
    default:
      return false;
  }
};
export class ScriptPlayer<T extends MidsceneYamlScriptEnv> {
  public currentTaskIndex?: number;
  public taskStatusList: ScriptPlayerTaskStatus[] = [];
  public status: ScriptPlayerStatusValue = 'init';
  public reportFile?: string | null;
  public result: Record<string, any>;
  private unnamedResultIndex = 0;
  public output?: string | null;
  public unstableLogContent?: string | null;
  public errorInSetup?: Error;
  private interfaceAgent: Agent | null = null;
  public agentStatusTip?: string;
  public target?: MidsceneYamlScriptEnv;
  private actionSpace: DeviceAction[] = [];
  private scriptPath?: string;
  constructor(
    private script: MidsceneYamlScript,
    private setupAgent: (platform: T) => Promise<{
      agent: Agent;
      freeFn: FreeFn[];
    }>,
    public onTaskStatusChange?: (taskStatus: ScriptPlayerTaskStatus) => void,
    scriptPath?: string,
  ) {
    this.scriptPath = scriptPath;
    this.result = {};
    const resolvedAiActContext =
      script.agent?.aiActContext ?? script.agent?.aiActionContext;

    if (resolvedAiActContext !== undefined && script.agent) {
      if (
        script.agent.aiActContext === undefined &&
        script.agent.aiActionContext !== undefined
      ) {
        console.warn(
          'agent.aiActionContext is deprecated, please use agent.aiActContext instead. The legacy name is still accepted for backward compatibility.',
        );
      }

      script.agent.aiActContext = resolvedAiActContext;
    }

    this.target =
      script.target ||
      script.web ||
      script.android ||
      script.ios ||
      script.config;

    if (ifInBrowser || ifInWorker) {
      this.output = undefined;
      debug('output is undefined in browser or worker');
    } else if (this.target?.output) {
      this.output = resolve(process.cwd(), this.target.output);
      debug('setting output by config.output', this.output);
    } else {
      const scriptName = this.scriptPath
        ? basename(this.scriptPath, '.yaml').replace(/\.(ya?ml)$/i, '')
        : 'script';
      this.output = join(
        getMidsceneRunSubDir('output'),
        `${scriptName}-${Date.now()}.json`,
      );
      debug('setting output by script path', this.output);
    }

    if (ifInBrowser || ifInWorker) {
      this.unstableLogContent = undefined;
    } else if (typeof this.target?.unstableLogContent === 'string') {
      this.unstableLogContent = resolve(
        process.cwd(),
        this.target.unstableLogContent,
      );
    } else if (this.target?.unstableLogContent === true) {
      this.unstableLogContent = join(
        getMidsceneRunSubDir('output'),
        'unstableLogContent.json',
      );
    }

    this.taskStatusList = (script.tasks || []).map((task, taskIndex) => ({
      ...task,
      index: taskIndex,
      status: 'init',
      totalSteps: task.flow?.length || 0,
    }));
  }

  private setResult(key: string | undefined, value: any) {
    const keyToUse = key || this.unnamedResultIndex++;
    if (this.result[keyToUse]) {
      console.warn(`result key ${keyToUse} already exists, will overwrite`);
    }
    this.result[keyToUse] = value;

    return this.flushResult();
  }

  private setPlayerStatus(status: ScriptPlayerStatusValue, error?: Error) {
    this.status = status;
    this.errorInSetup = error;
  }

  private notifyCurrentTaskStatusChange(taskIndex?: number) {
    const taskIndexToNotify =
      typeof taskIndex === 'number' ? taskIndex : this.currentTaskIndex;

    if (typeof taskIndexToNotify !== 'number') {
      return;
    }

    const taskStatus = this.taskStatusList[taskIndexToNotify];
    if (this.onTaskStatusChange) {
      this.onTaskStatusChange(taskStatus);
    }
  }

  private async setTaskStatus(
    index: number,
    statusValue: ScriptPlayerStatusValue,
    error?: Error,
  ) {
    this.taskStatusList[index].status = statusValue;
    if (error) {
      this.taskStatusList[index].error = error;
    }

    this.notifyCurrentTaskStatusChange(index);
  }

  private setTaskIndex(taskIndex: number) {
    this.currentTaskIndex = taskIndex;
  }

  private flushResult() {
    if (this.output) {
      const output = resolve(process.cwd(), this.output);
      const outputDir = dirname(output);
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }
      writeFileSync(output, JSON.stringify(this.result || {}, undefined, 2));
    }
  }

  private flushUnstableLogContent() {
    if (this.unstableLogContent) {
      const content = this.interfaceAgent?._unstableLogContent();
      const filePath = resolve(process.cwd(), this.unstableLogContent);
      const outputDir = dirname(filePath);
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }
      writeFileSync(filePath, JSON.stringify(content, null, 2));
    }
  }

  async playTask(taskStatus: ScriptPlayerTaskStatus, agent: Agent) {
    const { flow } = taskStatus;
    assert(flow, 'missing flow in task');

    for (const flowItemIndex in flow) {
      const currentStep = Number.parseInt(flowItemIndex, 10);
      taskStatus.currentStep = currentStep;
      const flowItem = flow[flowItemIndex];
      debug(
        `playing step ${flowItemIndex}, flowItem=${JSON.stringify(flowItem)}`,
      );
      const simpleAIKey = (
        Object.keys(aiTaskHandlerMap) as AISimpleTaskKey[]
      ).find((key) => Object.prototype.hasOwnProperty.call(flowItem, key));
      if (
        'aiAct' in (flowItem as MidsceneYamlFlowItemAIAction) ||
        'aiAction' in (flowItem as MidsceneYamlFlowItemAIAction) ||
        'ai' in (flowItem as MidsceneYamlFlowItemAIAction)
      ) {
        const actionTask = flowItem as MidsceneYamlFlowItemAIAction;
        const { aiAct, aiAction, ai, ...actionOptions } = actionTask;
        const prompt = aiAct || aiAction || ai;
        assert(prompt, 'missing prompt for ai (aiAct)');
        await agent.aiAct(prompt, actionOptions);
      } else if ('aiAssert' in (flowItem as MidsceneYamlFlowItemAIAssert)) {
        const assertTask = flowItem as MidsceneYamlFlowItemAIAssert;
        const {
          aiAssert: prompt,
          errorMessage: msg,
          name,
          ...restOpts
        } = assertTask;
        assert(prompt, 'missing prompt for aiAssert');
        const { pass, thought, message } =
          (await agent.aiAssert(prompt, msg, {
            ...restOpts,
            keepRawResponse: true,
          })) || {};

        this.setResult(name, {
          pass,
          thought,
          message,
        });

        if (!pass) {
          throw new Error(message);
        }
      } else if (simpleAIKey) {
        const {
          [simpleAIKey]: prompt,
          name,
          ...options
        } = flowItem as Record<string, any>;
        assert(prompt, `missing prompt for ${simpleAIKey}`);
        const agentMethod = (agent as any)[aiTaskHandlerMap[simpleAIKey]];
        assert(
          typeof agentMethod === 'function',
          `missing agent method for ${simpleAIKey}`,
        );
        const aiResult = await agentMethod.call(agent, prompt, options);
        this.setResult(name, aiResult);
      } else if ('aiWaitFor' in (flowItem as MidsceneYamlFlowItemAIWaitFor)) {
        const waitForTask = flowItem as MidsceneYamlFlowItemAIWaitFor;
        const { aiWaitFor, timeout, ...restWaitForOpts } = waitForTask;
        const prompt = aiWaitFor;
        assert(prompt, 'missing prompt for aiWaitFor');
        const waitForOptions = {
          ...restWaitForOpts,
          ...(timeout !== undefined ? { timeout, timeoutMs: timeout } : {}),
        };
        await agent.aiWaitFor(prompt, waitForOptions);
      } else if ('sleep' in (flowItem as MidsceneYamlFlowItemSleep)) {
        const sleepTask = flowItem as MidsceneYamlFlowItemSleep;
        const ms = sleepTask.sleep;
        let msNumber = ms;
        if (typeof ms === 'string') {
          msNumber = Number.parseInt(ms, 10);
        }
        assert(
          msNumber && msNumber > 0,
          `ms for sleep must be greater than 0, but got ${ms}`,
        );
        await new Promise((resolve) => setTimeout(resolve, msNumber));
      } else if (
        'javascript' in (flowItem as MidsceneYamlFlowItemEvaluateJavaScript)
      ) {
        const evaluateJavaScriptTask =
          flowItem as MidsceneYamlFlowItemEvaluateJavaScript;

        const result = await agent.evaluateJavaScript(
          evaluateJavaScriptTask.javascript,
        );
        this.setResult(evaluateJavaScriptTask.name, result);
      } else if (
        'logScreenshot' in (flowItem as MidsceneYamlFlowItemLogScreenshot) ||
        'recordToReport' in (flowItem as MidsceneYamlFlowItemLogScreenshot)
      ) {
        const recordTask = flowItem as MidsceneYamlFlowItemLogScreenshot;
        const title =
          recordTask.recordToReport ?? recordTask.logScreenshot ?? 'untitled';
        const content = recordTask.content || '';
        await agent.recordToReport(title, { content });
      } else if ('aiInput' in (flowItem as MidsceneYamlFlowItemAIInput)) {
        // may be input empty string ''
        const {
          aiInput,
          value: rawValue,
          ...inputTask
        } = flowItem as MidsceneYamlFlowItemAIInput;

        // Compatibility with previous version:
        // Old format: { aiInput: string (value), locate: TUserPrompt }
        // New format - 1: { aiInput: TUserPrompt, value: string | number }
        // New format - 2: { aiInput: undefined, locate: TUserPrompt, value: string | number }
        let locatePrompt: TUserPrompt | undefined;
        let value: string | number | undefined;
        if ((inputTask as any).locate) {
          // Old format - aiInput is the value, locate is the prompt
          // Keep backward compatibility: empty string is treated as no value
          value = (aiInput as string | number) || rawValue;
          locatePrompt = (inputTask as any).locate;
        } else {
          // New format - aiInput is the prompt, value is the value
          locatePrompt = aiInput || '';
          value = rawValue;
        }

        // Convert value to string for Input action
        await agent.callActionInActionSpace('Input', {
          ...inputTask,
          ...(value !== undefined ? { value: String(value) } : {}),
          ...(locatePrompt
            ? { locate: buildDetailedLocateParam(locatePrompt, inputTask) }
            : {}),
        });
      } else if (
        'aiKeyboardPress' in (flowItem as MidsceneYamlFlowItemAIKeyboardPress)
      ) {
        const { aiKeyboardPress, ...keyboardPressTask } =
          flowItem as MidsceneYamlFlowItemAIKeyboardPress;

        // Compatibility with previous version:
        // Old format: { aiKeyboardPress: string (key), locate?: TUserPrompt }
        // New format - 1: { aiKeyboardPress: TUserPrompt, keyName: string }
        // New format - 2: { aiKeyboardPress: , locate?: TUserPrompt, keyName: string }
        let locatePrompt: TUserPrompt | undefined;
        let keyName: string | undefined;
        if ((keyboardPressTask as any).locate) {
          // Old format - aiKeyboardPress is the key, locate is the prompt
          keyName = aiKeyboardPress as string;
          locatePrompt = (keyboardPressTask as any).locate;
        } else if (keyboardPressTask.keyName) {
          // New format - aiKeyboardPress is the prompt, key is the key
          keyName = keyboardPressTask.keyName;
          locatePrompt = aiKeyboardPress;
        } else {
          keyName = aiKeyboardPress as string;
        }

        await agent.callActionInActionSpace('KeyboardPress', {
          ...keyboardPressTask,
          ...(keyName ? { keyName } : {}),
          ...(locatePrompt
            ? {
                locate: buildDetailedLocateParam(
                  locatePrompt,
                  keyboardPressTask,
                ),
              }
            : {}),
        });
      } else if ('aiScroll' in (flowItem as MidsceneYamlFlowItemAIScroll)) {
        const { aiScroll, ...scrollTask } =
          flowItem as MidsceneYamlFlowItemAIScroll;

        // Compatibility with previous version:
        // Old format: { aiScroll: null, locate?: TUserPrompt, direction, scrollType, distance? }
        // New format - 1: { aiScroll: TUserPrompt, direction, scrollType, distance? }
        // New format - 2: { aiScroll: undefined, locate: TUserPrompt, direction, scrollType, distance? }
        const { locate, ...scrollOptions } = scrollTask as any;
        const locatePrompt: TUserPrompt | undefined = locate ?? aiScroll;

        await agent.aiScroll(locatePrompt, scrollOptions);
      } else {
        // generic action, find the action in actionSpace

        /* for aiTap, aiRightClick, the parameters are a flattened data for the 'locate', these are all valid data

        - aiTap: 'search input box'
        - aiTap: 'search input box'
          deepThink: true
          cacheable: false
        - aiTap:
          prompt: 'search input box'
        - aiTap:
          prompt: 'search input box'
          deepThink: true
          cacheable: false
        */

        const actionSpace = this.actionSpace;
        let locatePromptShortcut: string | undefined;
        let actionParamForMatchedAction: unknown;
        const matchedAction = actionSpace.find((action) => {
          const actionInterfaceAlias = action.interfaceAlias;
          if (
            actionInterfaceAlias &&
            Object.prototype.hasOwnProperty.call(flowItem, actionInterfaceAlias)
          ) {
            actionParamForMatchedAction =
              flowItem[actionInterfaceAlias as keyof typeof flowItem];
            if (typeof actionParamForMatchedAction === 'string') {
              locatePromptShortcut = actionParamForMatchedAction;
            }
            return true;
          }

          const keyOfActionInActionSpace = action.name;
          if (
            Object.prototype.hasOwnProperty.call(
              flowItem,
              keyOfActionInActionSpace,
            )
          ) {
            actionParamForMatchedAction =
              flowItem[keyOfActionInActionSpace as keyof typeof flowItem];
            if (typeof actionParamForMatchedAction === 'string') {
              locatePromptShortcut = actionParamForMatchedAction;
            }
            return true;
          }

          return false;
        });

        assert(
          matchedAction,
          `unknown flowItem in yaml: ${JSON.stringify(flowItem)}`,
        );

        const schemaIsStringParam = isStringParamSchema(
          matchedAction.paramSchema,
        );
        let stringParamToCall: string | undefined;
        if (
          typeof actionParamForMatchedAction === 'string' &&
          schemaIsStringParam
        ) {
          if (matchedAction.paramSchema) {
            const parseResult = matchedAction.paramSchema.safeParse(
              actionParamForMatchedAction,
            );
            if (parseResult.success && typeof parseResult.data === 'string') {
              stringParamToCall = parseResult.data;
            } else if (!parseResult.success) {
              debug(
                `parse failed for action ${matchedAction.name} with string param`,
                parseResult.error,
              );
              stringParamToCall = actionParamForMatchedAction;
            }
          } else {
            stringParamToCall = actionParamForMatchedAction;
          }
        }

        if (stringParamToCall !== undefined) {
          debug(
            `matchedAction: ${matchedAction.name}`,
            `flowParams: ${JSON.stringify(stringParamToCall)}`,
          );
          const result = await agent.callActionInActionSpace(
            matchedAction.name,
            stringParamToCall,
          );

          // Store result if there's a name property in flowItem
          const resultName = (flowItem as any).name;
          if (result !== undefined) {
            this.setResult(resultName, result);
          }
        } else {
          // Determine the source for parameter extraction:
          // - If we have a locatePromptShortcut, use the flowItem (for actions like aiTap with prompt)
          // - Otherwise, use actionParamForMatchedAction (for actions like runWdaRequest with structured params)
          const sourceForParams =
            locatePromptShortcut &&
            typeof actionParamForMatchedAction === 'string'
              ? { ...flowItem, prompt: locatePromptShortcut }
              : typeof actionParamForMatchedAction === 'object' &&
                  actionParamForMatchedAction !== null
                ? actionParamForMatchedAction
                : flowItem;

          const { locateParam, restParams } =
            buildDetailedLocateParamAndRestParams(
              locatePromptShortcut || '',
              sourceForParams as LocateOption,
              [
                matchedAction.name,
                matchedAction.interfaceAlias || '_never_mind_',
              ],
            );

          const flowParams = {
            ...restParams,
            locate: locateParam,
          };

          debug(
            `matchedAction: ${matchedAction.name}`,
            `flowParams: ${JSON.stringify(flowParams, null, 2)}`,
          );
          const result = await agent.callActionInActionSpace(
            matchedAction.name,
            flowParams,
          );

          // Store result if there's a name property in flowItem
          const resultName = (flowItem as any).name;
          if (result !== undefined) {
            this.setResult(resultName, result);
          }
        }
      }
    }
    this.reportFile = agent.reportFile;
    await this.flushUnstableLogContent();
  }

  async run() {
    const { target, web, android, ios, tasks } = this.script;
    const webEnv = web || target;
    const androidEnv = android;
    const iosEnv = ios;
    const platform = webEnv || androidEnv || iosEnv;

    this.setPlayerStatus('running');

    let agent: Agent | null = null;
    let freeFn: FreeFn[] = [];
    try {
      const { agent: newAgent, freeFn: newFreeFn } = await this.setupAgent(
        platform as T,
      );
      this.actionSpace = await newAgent.getActionSpace();
      agent = newAgent;
      const originalOnTaskStartTip = agent.onTaskStartTip;
      agent.onTaskStartTip = (tip) => {
        if (this.status === 'running') {
          this.agentStatusTip = tip;
        }
        originalOnTaskStartTip?.(tip);
      };
      freeFn = [
        ...(newFreeFn || []),
        {
          name: 'restore-agent-onTaskStartTip',
          fn: () => {
            if (agent) {
              agent.onTaskStartTip = originalOnTaskStartTip;
            }
          },
        },
      ];
    } catch (e) {
      this.setPlayerStatus('error', e as Error);
      return;
    }
    this.interfaceAgent = agent;

    let taskIndex = 0;
    this.setPlayerStatus('running');
    let errorFlag = false;
    while (taskIndex < tasks.length) {
      const taskStatus = this.taskStatusList[taskIndex];
      this.setTaskStatus(taskIndex, 'running' as any);
      this.setTaskIndex(taskIndex);

      try {
        await this.playTask(taskStatus, this.interfaceAgent);
        this.setTaskStatus(taskIndex, 'done' as any);
      } catch (e) {
        this.setTaskStatus(taskIndex, 'error' as any, e as Error);

        if (taskStatus.continueOnError) {
          // nothing more to do
        } else {
          this.reportFile = agent.reportFile;
          errorFlag = true;
          break;
        }
      }
      this.reportFile = agent?.reportFile;
      taskIndex++;
    }

    if (errorFlag) {
      this.setPlayerStatus('error');
    } else {
      this.setPlayerStatus('done');
    }
    this.agentStatusTip = '';

    // free the resources
    for (const fn of freeFn) {
      try {
        await fn.fn();
      } catch (e) {
        // Silently handle cleanup errors
      }
    }
  }
}
