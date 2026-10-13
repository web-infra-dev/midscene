import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestRunReportOperationEvent } from '@midscene/core';

/** Registered operations keep this sink after the report has been sealed.
 * Each small, bounded event is written before returning to the operation. No
 * open file descriptor or mutable report object is retained by the journal.
 */
export function createOperationJournal(runDir: string) {
  const path = join(runDir, 'operations.jsonl');
  writeFileSync(path, '', { flag: 'wx' });
  return {
    path,
    append(event: Readonly<TestRunReportOperationEvent>) {
      appendFileSync(path, `${JSON.stringify(event)}\n`);
    },
  };
}
