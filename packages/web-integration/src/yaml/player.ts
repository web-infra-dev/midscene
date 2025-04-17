import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { assert, ifInBrowser } from '@midscene/shared/utils';

import type { PageAgent } from '@/common/agent';
import type {
  FreeFn,
  MidsceneYamlFlowItemAIAction,
  MidsceneYamlFlowItemAIAssert,
  MidsceneYamlFlowItemAIHover,
  MidsceneYamlFlowItemAIInput,
  MidsceneYamlFlowItemAIKeyboardPress,
  MidsceneYamlFlowItemAIQuery,
  MidsceneYamlFlowItemAIScroll,
  MidsceneYamlFlowItemAITap,
  MidsceneYamlFlowItemAIWaitFor,
  MidsceneYamlFlowItemEvaluateJavaScript,
  MidsceneYamlFlowItemSleep,
  MidsceneYamlScript,
  MidsceneYamlScriptAndroidEnv,
  MidsceneYamlScriptEnv,
  MidsceneYamlScriptWebEnv,
  ScriptPlayerStatusValue,
  ScriptPlayerTaskStatus,
} from '@midscene/core';
import { getMidsceneRunPathOfType } from '@midscene/shared/fs';

export class ScriptPlayer<T extends MidsceneYamlScriptEnv> {
  public currentTaskIndex?: number;
  public taskStatusList: ScriptPlayerTaskStatus[] = [];
  public status: ScriptPlayerStatusValue = 'init';
  public reportFile?: string | null;
  public result: Record<string, any>;
  private unnamedResultIndex = 0;
  public output?: string | null;
  public errorInSetup?: Error;
  private pageAgent: PageAgent | null = null;
  public agentStatusTip?: string;
  constructor(
    private script: MidsceneYamlScript,
    private setupAgent: (platform: T) => Promise<{
      agent: PageAgent;
      freeFn: FreeFn[];
    }>,
    public onTaskStatusChange?: (taskStatus: ScriptPlayerTaskStatus) => void,
  ) {
    this.result = {};

    if (ifInBrowser) {
      this.output = undefined;
    } else if (script.target?.output) {
      this.output = resolve(process.cwd(), script.target.output);
    } else {
      this.output = join(
        getMidsceneRunPathOfType('output'),
        `${process.pid}.json`,
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

    this.flushResult();
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
    if (Object.keys(this.result).length && this.output) {
      const output = resolve(process.cwd(), this.output);
      const outputDir = dirname(output);
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }
      writeFileSync(output, JSON.stringify(this.result, undefined, 2));
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
        this.setResult(queryTask.name, queryResult);
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
        let msNumber = ms;
        if (typeof ms === 'string') {
          msNumber = Number.parseInt(ms, 10);
        }
        assert(
          msNumber && msNumber > 0,
          `ms for sleep must be greater than 0, but got ${ms}`,
        );
        await new Promise((resolve) => setTimeout(resolve, msNumber));
      } else if ((flowItem as MidsceneYamlFlowItemAITap).aiTap) {
        const tapTask = flowItem as MidsceneYamlFlowItemAITap;
        await agent.aiTap(tapTask.aiTap, tapTask);
      } else if ((flowItem as MidsceneYamlFlowItemAIHover).aiHover) {
        const hoverTask = flowItem as MidsceneYamlFlowItemAIHover;
        await agent.aiHover(hoverTask.aiHover, hoverTask);
      } else if ((flowItem as MidsceneYamlFlowItemAIInput).aiInput) {
        const inputTask = flowItem as MidsceneYamlFlowItemAIInput;
        await agent.aiInput(inputTask.aiInput, inputTask.locate, inputTask);
      } else if (
        (flowItem as MidsceneYamlFlowItemAIKeyboardPress).aiKeyboardPress
      ) {
        const keyboardPressTask =
          flowItem as MidsceneYamlFlowItemAIKeyboardPress;
        await agent.aiKeyboardPress(
          keyboardPressTask.aiKeyboardPress,
          keyboardPressTask.locate,
          keyboardPressTask,
        );
      } else if (
        typeof (flowItem as MidsceneYamlFlowItemAIScroll).aiScroll !==
        'undefined'
      ) {
        const scrollTask = flowItem as MidsceneYamlFlowItemAIScroll;
        await agent.aiScroll(scrollTask, scrollTask.locate, scrollTask);
      } else if (
        typeof (flowItem as MidsceneYamlFlowItemEvaluateJavaScript)
          .javascript !== 'undefined'
      ) {
        const evaluateJavaScriptTask =
          flowItem as MidsceneYamlFlowItemEvaluateJavaScript;

        const result = await agent.evaluateJavaScript(
          evaluateJavaScriptTask.javascript,
        );
        this.setResult(evaluateJavaScriptTask.name, result);
      } else {
        throw new Error(`unknown flowItem: ${JSON.stringify(flowItem)}`);
      }
    }
    this.reportFile = agent.reportFile;
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
      agent = newAgent;
      agent.onTaskStartTip = (tip) => {
        if (this.status === 'running') {
          this.agentStatusTip = tip;
        }
      };
      freeFn = newFreeFn;
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
      this.reportFile = agent.reportFile;
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
