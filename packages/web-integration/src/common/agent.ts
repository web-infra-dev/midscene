import type { WebPage } from '@/common/page';
import {
  type AgentAssertOpt,
  type AgentWaitForOpt,
  type ExecutionDump,
  type ExecutionTask,
  type GroupedActionDump,
  Insight,
  type InsightAction,
  type OnTaskStartTip,
} from '@midscene/core';
import { NodeType } from '@midscene/shared/constants';

import { ScriptPlayer, parseYamlScript } from '@/yaml/index';
import {
  MATCH_BY_POSITION,
  MIDSCENE_USE_VLM_UI_TARS,
  getAIConfig,
  getAIConfigInBoolean,
} from '@midscene/core/env';
import {
  groupedActionDumpFileExt,
  reportHTMLContent,
  stringifyDumpData,
  writeLogFile,
} from '@midscene/core/utils';
import { PageTaskExecutor } from '../common/tasks';
import { WebElementInfo } from '../web-element';
import type { AiTaskCache } from './task-cache';
import { paramStr, typeStr } from './ui-utils';
import { printReportMsg, reportFileName } from './utils';
import { type WebUIContext, parseContextFromWebPage } from './utils';

export interface PageAgentOpt {
  forceSameTabNavigation?: boolean /* if limit the new tab to the current page, default true */;
  testId?: string;
  cacheId?: string;
  groupName?: string;
  groupDescription?: string;
  cache?: AiTaskCache;
  /* if auto generate report, default true */
  generateReport?: boolean;
  /* if auto print report msg, default true */
  autoPrintReportMsg?: boolean;
  onTaskStartTip?: OnTaskStartTip;
}

export class PageAgent<PageType extends WebPage = WebPage> {
  page: PageType;

  insight: Insight<WebElementInfo, WebUIContext>;

  dump: GroupedActionDump;

  reportFile?: string | null;

  reportFileName?: string;

  taskExecutor: PageTaskExecutor;

  opts: PageAgentOpt;

  /**
   * If true, the agent will not perform any actions
   */
  dryMode = false;

  constructor(page: PageType, opts?: PageAgentOpt) {
    this.page = page;
    this.opts = Object.assign(
      {
        generateReport: true,
        autoPrintReportMsg: true,
        groupName: 'Midscene Report',
        groupDescription: '',
      },
      opts || {},
    );
    // get the parent browser of the puppeteer page
    // const browser = (this.page as PuppeteerWebPage).browser();

    this.insight = new Insight<WebElementInfo, WebUIContext>(
      async (action: InsightAction) => {
        return this.getUIContext(action);
      },
      {
        generateElement: ({ content, rect }) =>
          new WebElementInfo({
            content: content || '',
            rect,
            id: '',
            attributes: {
              nodeType: NodeType.CONTAINER,
            },
            indexId: 0,
          }),
      },
    );

    this.taskExecutor = new PageTaskExecutor(this.page, this.insight, {
      cacheId: opts?.cacheId,
    });
    this.dump = this.resetDump();
    this.reportFileName = reportFileName(opts?.testId || 'web');
  }

  async getUIContext(action?: InsightAction): Promise<WebUIContext> {
    if (action && (action === 'extract' || action === 'assert')) {
      return await parseContextFromWebPage(this.page, {
        ignoreMarker: true,
      });
    }
    return await parseContextFromWebPage(this.page, {
      ignoreMarker: getAIConfigInBoolean(MATCH_BY_POSITION),
    });
  }

  resetDump() {
    this.dump = {
      groupName: this.opts.groupName!,
      groupDescription: this.opts.groupDescription,
      executions: [],
    };

    return this.dump;
  }

  appendExecutionDump(execution: ExecutionDump) {
    const currentDump = this.dump;
    currentDump.executions.push(execution);
  }

  dumpDataString() {
    // update dump info
    this.dump.groupName = this.opts.groupName!;
    this.dump.groupDescription = this.opts.groupDescription;
    return stringifyDumpData(this.dump);
  }

  reportHTMLString() {
    return reportHTMLContent(this.dumpDataString());
  }

  writeOutActionDumps() {
    const { generateReport, autoPrintReportMsg } = this.opts;
    this.reportFile = writeLogFile({
      fileName: this.reportFileName!,
      fileExt: groupedActionDumpFileExt,
      fileContent: this.dumpDataString(),
      type: 'dump',
      generateReport,
    });

    if (generateReport && autoPrintReportMsg && this.reportFile) {
      printReportMsg(this.reportFile);
    }
  }

