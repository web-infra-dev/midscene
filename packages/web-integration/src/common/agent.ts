import { ExecutionDump, GroupedActionDump } from '@midscene/core';
import { groupedActionDumpFileExt, writeDumpFile } from '@midscene/core/utils';
import { PageTaskExecutor } from '../common/tasks';
import { AiTaskCache } from './task-cache';
import { WebPage } from '@/common/page';

export class PageAgent {
  page: WebPage;

  dumps: GroupedActionDump[];

  testId: string;

  dumpFile?: string;

  actionAgent: PageTaskExecutor;

  constructor(page: WebPage, opts: { testId?: string; taskFile?: string; cache?: AiTaskCache }) {
    this.page = page;
    this.dumps = [
      {
        groupName: opts?.taskFile || 'unnamed',
        executions: [],
      },
    ];
    this.testId = opts?.testId || String(process.pid);
    this.actionAgent = new PageTaskExecutor(this.page, {
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
      await this.actionAgent.action(taskPrompt);
    } catch (e: any) {
      error = e;
    }
    // console.log('cache logic', actionAgent.taskCache.generateTaskCache());
    if (this.actionAgent.executionDump) {
      this.appendDump(this.actionAgent.executionDump);
      // this.appendDump(dumpGroupName, actionAgent.executionDump);
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
      result = await this.actionAgent.query(demand);
    } catch (e: any) {
      error = e;
    }
    if (this.actionAgent.executionDump) {
      this.appendDump(this.actionAgent.executionDump);
      this.writeOutActionDumps();
    }
    if (error) {
      // playwright cli won't print error cause, so we print it here
      console.error(error);
      throw new Error(error.message, { cause: error });
    }
    return result;
  }

  async ai(taskPrompt: string, type = 'action') {
    if (type === 'action') {
      return this.aiAction(taskPrompt);
    } else if (type === 'query') {
      return this.aiQuery(taskPrompt);
    }
    throw new Error(`Unknown or Unsupported task type: ${type}, only support 'action' or 'query'`);
  }
}
