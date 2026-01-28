import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ReportWriter } from '@/report-writer';
import { GroupedActionDump } from '@/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('ReportWriter', () => {
  let tempDir: string;
  let writer: ReportWriter;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `report-writer-test-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    writer = new ReportWriter();
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const createMockDump = (): GroupedActionDump => {
    const dump = new GroupedActionDump({
      sdkVersion: '1.0.0',
      groupName: 'Test Group',
      groupDescription: 'Test Description',
      modelBriefs: [],
      executions: [],
    });
    // Mock toHTML to return simple content
    dump.toHTML = vi.fn().mockResolvedValue('<script>test</script>');
    return dump;
  };

  describe('write', () => {
    it('should write report to file', async () => {
      const dump = createMockDump();
      const reportPath = path.join(tempDir, 'report.html');

      const result = await writer.write(dump, reportPath);

      expect(result).toBe(reportPath);
      expect(fs.existsSync(reportPath)).toBe(true);
    });

    it('should create directory if not exists', async () => {
      const dump = createMockDump();
      const nestedDir = path.join(tempDir, 'nested', 'dir');
      const reportPath = path.join(nestedDir, 'report.html');

      await writer.write(dump, reportPath);

      expect(fs.existsSync(reportPath)).toBe(true);
    });
  });

  describe('scheduleWrite and flush', () => {
    it('should queue writes and flush them', async () => {
      const dump = createMockDump();
      const reportPath = path.join(tempDir, 'scheduled-report.html');

      // Schedule write (non-blocking)
      writer.scheduleWrite(dump, reportPath);

      // File might not exist immediately
      // Wait for flush
      await writer.flush();

      // Now file should exist
      expect(fs.existsSync(reportPath)).toBe(true);
    });

    it('should execute multiple writes in order', async () => {
      const writeOrder: number[] = [];

      // Create multiple dumps with tracked toHTML calls
      const createTrackedDump = (index: number) => {
        const dump = createMockDump();
        dump.toHTML = vi.fn().mockImplementation(async () => {
          // Add small delay to simulate async work
          await new Promise((resolve) => setTimeout(resolve, 10));
          writeOrder.push(index);
          return `<script>dump${index}</script>`;
        });
        return dump;
      };

      // Schedule multiple writes
      writer.scheduleWrite(createTrackedDump(1), path.join(tempDir, 'report1.html'));
      writer.scheduleWrite(createTrackedDump(2), path.join(tempDir, 'report2.html'));
      writer.scheduleWrite(createTrackedDump(3), path.join(tempDir, 'report3.html'));

      await writer.flush();

      // Writes should be in order
      expect(writeOrder).toEqual([1, 2, 3]);
    });

    it('should handle errors gracefully without blocking queue', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const failingDump = createMockDump();
      failingDump.toHTML = vi.fn().mockRejectedValue(new Error('Simulated error'));

      const validDump = createMockDump();
      const validPath = path.join(tempDir, 'valid-report.html');

      // Schedule two writes - first will fail, second should still work
      writer.scheduleWrite(failingDump, path.join(tempDir, 'failing-report.html'));
      writer.scheduleWrite(validDump, validPath);

      await writer.flush();

      // Second write should still succeed
      expect(fs.existsSync(validPath)).toBe(true);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('flush', () => {
    it('should resolve immediately when queue is empty', async () => {
      const start = Date.now();
      await writer.flush();
      const elapsed = Date.now() - start;

      // Should resolve almost immediately
      expect(elapsed).toBeLessThan(50);
    });

    it('should wait for all pending writes', async () => {
      const dump = createMockDump();
      let writeCompleted = false;

      dump.toHTML = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        writeCompleted = true;
        return '<script>test</script>';
      });

      writer.scheduleWrite(dump, path.join(tempDir, 'delayed-report.html'));

      // Write should not be completed yet
      expect(writeCompleted).toBe(false);

      await writer.flush();

      // Now it should be completed
      expect(writeCompleted).toBe(true);
    });
  });

  describe('resetInitialization', () => {
    it('should reset initialization for specific path', async () => {
      const dump = createMockDump();
      const reportPath = path.join(tempDir, 'reset-test.html');

      // Write once in append mode to set initialization
      await writer.write(dump, reportPath, true);

      // Reset
      writer.resetInitialization(reportPath);

      // Check internal state is cleared
      expect(writer['initialized'].has(reportPath)).toBe(false);
    });

    it('should reset all initialization when no path provided', async () => {
      const dump = createMockDump();

      await writer.write(dump, path.join(tempDir, 'report1.html'), true);
      await writer.write(dump, path.join(tempDir, 'report2.html'), true);

      writer.resetInitialization();

      expect(writer['initialized'].size).toBe(0);
    });
  });
});