  private async callbackOnTaskStartTip(task: ExecutionTask) {
    if (this.opts.onTaskStartTip) {
      const param = paramStr(task);
      if (param) {
        const tip = `${typeStr(task)} - ${param}`;
        await this.opts.onTaskStartTip(tip);
      } else {
        await this.opts.onTaskStartTip(typeStr(task));
      }
    }
  }

  async aiAction(taskPrompt: string) {
    if (
      getAIConfig(MIDSCENE_USE_VLM_UI_TARS) // ||
      // getAIConfig(MIDSCENE_USE_QWEN_VL) // ING
    ) {
      const { executor } = await this.taskExecutor.actionToGoal(taskPrompt, {
        onTaskStart: this.callbackOnTaskStartTip.bind(this),
      });
      this.appendExecutionDump(executor.dump());
      this.writeOutActionDumps();

      if (executor.isInErrorState()) {
        const errorTask = executor.latestErrorTask();
        throw new Error(`${errorTask?.error}\n${errorTask?.errorStack}`);
      }
    } else {
      const { executor } = await this.taskExecutor.action(taskPrompt, {
        onTaskStart: this.callbackOnTaskStartTip.bind(this),
      });
      this.appendExecutionDump(executor.dump());
      this.writeOutActionDumps();

      if (executor.isInErrorState()) {
        const errorTask = executor.latestErrorTask();
        throw new Error(`${errorTask?.error}\n${errorTask?.errorStack}`);
      }
    }
  }

  async aiQuery(demand: any) {
    const { output, executor } = await this.taskExecutor.query(demand, {
      onTaskStart: this.callbackOnTaskStartTip.bind(this),
    });
    this.appendExecutionDump(executor.dump());
    this.writeOutActionDumps();

    if (executor.isInErrorState()) {
      const errorTask = executor.latestErrorTask();
      throw new Error(`${errorTask?.error}\n${errorTask?.errorStack}`);
    }
    return output;
  }

  async aiAssert(assertion: string, msg?: string, opt?: AgentAssertOpt) {
    const { output, executor } = await this.taskExecutor.assert(assertion, {
      onTaskStart: this.callbackOnTaskStartTip.bind(this),
    });
    this.appendExecutionDump(executor.dump());
    this.writeOutActionDumps();

    if (output && opt?.keepRawResponse) {
      return output;
    }

    if (!output?.pass) {
      const errMsg = msg || `Assertion failed: ${assertion}`;
      const reasonMsg = `Reason: ${
        output?.thought || executor.latestErrorTask()?.error || '(no_reason)'
      }`;
      throw new Error(`${errMsg}\n${reasonMsg}`);
    }
  }

  async aiWaitFor(assertion: string, opt?: AgentWaitForOpt) {
    const { executor } = await this.taskExecutor.waitFor(assertion, {
      timeoutMs: opt?.timeoutMs || 15 * 1000,
      checkIntervalMs: opt?.checkIntervalMs || 3 * 1000,
      assertion,
      onTaskStart: this.callbackOnTaskStartTip.bind(this),
    });
    this.appendExecutionDump(executor.dump());
    this.writeOutActionDumps();

    if (executor.isInErrorState()) {
      const errorTask = executor.latestErrorTask();
      throw new Error(`${errorTask?.error}\n${errorTask?.errorStack}`);
    }
  }

  async ai(taskPrompt: string, type = 'action') {
    if (type === 'action') {
      return this.aiAction(taskPrompt);
    }
    if (type === 'query') {
      return this.aiQuery(taskPrompt);
    }

    if (type === 'assert') {
      return this.aiAssert(taskPrompt);
    }

    throw new Error(
      `Unknown type: ${type}, only support 'action', 'query', 'assert'`,
    );
  }

  async runYaml(yamlScriptContent: string): Promise<{
    result: Record<string, any>;
  }> {
    const script = parseYamlScript(yamlScriptContent, 'yaml', true);
    const player = new ScriptPlayer(script, async (target) => {
      return { agent: this, freeFn: [] };
    });
    await player.run();

    if (player.status === 'error') {
      const errors = player.taskStatusList
        .filter((task) => task.status === 'error')
        .map((task) => {
          return `task - ${task.name}: ${task.error?.message}`;
        })
        .join('\n');
      throw new Error(`Error(s) occurred in running yaml script:\n${errors}`);
    }

    return {
      result: player.result,
    };
  }

  async destroy() {
    await this.page.destroy();
  }
}
