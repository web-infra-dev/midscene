import { ExecutionDump, GroupedActionDump } from '@midscene/core';
import { groupedActionDumpFileExt, writeDumpFile } from '@midscene/core/utils';
import { PageTaskExecutor } from '../common/tasks';
import { WebPage } from '@/common/page';

export class PageAgent {
  page: WebPage;

  dumps: GroupedActionDump[];

  constructor(page: WebPage) {
    this.page = page;
    this.dumps = [];
  }

  appendDump(groupName: string, execution: ExecutionDump) {
    let currentDump = this.dumps.find((dump) => dump.groupName === groupName);
    if (!currentDump) {
      currentDump = {
        groupName,
        executions: [],
      };
      this.dumps.push(currentDump);
    }
    currentDump.executions.push(execution);
  }

  writeOutActionDumps() {
    writeDumpFile(`playwright-${process.pid}`, groupedActionDumpFileExt, JSON.stringify(this.dumps));
  }

  async aiAction(taskPrompt: string, dumpGroupName = 'MidScene / Web', dumpCaseName = 'AI Action') {
    const actionAgent = new PageTaskExecutor(this.page, { taskName: dumpCaseName });
    let error: Error | undefined;
    try {
      await actionAgent.action(taskPrompt);
    } catch (e: any) {
      error = e;
    }
    if (actionAgent.executionDump) {
      this.appendDump(dumpGroupName, actionAgent.executionDump);
      this.writeOutActionDumps();
    }
    if (error) {
      // playwright cli won't print error cause, so we print it here
      console.error(error);
      throw new Error(error.message, { cause: error });
    }
  }

  async aiQuery(demand: any, dumpGroupName = 'MidScene / Web', dumpCaseName = 'AI Query') {
    const actionAgent = new PageTaskExecutor(this.page, { taskName: dumpCaseName });
    let error: Error | undefined;
    let result: any;
    try {
      result = await actionAgent.query(demand);
    } catch (e: any) {
      error = e;
    }
    if (actionAgent.executionDump) {
      this.appendDump(dumpGroupName, actionAgent.executionDump);
      this.writeOutActionDumps();
    }
    if (error) {
      // playwright cli won't print error cause, so we print it here
      console.error(error);
      throw new Error(error.message, { cause: error });
    }
    return result;
  }

  async ai(taskPrompt: string, type = 'action', dumpGroupName = 'MidScene / Web', dumpCaseName = 'AI') {
    if (type === 'action') {
      return this.aiAction(taskPrompt, dumpGroupName, dumpCaseName);
    } else if (type === 'query') {
      return this.aiQuery(taskPrompt, dumpGroupName, dumpCaseName);
    }
    throw new Error(`Unknown or Unsupported task type: ${type}, only support 'action' or 'query'`);
  }
}
