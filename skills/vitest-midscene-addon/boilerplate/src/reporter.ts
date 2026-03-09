import { DefaultReporter } from 'vitest/reporters';

const CYAN = '\x1B[36m';
const RESET = '\x1B[0m';

function findReport(task: any): string | undefined {
  if (task.meta?.midsceneReport) return task.meta.midsceneReport;
  if (task.tasks) {
    for (const child of task.tasks) {
      const found = findReport(child);
      if (found) return found;
    }
  }
  return undefined;
}

export default class MidsceneReporter extends DefaultReporter {
  printTask(task: any) {
    if (
      !('filepath' in task) ||
      !task.result?.state ||
      task.result.state === 'run' ||
      task.result.state === 'queued'
    ) {
      return;
    }

    const reportPath = findReport(task);
    if (!reportPath) {
      super.printTask(task);
      return;
    }

    // Capture lines from super.printTask to append report path to file header
    const lines: string[] = [];
    const originalLog = this.log;
    this.log = ((...messages: any[]) => {
      lines.push(messages.join(' '));
    }) as any;

    try {
      super.printTask(task);
    } finally {
      this.log = originalLog;
    }

    for (let i = 0; i < lines.length; i++) {
      if (i === 0) {
        this.log(`${lines[i]} ${CYAN}${reportPath}${RESET}`);
      } else {
        this.log(lines[i]);
      }
    }
  }
}
