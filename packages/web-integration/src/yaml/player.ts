import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { assert, ifInBrowser, ifInWorker } from '@midscene/shared/utils';

import type { PageAgent } from '@/common/agent';
import type {
  DeviceAction,
  FreeFn,
  MidsceneYamlFlowItemAIAction,
  MidsceneYamlFlowItemAIAsk,
  MidsceneYamlFlowItemAIAssert,
  MidsceneYamlFlowItemAIBoolean,
  MidsceneYamlFlowItemAIInput,
  MidsceneYamlFlowItemAIKeyboardPress,
  MidsceneYamlFlowItemAILocate,
  MidsceneYamlFlowItemAINumber,
  MidsceneYamlFlowItemAIQuery,
  MidsceneYamlFlowItemAIScroll,
  MidsceneYamlFlowItemAIString,
  MidsceneYamlFlowItemAIWaitFor,
  MidsceneYamlFlowItemEvaluateJavaScript,
  MidsceneYamlFlowItemLogScreenshot,
  MidsceneYamlFlowItemSleep,
  MidsceneYamlScript,
  MidsceneYamlScriptEnv,
  ScriptPlayerStatusValue,
  ScriptPlayerTaskStatus,
  TUserPrompt,
} from '@midscene/core';
import { actionSpaceTypePrefix } from '@midscene/core/ai-model';
import { getMidsceneRunSubDir } from '@midscene/shared/common';

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
  private pageAgent: PageAgent | null = null;
  public agentStatusTip?: string;
  public target?: MidsceneYamlScriptEnv;
  private actionSpace: DeviceAction[] = [];
  private scriptPath?: string;
  constructor(
    private script: MidsceneYamlScript,
    private setupAgent: (platform: T) => Promise<{
      agent: PageAgent;
      freeFn: FreeFn[];
    }>,
    public onTaskStatusChange?: (taskStatus: ScriptPlayerTaskStatus) => void,
    scriptPath?: string,
  ) {
    this.scriptPath = scriptPath;
    this.result = {};
    this.target = script.target || script.web || script.android;

    if (ifInBrowser || ifInWorker) {
      this.output = undefined;
    } else if (this.target?.output) {
      this.output = resolve(process.cwd(), this.target.output);
    } else {
      const scriptName = this.scriptPath
        ? basename(this.scriptPath, '.yaml').replace(/\.(ya?ml)$/i, '')
        : 'script';
      this.output = join(
        getMidsceneRunSubDir('output'),
        `${scriptName}-${Date.now()}.json`,
      );
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
      const content = this.pageAgent?._unstableLogContent();
      const filePath = resolve(process.cwd(), this.unstableLogContent);
      const outputDir = dirname(filePath);
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }
      writeFileSync(filePath, JSON.stringify(content, null, 2));
    }
  }

  async playTask(taskStatus: ScriptPlayerTaskStatus, agent: PageAgent) {
    const { flow } = taskStatus;
    assert(flow, 'missing flow in task');

    for (const flowItemIndex in flow) {
      const currentStep = Number.parseInt(flowItemIndex, 10);
      taskStatus.currentStep = currentStep;
      const flowItem = flow[flowItemIndex];
      if (
        'aiAction' in (flowItem as MidsceneYamlFlowItemAIAction) ||
        'ai' in (flowItem as MidsceneYamlFlowItemAIAction)
      ) {
        const actionTask = flowItem as MidsceneYamlFlowItemAIAction;
        const prompt = actionTask.aiAction || actionTask.ai;
        assert(prompt, 'missing prompt for ai (aiAction)');
        assert(
          typeof prompt === 'string',
          'prompt for aiAction must be a string',
        );
        await agent.aiAction(prompt, {
          cacheable: actionTask.cacheable,
        });
      } else if ('aiAssert' in (flowItem as MidsceneYamlFlowItemAIAssert)) {
        const assertTask = flowItem as MidsceneYamlFlowItemAIAssert;
        const prompt = assertTask.aiAssert;
        const msg = assertTask.errorMessage;
        assert(prompt, 'missing prompt for aiAssert');
        assert(
          typeof prompt === 'string',
          'prompt for aiAssert must be a string',
        );
        await agent.aiAssert(prompt, msg);
      } else if ('aiQuery' in (flowItem as MidsceneYamlFlowItemAIQuery)) {
        const queryTask = flowItem as MidsceneYamlFlowItemAIQuery;
        const prompt = queryTask.aiQuery;
        const options = {
          domIncluded: queryTask.domIncluded,
          screenshotIncluded: queryTask.screenshotIncluded,
        };
        assert(prompt, 'missing prompt for aiQuery');
        assert(
          typeof prompt === 'string',
          'prompt for aiQuery must be a string',
        );
        const queryResult = await agent.aiQuery(prompt, options);
        this.setResult(queryTask.name, queryResult);
      } else if ('aiNumber' in (flowItem as MidsceneYamlFlowItemAINumber)) {
        const numberTask = flowItem as MidsceneYamlFlowItemAINumber;
        const prompt = numberTask.aiNumber;
        const options = {
          domIncluded: numberTask.domIncluded,
          screenshotIncluded: numberTask.screenshotIncluded,
        };
        assert(prompt, 'missing prompt for aiNumber');
        assert(
          typeof prompt === 'string',
          'prompt for number must be a string',
        );
        const numberResult = await agent.aiNumber(prompt, options);
        this.setResult(numberTask.name, numberResult);
      } else if ('aiString' in (flowItem as MidsceneYamlFlowItemAIString)) {
        const stringTask = flowItem as MidsceneYamlFlowItemAIString;
        const prompt = stringTask.aiString;
        const options = {
          domIncluded: stringTask.domIncluded,
          screenshotIncluded: stringTask.screenshotIncluded,
        };
        assert(prompt, 'missing prompt for aiString');
        assert(
          typeof prompt === 'string',
          'prompt for string must be a string',
        );
        const stringResult = await agent.aiString(prompt, options);
        this.setResult(stringTask.name, stringResult);
      } else if ('aiBoolean' in (flowItem as MidsceneYamlFlowItemAIBoolean)) {
        const booleanTask = flowItem as MidsceneYamlFlowItemAIBoolean;
        const prompt = booleanTask.aiBoolean;
        const options = {
          domIncluded: booleanTask.domIncluded,
          screenshotIncluded: booleanTask.screenshotIncluded,
        };
        assert(prompt, 'missing prompt for aiBoolean');
        assert(
          typeof prompt === 'string',
          'prompt for boolean must be a string',
        );
        const booleanResult = await agent.aiBoolean(prompt, options);
        this.setResult(booleanTask.name, booleanResult);
      } else if ('aiAsk' in (flowItem as MidsceneYamlFlowItemAIAsk)) {
        const askTask = flowItem as MidsceneYamlFlowItemAIAsk;
        const prompt = askTask.aiAsk;
        assert(prompt, 'missing prompt for aiAsk');
        assert(typeof prompt === 'string', 'prompt for aiAsk must be a string');
        const askResult = await agent.aiAsk(prompt);
        this.setResult(askTask.name, askResult);
      } else if ('aiLocate' in (flowItem as MidsceneYamlFlowItemAILocate)) {
        const locateTask = flowItem as MidsceneYamlFlowItemAILocate;
        const prompt = locateTask.aiLocate;
        assert(prompt, 'missing prompt for aiLocate');
        assert(
          typeof prompt === 'string',
          'prompt for aiLocate must be a string',
        );
        const locateResult = await agent.aiLocate(prompt, locateTask);
        this.setResult(locateTask.name, locateResult);
      } else if ('aiWaitFor' in (flowItem as MidsceneYamlFlowItemAIWaitFor)) {
        const waitForTask = flowItem as MidsceneYamlFlowItemAIWaitFor;
        const prompt = waitForTask.aiWaitFor;
        assert(prompt, 'missing prompt for aiWaitFor');
        assert(
          typeof prompt === 'string',
          'prompt for aiWaitFor must be a string',
        );
        const timeout = waitForTask.timeout;
        await agent.aiWaitFor(prompt, { timeoutMs: timeout });
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
      } else if ('aiInput' in (flowItem as MidsceneYamlFlowItemAIInput)) {
        // may be input empty string ''
        const inputTask = flowItem as MidsceneYamlFlowItemAIInput;

        // Compatibility with previous version:
        // Old format: { aiInput: string (value), locate: TUserPrompt }
        // New format: { aiInput: TUserPrompt, value: string }
        if ((inputTask as any).locate) {
          // Old format - aiInput is the value, locate is the prompt
          const value = inputTask.aiInput as string;
          const locatePrompt = (inputTask as any).locate;
          await agent.aiInput(value, locatePrompt, inputTask);
        } else {
          // New format - aiInput is the prompt, value is the value
          const locatePrompt = inputTask.aiInput;
          const value = inputTask.value;
          if (locatePrompt) {
            await agent.aiInput(locatePrompt, {
              ...inputTask,
              value: value,
            });
          } else {
            throw new Error(
              'aiInput requires either locatePrompt or value and locate',
            );
          }
        }
      } else if (
        'aiKeyboardPress' in (flowItem as MidsceneYamlFlowItemAIKeyboardPress)
      ) {
        const keyboardPressTask =
          flowItem as MidsceneYamlFlowItemAIKeyboardPress;

        // Compatibility with previous version:
        // Old format: { aiKeyboardPress: string (key), locate?: TUserPrompt }
        // New format: { aiKeyboardPress: TUserPrompt, key: string }
        if ((keyboardPressTask as any).locate) {
          // Old format - aiKeyboardPress is the key, locate is the prompt
          const keyName = keyboardPressTask.aiKeyboardPress as string;
          const locatePrompt = (keyboardPressTask as any).locate;
          await agent.aiKeyboardPress(keyName, locatePrompt, keyboardPressTask);
        } else if ((keyboardPressTask as any).key) {
          // New format - aiKeyboardPress is the prompt, key is the key
          const locatePrompt = keyboardPressTask.aiKeyboardPress;
          const keyName = (keyboardPressTask as any).key;
          if (locatePrompt) {
            await agent.aiKeyboardPress(locatePrompt, {
              ...keyboardPressTask,
              keyName: keyName,
            });
          } else {
            throw new Error(
              'aiKeyboardPress in new format requires locatePrompt',
            );
          }
        } else {
          // Fallback to old format without locate (global key press)
          const keyName = keyboardPressTask.aiKeyboardPress as string;
          await agent.aiKeyboardPress(keyName, undefined, keyboardPressTask);
        }
      } else if ('aiScroll' in (flowItem as MidsceneYamlFlowItemAIScroll)) {
        const scrollTask = flowItem as MidsceneYamlFlowItemAIScroll;

        // Compatibility with previous version:
        // Old format: { aiScroll: null, locate?: TUserPrompt, direction, scrollType, distance? }
        // New format: { aiScroll: TUserPrompt, direction, scrollType, distance? }
        if ((scrollTask as any).locate) {
          // Old format - locate is the prompt, aiScroll is null/ignored
          const locatePrompt = (scrollTask as any).locate;
          const scrollParam = {
            direction: scrollTask.direction,
            scrollType: scrollTask.scrollType,
            distance: scrollTask.distance,
          };
          await agent.aiScroll(scrollParam, locatePrompt, scrollTask);
        } else {
          // New format - aiScroll is the prompt, or no prompt for global scroll
          const locatePrompt = scrollTask.aiScroll;
          const scrollParam = {
            direction: scrollTask.direction,
            scrollType: scrollTask.scrollType,
            distance: scrollTask.distance,
          };
          if (locatePrompt) {
            await agent.aiScroll(locatePrompt, {
              ...scrollTask,
              ...scrollParam,
            });
          } else {
            // Global scroll without specific element
            await agent.aiScroll(scrollParam, undefined, scrollTask);
          }
        }
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
        'logScreenshot' in (flowItem as MidsceneYamlFlowItemLogScreenshot)
      ) {
        const logScreenshotTask = flowItem as MidsceneYamlFlowItemLogScreenshot;
        await agent.logScreenshot(logScreenshotTask.logScreenshot, {
          content: logScreenshotTask.content || '',
        });
      } else {
        // generic action, find the action in actionSpace
        const actionSpace = this.actionSpace;
        let locatePrompt: TUserPrompt | undefined;
        const matchedAction = actionSpace.find((action) => {
          const actionInterfaceAlias = action.interfaceAlias;
          if (
            actionInterfaceAlias &&
            Object.prototype.hasOwnProperty.call(flowItem, actionInterfaceAlias)
          ) {
            locatePrompt = flowItem[
              actionInterfaceAlias as keyof typeof flowItem
            ] as TUserPrompt;
            return true;
          }

          const keyOfActionInActionSpace = `${actionSpaceTypePrefix}${action.name}`;
          if (
            Object.prototype.hasOwnProperty.call(
              flowItem,
              keyOfActionInActionSpace,
            )
          ) {
            locatePrompt = flowItem[
              keyOfActionInActionSpace as keyof typeof flowItem
            ] as TUserPrompt;
            return true;
          }

          return false;
        });

        if (matchedAction) {
          const {
            [matchedAction.interfaceAlias as string]: _,
            [actionSpaceTypePrefix + matchedAction.name]: __,
            ...restParams
          } = flowItem as any;
          await agent.callActionInActionSpace(
            matchedAction.name,
            locatePrompt,
            restParams,
          );
        } else {
          throw new Error(`unknown flowItem: ${JSON.stringify(flowItem)}`);
        }
      }
    }
    this.reportFile = agent.reportFile;
    await this.flushUnstableLogContent();
  }

  async run() {
    const { target, web, android, tasks } = this.script;
    const webEnv = web || target;
    const androidEnv = android;
    const platform = webEnv || androidEnv;

    this.setPlayerStatus('running');

    let agent: PageAgent | null = null;
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
    this.pageAgent = agent;

    let taskIndex = 0;
    this.setPlayerStatus('running');
    let errorFlag = false;
    while (taskIndex < tasks.length) {
      const taskStatus = this.taskStatusList[taskIndex];
      this.setTaskStatus(taskIndex, 'running' as any);
      this.setTaskIndex(taskIndex);

      try {
        await this.playTask(taskStatus, this.pageAgent);
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
        // console.log('freeing', fn.name);
        await fn.fn();
        // console.log('freed', fn.name);
      } catch (e) {
        // console.error('error freeing', fn.name, e);
      }
    }
  }
}
