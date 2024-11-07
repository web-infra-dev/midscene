import type { WebPage } from '@/common/page';
import {
  type AgentAssertOpt,
  type AgentWaitForOpt,
  type ExecutionDump,
  type GroupedActionDump,
  Insight,
} from '@midscene/core';
import { NodeType } from '@midscene/shared/constants';

import {
  groupedActionDumpFileExt,
  reportHTMLContent,
  stringifyDumpData,
  writeLogFile,
} from '@midscene/core/utils';
import { PageTaskExecutor } from '../common/tasks';
import { WebElementInfo } from '../web-element';
import type { AiTaskCache } from './task-cache';
import { printReportMsg, reportFileName } from './utils';
import { type WebUIContext, parseContextFromWebPage } from './utils';

export interface PageAgentOpt {
  testId?: string;
  cacheId?: string;
  groupName?: string;
  groupDescription?: string;
  cache?: AiTaskCache;
  /* if auto generate report, default true */
  generateReport?: boolean;
  /* if auto print report msg, default true */
  autoPrintReportMsg?: boolean;
}

export class PageAgent {
  page: WebPage;

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

  constructor(page: WebPage, opts?: PageAgentOpt) {
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

    this.insight = new Insight<WebElementInfo, WebUIContext>(
      async () => {
        return this.getUIContext();
      },
      {
        generateElement: ({ content, rect }) =>
          new WebElementInfo({
            content: content || '',
            rect,
            page,
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

  async getUIContext(): Promise<WebUIContext> {
    return await parseContextFromWebPage(this.page);
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

  async aiAction(taskPrompt: string) {
    const { executor } = await this.taskExecutor.action(taskPrompt);
    this.appendExecutionDump(executor.dump());
    this.writeOutActionDumps();

    if (executor.isInErrorState()) {
      const errorTask = executor.latestErrorTask();
      throw new Error(`${errorTask?.error}\n${errorTask?.errorStack}`);
    }
  }

  async aiQuery(demand: any) {
    const { output, executor } = await this.taskExecutor.query(demand);
    this.appendExecutionDump(executor.dump());
    this.writeOutActionDumps();

    if (executor.isInErrorState()) {
      const errorTask = executor.latestErrorTask();
      throw new Error(`${errorTask?.error}\n${errorTask?.errorStack}`);
    }
    return output;
  }

  async aiAssert(assertion: string, msg?: string, opt?: AgentAssertOpt) {
    const { output, executor } = await this.taskExecutor.assert(assertion);
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

  async destroy() {
    await this.page.destroy();
  }
}
