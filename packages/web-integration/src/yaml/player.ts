import assert from 'node:assert';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { paramStr, typeStr } from '@/common/ui-utils';

import type { PageAgent } from '@/common/agent';
import type {
  FreeFn,
  MidsceneYamlFlowItemAIAction,
  MidsceneYamlFlowItemAIAssert,
  MidsceneYamlFlowItemAIQuery,
  MidsceneYamlFlowItemAIWaitFor,
  MidsceneYamlFlowItemSleep,
  MidsceneYamlScript,
  MidsceneYamlScriptEnv,
  MidsceneYamlTask,
} from '@midscene/core';

export interface ScriptPlayerTaskStatus extends MidsceneYamlTask {
  status: ScriptPlayerStatusValue;
  currentStep?: number;
  totalSteps: number;
  error?: Error;
}

export type ScriptPlayerStatusValue = 'init' | 'running' | 'done' | 'error';

export class ScriptPlayer {
  public currentTaskIndex?: number;
  public taskStatus: ScriptPlayerTaskStatus[] = [];
  public status: ScriptPlayerStatusValue = 'init';
  public reportFile?: string | null;
  public result: Record<string, any>;
  private unnamedResultIndex = 0;
  public output?: string | null;
  public errorInSetup?: Error;
  private pageAgent: PageAgent | null = null;
  constructor(
    private script: MidsceneYamlScript,
    private setupAgent: (target: MidsceneYamlScriptEnv) => Promise<{
      agent: PageAgent;
      freeFn: FreeFn[];
    }>,
    private onTaskStatusChange?: (taskStatus: ScriptPlayerTaskStatus) => void,
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

  private notifyCurrentTaskStatusChange(taskIndex?: number) {
    const taskIndexToNotify =
      typeof taskIndex === 'number' ? taskIndex : this.currentTaskIndex;

    if (typeof taskIndexToNotify !== 'number') {
      return;
    }

    const taskStatus = this.taskStatus[taskIndexToNotify];
    if (this.onTaskStatusChange) {
      this.onTaskStatusChange(taskStatus);
    }
  }

  private async setTaskStatus(
    index: number,
    statusValue: ScriptPlayerStatusValue,
    error?: Error,
  ) {
    this.taskStatus[index].status = statusValue;
    if (error) {
      this.taskStatus[index].error = error;
    }

    this.notifyCurrentTaskStatusChange(index);
  }

  private setTaskIndex(taskIndex: number) {
    this.currentTaskIndex = taskIndex;
  }

  private flushResult() {
    if (Object.keys(this.result).length && this.output) {
      const output = join(process.cwd(), this.output);
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
    const notifyTaskStatusChange =
      this.notifyCurrentTaskStatusChange.bind(this);

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
        await agent.aiAction(prompt, {
          onTaskStart(task) {
            const tip = `${typeStr(task)} - ${paramStr(task)}`;
            const actionItem = flowItem as MidsceneYamlFlowItemAIAction;
            actionItem.aiActionProgressTips =
              actionItem.aiActionProgressTips || [];
            actionItem.aiActionProgressTips.push(tip);

            notifyTaskStatusChange();
          },
        });
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

  async run() {
    const { target, tasks } = this.script;
    this.setPlayerStatus('running');

    let agent: PageAgent | null = null;
    let freeFn: FreeFn[] = [];
    try {
      const { agent: newAgent, freeFn: newFreeFn } =
        await this.setupAgent(target);
      agent = newAgent;
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
      this.setTaskStatus(taskIndex, 'running' as any);

      try {
        this.setTaskIndex(taskIndex);
        await this.playTask(this.taskStatus[taskIndex], this.pageAgent);
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
