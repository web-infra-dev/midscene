import type { WebPage } from '@/common/page';
import type { ExecutionDump, GroupedActionDump } from '@midscene/core';
import { groupedActionDumpFileExt, writeDumpFile } from '@midscene/core/utils';
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
      fileName: `playwright-${this.testId}`,
      fileExt: groupedActionDumpFileExt,
      fileContent: JSON.stringify(this.dumps),
    });
  }

  async aiAction(taskPrompt: string) {
    let error: Error | undefined;
    try {
      await this.taskExecutor.action(taskPrompt);
    } catch (e: any) {
      error = e;
    }
    // console.log('cache logic', taskExecutor.taskCache.generateTaskCache());
    if (this.taskExecutor.executionDump) {
      this.appendDump(this.taskExecutor.executionDump);
      // this.appendDump(dumpGroupName, taskExecutor.executionDump);
      this.writeOutActionDumps();
    }
    if (error) {
      // playwright cli won't print error cause, so we print it here
      console.error(error);
      throw new Error(error.message, { cause: error });
    }
  }

  async aiQuery(demand: any) {
    let error: Error | undefined;
    let result: any;
    try {
      result = await this.taskExecutor.query(demand);
    } catch (e: any) {
      error = e;
    }
    if (this.taskExecutor.executionDump) {
      this.appendDump(this.taskExecutor.executionDump);
      this.writeOutActionDumps();
    }
    if (error) {
      // playwright cli won't print error cause, so we print it here
      console.error(error);
      throw new Error(error.message, { cause: error });
    }
    return result;
  }

  async aiAssert(assertion: string, msg?: string) {
    const assertionResult = await this.taskExecutor.assert(assertion);
    if (this.taskExecutor.executionDump) {
      this.appendDump(this.taskExecutor.executionDump);
      this.writeOutActionDumps();
    }
    if (!assertionResult.pass) {
      const errMsg = msg || `Assertion failed: ${assertion}`;
      const reasonMsg = `Reason: ${assertionResult.thought}`;
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
