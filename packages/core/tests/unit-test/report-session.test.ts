import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Agent } from '@/agent/agent';
import { ReportSession } from '@/dump/report-session';
import type { WorkflowReportSource } from '@/test-runner/engine/types';
import { ExecutionDump } from '@/types';
import { setMidsceneRunDir } from '@midscene/shared/common';
import { afterEach, beforeEach, describe, expect, it } from '@rstest/core';
import {
  fakeBase64,
  getReportGeneratorTmpDir,
} from './test-helpers/report-generator';

let root: string;
beforeEach(() => {
  root = getReportGeneratorTmpDir('hosted-records');
  setMidsceneRunDir(join(root, 'standalone'));
});
afterEach(() => {
  setMidsceneRunDir(undefined);
  rmSync(root, { recursive: true, force: true });
});
const agent = (generateReport = true) =>
  new Agent(
    {
      interfaceType: 'puppeteer',
      actionSpace: () => [],
      screenshotBase64: async () => fakeBase64(80),
      destroy: async () => {},
    } as any,
    {
      generateReport,
      autoPrintReportMsg: false,
      modelConfig: {
        MIDSCENE_MODEL_NAME: 'fixture',
        MIDSCENE_MODEL_API_KEY: 'unused',
      },
    },
  );
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));

describe('Test-owned report records', () => {
  it.each([true, false])(
    'freezes busy=%s with the execution data before queued I/O',
    async (busyAtCutoff) => {
      const session = new ReportSession(join(root, 'busy-cutoff'));
      let busy = busyAtCutoff;
      await session.run(async () => {
        const writer = session.createRecorder(() => busy);
        const execution = (status: 'running' | 'finished') =>
          new ExecutionDump({
            id: 'work',
            name: 'work',
            logTime: 0,
            tasks: [
              {
                taskId: 'work',
                type: 'Log',
                status,
                param: {},
                recorder: [],
                executor: async () => {},
              },
            ],
          });
        const meta = {
          sdkVersion: 'fixture',
          groupName: 'work',
          modelBriefs: [],
        };
        writer.onExecutionUpdate(execution('running'), meta);
        const pending = writer.createSourceSnapshot('case', ['work']);
        busy = !busyAtCutoff;
        writer.onExecutionUpdate(execution('finished'), meta);
        const source = await pending;
        expect(source.collection?.status).toBe(
          busyAtCutoff ? 'partial' : 'complete',
        );
        expect(Boolean(source.collection?.reason)).toBe(busyAtCutoff);
        expect(read(source.dumpPath!).executions[0].tasks[0].status).toBe(
          'running',
        );
        busy = false;
      });
      await session.finish();
    },
  );

  it('releases finished writers immediately while preserving uncollected diagnostics until Session finish', async () => {
    const session = new ReportSession(join(root, 'released-records'));
    const sources: WorkflowReportSource[] = [];
    await session.run(async () => {
      for (let index = 0; index < 8; index++) {
        const a = agent();
        await a.recordToReport(`case-${index}`, {
          content: 'A'.repeat(64 * 1024),
        });
        if (index % 2 === 0)
          sources.push(
            (await a._createReportSource(
              `case-${index}`,
              a.dump.executions.map((e) => e.id!),
            ))!,
          );
        const writer = (a as any).reportManager.reportState.generator;
        await a.destroy();
        expect(writer.recorder.executions).toEqual([]);
        expect(writer.busy).toBeUndefined();
      }
    });
    const uncollected = await session.finish();
    expect(uncollected).toHaveLength(4);
    expect(
      uncollected.map((source) => read(source.dumpPath!).executions[0].name),
    ).toEqual(['Log - case-1', 'Log - case-3', 'Log - case-5', 'Log - case-7']);
    await session.prune();
    for (const source of [...sources, ...uncollected])
      expect(read(source!.dumpPath!).executions).toHaveLength(1);
  });

  it.each([true, false])(
    'records without publishing Agent HTML, generateReport=%s',
    async (enabled) => {
      const session = new ReportSession(join(root, 'records'));
      await session.run(async () => {
        const a = agent(enabled);
        await a.recordToReport('first');
        const first = await a._createReportSource(
          'case',
          a.dump.executions.map((e) => e.id!),
        );
        const cutoff = readFileSync(first!.dumpPath!, 'utf8');
        await a.recordToReport('later');
        const second = await a._createReportSource('case', [
          a.dump.executions.at(-1)!.id!,
        ]);
        expect(second!.sourcePath).toBe(first!.sourcePath);
        expect(read(second!.dumpPath!).executions[0].name).toBe('Log - later');
        expect(readFileSync(first!.dumpPath!, 'utf8')).toBe(cutoff);
        expect(a.reportFile).toBeUndefined();
        await a.destroy();
      });
      expect(await session.finish()).toEqual([]);
      expect(read(join(session.directory, 'report.json')).status).toBe(
        'complete',
      );
      expect(readdirSync(join(session.directory, 'screenshots'))).toHaveLength(
        1,
      );
      await session.prune();
      expect(existsSync(join(session.directory, 'data'))).toBe(false);
      expect(
        readdirSync(session.directory).filter((name) => name.endsWith('.json')),
      ).toHaveLength(2);
      expect(existsSync(join(root, 'standalone', 'report'))).toBe(false);
    },
  );

  it('preserves setup records when execution fails before any Node collects a source', async () => {
    const session = new ReportSession(join(root, 'setup-records'));
    await expect(
      session.run(async () => {
        const a = agent();
        await a.recordToReport('setup diagnostic');
        await a.destroy();
        throw new Error('setup failed');
      }),
    ).rejects.toThrow('setup failed');
    const sources = await session.finish();
    expect(sources).toHaveLength(1);
    expect(read(sources[0].dumpPath!).executions[0].name).toBe(
      'Log - setup diagnostic',
    );
    expect(await session.finish()).toBe(sources);
  });

  it('isolates concurrent Test hosts and adopts a previously unused external Agent', async () => {
    const borrowed = agent();
    await Promise.all(
      ['a', 'b'].map(async (name) => {
        const session = new ReportSession(join(root, name));
        await session.run(async () => {
          const a = name === 'a' ? borrowed : agent();
          await a._prepareForTestRunner();
          await a.recordToReport(name);
          await a.destroy();
        });
        const sources = await session.finish();
        expect(
          read(sources[0].dumpPath!).executions.map(
            (e: { name: string }) => e.name,
          ),
        ).toEqual([`Log - ${name}`]);
      }),
    );
    expect(existsSync(join(root, 'standalone', 'report'))).toBe(true); // factory path only; no page was written
    expect(
      readdirSync(join(root, 'standalone', 'report')).filter((name) =>
        name.endsWith('.html'),
      ),
    ).toEqual([]);
  });

  it('keeps pre-existing standalone history outside the adopted Test stream', async () => {
    const borrowed = agent();
    await borrowed.recordToReport('previous script');
    const previous = await borrowed.flushReport();
    const session = new ReportSession(join(root, 'adopted'));
    await session.run(async () => {
      await borrowed._prepareForTestRunner();
      await borrowed.recordToReport('current Test');
      await borrowed.destroy();
    });
    const sources = await session.finish();
    expect(
      read(sources[0].dumpPath!).executions.map(
        (e: { name: string }) => e.name,
      ),
    ).toEqual(['Log - current Test']);
    expect(readFileSync(previous!, 'utf8')).toContain('Log - previous script');
    expect(readFileSync(previous!, 'utf8')).not.toContain('Log - current Test');
  });

  it('retains active writer data and an immutable cutoff after the host returns', async () => {
    const session = new ReportSession(join(root, 'pending'));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let pending!: Promise<void>;
    let a!: Agent;
    await session.run(async () => {
      a = agent();
      pending = a.recordToReport('before pending').then(async () => {
        // Exercise the same operation guard as an actual long device action.
        await (a as any).reportManager.withReportOperation(async () => {
          await gate;
        });
        await a.recordToReport('late completion');
      });
      await a.flushReport();
      await Promise.resolve();
    });
    const sources = await session.finish();
    const frozen = readFileSync(sources[0].dumpPath!, 'utf8');
    expect(sources[0].collection?.status).toBe('partial');
    await session.prune();
    expect(existsSync(join(session.directory, 'data'))).toBe(true);
    release();
    await pending;
    await a.destroy();
    expect(readFileSync(sources[0].dumpPath!, 'utf8')).toBe(frozen);
    expect(read(join(session.directory, 'report.json')).status).toBe(
      'complete',
    );
  });
});
