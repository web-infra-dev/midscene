import { ExecutionDump, GroupedActionDump } from '@midscene/core';
import { groupedActionDumpFileExt, writeDumpFile } from '@midscene/core/utils';
import { PageTaskExecutor } from '../common/tasks';
import { WebPage } from '@/common/page';

export class PageAgent {
  page: WebPage;

  dumps: GroupedActionDump[];

  testId: string;

  dumpFile?: string;

  constructor(page: WebPage, testId?: string) {
    this.page = page;
    this.dumps = [];
    this.testId = testId || String(process.pid);
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
    this.dumpFile = writeDumpFile(
      `playwright-${this.testId}`,
      groupedActionDumpFileExt,
      JSON.stringify(this.dumps),
    );
  }

  async aiAction(taskPrompt: string, dumpCaseName = 'AI Action', dumpGroupName = 'MidScene / Web') {
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

  async aiQuery(demand: any, dumpCaseName = 'AI Query', dumpGroupName = 'MidScene / Web') {
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

  async ai(taskPrompt: string, type = 'action', dumpCaseName = 'AI', dumpGroupName = 'MidScene / Web') {
    if (type === 'action') {
      return this.aiAction(taskPrompt, dumpCaseName, dumpGroupName);
    } else if (type === 'query') {
      return this.aiQuery(taskPrompt, dumpCaseName, dumpGroupName);
    }
    throw new Error(`Unknown or Unsupported task type: ${type}, only support 'action' or 'query'`);
  }
}
