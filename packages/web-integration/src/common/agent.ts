import type { WebPage } from '@/common/page';
import type { ExecutionDump, GroupedActionDump } from '@midscene/core';
import {
  groupedActionDumpFileExt,
  stringifyDumpData,
  writeDumpFile,
} from '@midscene/core/utils';
import { PageTaskExecutor } from '../common/tasks';
import type { AiTaskCache } from './task-cache';

export class PageAgent {
  page: WebPage;

  dumps: GroupedActionDump[];

  testId: string;

  dumpFile?: string;

  taskExecutor: PageTaskExecutor;

  constructor(
    page: WebPage,
    opts?: { testId?: string; taskFile?: string; cache?: AiTaskCache },
  ) {
    this.page = page;
    this.dumps = [
      {
        groupName: opts?.taskFile || 'unnamed',
        executions: [],
      },
    ];
    this.testId = opts?.testId || String(process.pid);
    this.taskExecutor = new PageTaskExecutor(this.page, {
      cache: opts?.cache || { aiTasks: [] },
    });
  }

  appendDump(execution: ExecutionDump) {
    const currentDump = this.dumps[0];
    currentDump.executions.push(execution);
  }

  writeOutActionDumps() {
    this.dumpFile = writeDumpFile({
      fileName: `run-${this.testId}`,
      fileExt: groupedActionDumpFileExt,
      fileContent: stringifyDumpData(this.dumps),
    });
  }

  async aiAction(taskPrompt: string) {
    const { executor } = await this.taskExecutor.action(taskPrompt);
    this.appendDump(executor.dump());
    this.writeOutActionDumps();

    if (executor.isInErrorState()) {
      const errorTask = executor.latestErrorTask();
      throw new Error(`${errorTask?.error}\n${errorTask?.errorStack}`);
    }
  }

  async aiQuery(demand: any) {
    const { output, executor } = await this.taskExecutor.query(demand);
    this.appendDump(executor.dump());
    this.writeOutActionDumps();

    if (executor.isInErrorState()) {
      const errorTask = executor.latestErrorTask();
      throw new Error(`${errorTask?.error}\n${errorTask?.errorStack}`);
    }
    return output;
  }

  async aiAssert(assertion: string, msg?: string) {
    const { output, executor } = await this.taskExecutor.assert(assertion);
    this.appendDump(executor.dump());
    this.writeOutActionDumps();

    if (!output?.pass) {
      const errMsg = msg || `Assertion failed: ${assertion}`;
      const reasonMsg = `Reason: ${output?.thought} || (no_reason)`;
      throw new Error(`${errMsg}\n${reasonMsg}`);
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
