import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  observeResourceOperations,
  recordOperation,
  setResourceOperationIdentity,
} from '@midscene/core/internal/test-runner';
import { describe, expect, it } from 'vitest';
import { createOperationJournal } from '../src/cli/operation-journal';

describe('append-only operation journal', () => {
  it('persists late failure after the report boundary without reopening or mutating it', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'midscene-operations-'));
    try {
      const journal = createOperationJournal(directory);
      const controller = new AbortController();
      setResourceOperationIdentity(controller.signal, {
        scopeId: 'attempt',
        stepId: 'attempt:steps:0',
        node: 'aiAct',
      });
      const stop = observeResourceOperations(controller.signal, (event) =>
        journal.append(event),
      );
      let reject!: (error: unknown) => void;
      const pending = new Promise((_, no) => {
        reject = no;
      });
      const operation = recordOperation(pending, controller.signal, 'resource');
      controller.abort(new Error('timeout'));
      operation.runnerReturned('failed');
      stop();
      const snapshot = readFileSync(journal.path, 'utf8');
      expect(snapshot).not.toContain('settled');
      reject(
        Object.assign(new Error('late failure'), {
          details: { token: 'private', nested: 'x'.repeat(10_000) },
        }),
      );
      await pending.catch(() => {});
      await Promise.resolve();
      const written = readFileSync(journal.path, 'utf8');
      expect(written.startsWith(snapshot)).toBe(true);
      const events = written
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      expect(events.map((item) => item.kind)).toEqual([
        'started',
        'cancel-requested',
        'runner-returned',
        'settled',
      ]);
      expect(events[3]).toMatchObject({
        operationId: operation.record.operationId,
        stepId: 'attempt:steps:0',
        status: 'failed',
        error: {
          message: 'late failure',
          details: { value: { token: '[REDACTED]' } },
        },
      });
      expect(written).not.toContain('private');
      expect(written.length).toBeLessThan(5000);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
