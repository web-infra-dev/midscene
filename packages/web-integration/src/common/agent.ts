import type { WebPage } from '@/common/page';
import type {
  AgentWaitForOpt,
  ExecutionDump,
  GroupedActionDump,
} from '@midscene/core';
import {
  groupedActionDumpFileExt,
  stringifyDumpData,
  writeLogFile,
} from '@midscene/core/utils';
import { PageTaskExecutor } from '../common/tasks';
import type { AiTaskCache } from './task-cache';
import { printReportMsg, reportFileName } from './utils';

export interface PageAgentOpt {
  testId?: string;
  groupName?: string;
  groupDescription?: string;
  cache?: AiTaskCache;
  /* if auto generate report, default true */
  generateReport?: boolean;
}

export class PageAgent {
  page: WebPage;

  dump: GroupedActionDump;

  reportFile?: string;

  reportFileName?: string;

  taskExecutor: PageTaskExecutor;

  opts: PageAgentOpt;

  constructor(page: WebPage, opts?: PageAgentOpt) {
    this.page = page;
    this.opts = Object.assign(
      {
        generateReport: true,
        groupName: 'Midscene Report',
        groupDescription: '',
      },
      opts || {},
    );
    this.dump = {
      groupName: this.opts.groupName!,
      groupDescription: this.opts.groupDescription,
      executions: [],
    };
    this.taskExecutor = new PageTaskExecutor(this.page, {
      cache: opts?.cache || { aiTasks: [] },
    });
    this.reportFileName = reportFileName(opts?.testId || 'web');
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

  writeOutActionDumps() {
    const generateReport = this.opts.generateReport;
    this.reportFile = writeLogFile({
      fileName: this.reportFileName!,
      fileExt: groupedActionDumpFileExt,
      fileContent: this.dumpDataString(),
      type: 'dump',
      generateReport,
    });

    if (generateReport) {
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

  async aiAssert(assertion: string, msg?: string) {
    const { output, executor } = await this.taskExecutor.assert(assertion);
    this.appendExecutionDump(executor.dump());
    this.writeOutActionDumps();

    if (!output?.pass) {
      const errMsg = msg || `Assertion failed: ${assertion}`;
      const reasonMsg = `Reason: ${output?.thought} || (no_reason)`;
      throw new Error(`${errMsg}\n${reasonMsg}`);
    }
  }

  async aiWaitFor(assertion: string, opt?: AgentWaitForOpt) {
    const { executor } = await this.taskExecutor.waitFor(assertion, {
      timeoutMs: opt?.timeoutMs || 30 * 1000,
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
}
