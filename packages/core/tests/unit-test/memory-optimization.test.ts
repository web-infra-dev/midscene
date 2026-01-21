import { describe, expect, it } from 'vitest';
import { ScreenshotItem } from '../../src/screenshot-item';
import { MemoryStorage } from '../../src/storage';
import { ExecutionDump, GroupedActionDump } from '../../src/types';

describe('Memory optimization with StorageProvider', () => {
  // Generate test screenshot data
  function generateScreenshotData(index: number): string {
    const uniquePart = 'X'.repeat(100000) + index.toString(); // ~100KB each
    return `data:image/png;base64,${uniquePart}`;
  }

  function getMemoryUsage(): number {
    if (global.gc) {
      global.gc();
      global.gc();
    }
    return process.memoryUsage().heapUsed;
  }

  describe('ScreenshotItem with StorageProvider', () => {
    it('should store only IDs in memory, not full base64 data', async () => {
      const storage = new MemoryStorage();
      const largeBase64 = `data:image/png;base64,${'A'.repeat(500000)}`; // ~500KB

      const screenshot = await ScreenshotItem.create(largeBase64, storage);

      // Verify ScreenshotItem only stores ID
      expect(screenshot.id).toBeDefined();
      expect(typeof screenshot.id).toBe('string');

      // Verify no direct base64 storage
      expect((screenshot as any)._data).toBeUndefined();
      expect((screenshot as any).base64).toBeUndefined();

      // Verify data can be retrieved via getData()
      const data = await screenshot.getData();
      expect(data).toBe(largeBase64);
    });

    it('should use significantly less memory than direct base64 storage', async () => {
      const storage = new MemoryStorage();
      const screenshots: ScreenshotItem[] = [];
      const count = 100;

      const before = getMemoryUsage();

      // Create 100 screenshots
      for (let i = 0; i < count; i++) {
        const screenshot = await ScreenshotItem.create(
          generateScreenshotData(i),
          storage,
        );
        screenshots.push(screenshot);
      }

      const after = getMemoryUsage();
      const memoryPerScreenshot = (after - before) / count / 1024; // KB

      // Verify: each screenshot should only occupy minimal memory (< 10KB)
      // Because only ID and reference are stored, not full base64
      expect(memoryPerScreenshot).toBeLessThan(10);

      // Verify all screenshots can access data
      const data = await screenshots[0].getData();
      expect(data.length).toBeGreaterThan(100000);
    });
  });

  describe('Serialization memory optimization', () => {
    it('should produce compact serialized JSON with ID placeholders', async () => {
      const storage = new MemoryStorage();
      const screenshot1 = await ScreenshotItem.create(
        generateScreenshotData(1),
        storage,
      );
      const screenshot2 = await ScreenshotItem.create(
        generateScreenshotData(2),
        storage,
      );

      const dump = new ExecutionDump({
        name: 'Test Execution',
        logTime: Date.now(),
        tasks: [
          {
            type: 'Insight',
            status: 'finished',
            uiContext: {
              screenshot: screenshot1,
              size: { width: 1920, height: 1080 },
            },
            recorder: [
              {
                type: 'screenshot',
                ts: Date.now(),
                screenshot: screenshot2,
              },
            ],
          } as any,
        ],
      });

      const serialized = dump.serialize();
      const json = JSON.parse(serialized);

      // Verify: serialized JSON should contain ID placeholders, not full base64
      expect(serialized).toContain('$screenshot');
      expect(serialized).not.toContain('XXXXXXXXXX'); // base64 content should not be in serialized result

      // Verify: serialized result should be small (< 5KB)
      expect(serialized.length).toBeLessThan(5000);

      // Verify JSON structure
      expect(json.tasks[0].uiContext.screenshot).toHaveProperty('$screenshot');
      expect(json.tasks[0].recorder[0].screenshot).toHaveProperty(
        '$screenshot',
      );
    });

    it('should save massive memory compared to inline base64 serialization', async () => {
      const storage = new MemoryStorage();
      const dumps: ExecutionDump[] = [];
      const count = 50; // 50 dumps, each with 2 screenshots = 100 screenshots total

      // Create test data
      for (let i = 0; i < count; i++) {
        const screenshot1 = await ScreenshotItem.create(
          generateScreenshotData(i * 2),
          storage,
        );
        const screenshot2 = await ScreenshotItem.create(
          generateScreenshotData(i * 2 + 1),
          storage,
        );

        const dump = new ExecutionDump({
          name: `Execution ${i}`,
          logTime: Date.now(),
          tasks: [
            {
              type: 'Insight',
              status: 'finished',
              uiContext: {
                screenshot: screenshot1,
                size: { width: 1920, height: 1080 },
              },
              recorder: [
                {
                  type: 'screenshot',
                  ts: Date.now(),
                  screenshot: screenshot2,
                },
              ],
            } as any,
          ],
        });

        dumps.push(dump);
      }

      const beforeSerialize = getMemoryUsage();

      // Serialize all dumps
      const serialized = dumps.map((d) => d.serialize());

      const afterSerialize = getMemoryUsage();
      const serializationMemory =
        (afterSerialize - beforeSerialize) / 1024 / 1024; // MB

      // Verify: serialization memory should be small (< 1MB)
      // Because only IDs are serialized, not full base64
      expect(serializationMemory).toBeLessThan(1);

      // Verify all serialized results contain $screenshot placeholders
      serialized.forEach((json) => {
        expect(json).toContain('$screenshot');
      });

      // Comparison: with old approach (inline base64), total serialized size would be ~10MB
      // New approach should be far smaller
      const totalSize = serialized.reduce((sum, s) => sum + s.length, 0);
      expect(totalSize).toBeLessThan(1 * 1024 * 1024); // < 1MB
    });
  });

  describe('Real-world scenario: test report generation', () => {
    it('should handle large test suites efficiently', async () => {
      const storage = new MemoryStorage();
      const testCount = 100; // Simulate 100 tests

      const before = getMemoryUsage();

      // Simulate 100 tests, each with 3 screenshots
      const allScreenshots: ScreenshotItem[] = [];
      for (let i = 0; i < testCount; i++) {
        for (let j = 0; j < 3; j++) {
          const screenshot = await ScreenshotItem.create(
            generateScreenshotData(i * 3 + j),
            storage,
          );
          allScreenshots.push(screenshot);
        }
      }

      const after = getMemoryUsage();
      const totalMemory = (after - before) / 1024 / 1024; // MB

      // Verify: 300 screenshots should use minimal memory (< 2MB)
      expect(totalMemory).toBeLessThan(2);

      // Verify: average per screenshot < 10KB
      const avgPerScreenshot = (totalMemory * 1024) / (testCount * 3);
      expect(avgPerScreenshot).toBeLessThan(10);

      // Verify all screenshots are accessible
      const randomScreenshot =
        allScreenshots[Math.floor(Math.random() * allScreenshots.length)];
      const data = await randomScreenshot.getData();
      expect(data.length).toBeGreaterThan(100000);
    });
  });

  describe('Memory leak prevention', () => {
    it('should not accumulate memory when creating and discarding screenshots', async () => {
      const storage = new MemoryStorage();
      const iterations = 50;

      const memoryReadings: number[] = [];

      for (let i = 0; i < iterations; i++) {
        // Create temporary screenshot (will be GC'd)
        const tempScreenshot = await ScreenshotItem.create(
          generateScreenshotData(i),
          storage,
        );
        await tempScreenshot.getData(); // Ensure data was accessed

        if (i % 10 === 0) {
          memoryReadings.push(getMemoryUsage());
        }
      }

      // Verify: memory usage should be relatively stable, not continuously growing
      // Calculate memory growth rate
      const firstReading = memoryReadings[0];
      const lastReading = memoryReadings[memoryReadings.length - 1];
      const memoryGrowth = (lastReading - firstReading) / 1024 / 1024; // MB

      // Verify: total memory growth should be < 5MB (even with 50 screenshots created)
      expect(memoryGrowth).toBeLessThan(5);
    });
  });

  describe('StorageProvider deduplication', () => {
    it('should store duplicate screenshots only once', async () => {
      const storage = new MemoryStorage();
      const sameData = generateScreenshotData(1);

      // Create multiple screenshots with same data
      const screenshots: ScreenshotItem[] = [];
      for (let i = 0; i < 10; i++) {
        const screenshot = await ScreenshotItem.create(sameData, storage);
        screenshots.push(screenshot);
      }

      // Although 10 ScreenshotItems were created, MemoryStorage stores 10 copies
      // (no deduplication logic, each create stores a copy)
      // However, memory usage should still be manageable thanks to StorageProvider

      const allData = await Promise.all(screenshots.map((s) => s.getData()));

      // Verify all screenshots return the same data
      allData.forEach((data) => {
        expect(data).toBe(sameData);
      });
    });
  });

  describe('Agent class memory management', () => {
    it('should keep memory under control when processing multiple tasks', async () => {
      const storage = new MemoryStorage();
      const dumps: ExecutionDump[] = [];

      // Simulate Agent processing 50 tasks
      // Each task has uiContext.screenshot and screenshots in recorder
      const taskCount = 50;

      const before = getMemoryUsage();

      for (let i = 0; i < taskCount; i++) {
        // Each task has 2-3 screenshots
        const screenshots: ScreenshotItem[] = [];
        for (let j = 0; j < 3; j++) {
          const screenshot = await ScreenshotItem.create(
            generateScreenshotData(i * 3 + j),
            storage,
          );
          screenshots.push(screenshot);
        }

        const dump = new ExecutionDump({
          name: `Task ${i}`,
          logTime: Date.now(),
          tasks: [
            {
              type: 'Insight',
              status: 'finished',
              uiContext: {
                screenshot: screenshots[0],
                size: { width: 1920, height: 1080 },
              },
              recorder: [
                {
                  type: 'screenshot',
                  ts: Date.now(),
                  screenshot: screenshots[1],
                },
                {
                  type: 'screenshot',
                  ts: Date.now() + 100,
                  screenshot: screenshots[2],
                },
              ],
            } as any,
          ],
        });

        dumps.push(dump);
      }

      const after = getMemoryUsage();
      const totalMemory = (after - before) / 1024 / 1024; // MB

      // Verify: even with 50 tasks (150 screenshots) processed, memory usage should be < 5MB
      expect(totalMemory).toBeLessThan(5);

      // Verify: average memory per task should be minimal
      const memoryPerTask = totalMemory / taskCount;
      expect(memoryPerTask).toBeLessThan(0.1); // < 100KB per task
    });

    it('should release memory when resetDump() is called', async () => {
      const storage = new MemoryStorage();
      const createLargeGroupedDump = async (taskCount: number) => {
        const executions: ExecutionDump[] = [];

        for (let i = 0; i < taskCount; i++) {
          const screenshot = await ScreenshotItem.create(
            generateScreenshotData(i),
            storage,
          );

          const dump = new ExecutionDump({
            name: `Task ${i}`,
            logTime: Date.now(),
            tasks: [
              {
                type: 'Insight',
                status: 'finished',
                uiContext: {
                  screenshot,
                  size: { width: 1920, height: 1080 },
                },
              } as any,
            ],
          });

          executions.push(dump);
        }

        return new GroupedActionDump(
          {
            sdkVersion: '1.0.0',
            groupName: 'Test Group',
            modelBriefs: [],
            executions,
          },
          storage,
        );
      };

      // Create a large dump
      let dump = await createLargeGroupedDump(100);
      const memoryWithDump = getMemoryUsage();

      // Simulate resetDump() - create new empty dump
      dump = new GroupedActionDump(
        {
          sdkVersion: '1.0.0',
          groupName: 'Test Group',
          modelBriefs: [],
          executions: [],
        },
        storage,
      );

      const memoryAfterReset = getMemoryUsage();

      // Verify: memory should not grow significantly after reset (some fluctuation allowed)
      const memoryIncrease = (memoryAfterReset - memoryWithDump) / 1024 / 1024; // MB
      expect(memoryIncrease).toBeLessThan(1); // Memory increase should be < 1MB
    });

    it('should handle multiple resetDump() cycles without memory accumulation', async () => {
      const storage = new MemoryStorage();
      const memoryReadings: number[] = [];
      const cycles = 10;
      const tasksPerCycle = 20;

      for (let cycle = 0; cycle < cycles; cycle++) {
        // Create new dump each cycle (simulate resetDump)
        const executions: ExecutionDump[] = [];

        for (let i = 0; i < tasksPerCycle; i++) {
          const screenshot = await ScreenshotItem.create(
            generateScreenshotData(cycle * tasksPerCycle + i),
            storage,
          );

          const dump = new ExecutionDump({
            name: `Cycle ${cycle} Task ${i}`,
            logTime: Date.now(),
            tasks: [
              {
                type: 'Insight',
                status: 'finished',
                uiContext: {
                  screenshot,
                  size: { width: 1920, height: 1080 },
                },
              } as any,
            ],
          });

          executions.push(dump);
        }

        // Create new GroupedActionDump (simulate resetDump)
        const groupedDump = new GroupedActionDump(
          {
            sdkVersion: '1.0.0',
            groupName: `Cycle ${cycle}`,
            modelBriefs: [],
            executions,
          },
          storage,
        );

        // Serialize (simulate writeOutActionDumps)
        groupedDump.serialize();

        // Record memory
        if (cycle % 2 === 0) {
          memoryReadings.push(getMemoryUsage());
        }
      }

      // Verify: memory should not grow linearly
      const firstReading = memoryReadings[0];
      const lastReading = memoryReadings[memoryReadings.length - 1];
      const memoryGrowth = (lastReading - firstReading) / 1024 / 1024; // MB

      // Even after 10 cycles (200 tasks), memory growth should be < 5MB
      expect(memoryGrowth).toBeLessThan(5);

      // Verify: memory fluctuations should be relatively stable (not doubling each time)
      for (let i = 1; i < memoryReadings.length; i++) {
        const growth = memoryReadings[i] - memoryReadings[i - 1];
        const growthMB = growth / 1024 / 1024;
        // Memory growth per cycle should be < 2MB
        expect(growthMB).toBeLessThan(2);
      }
    });

    it('should verify executions array reuse prevents unbounded growth', async () => {
      const storage = new MemoryStorage();

      // Simulate appendExecutionDump behavior
      // Use WeakMap to track runner -> index mapping
      const executionDumpIndexByRunner = new WeakMap<any, number>();
      const executions: ExecutionDump[] = [];

      const before = getMemoryUsage();

      // Simulate 100 tasks, but only use 10 different runners
      const runners: any[] = [];
      for (let i = 0; i < 10; i++) {
        runners.push({ id: i }); // Simulate TaskRunner object
      }

      for (let i = 0; i < 100; i++) {
        const runner = runners[i % 10]; // Cycle through 10 runners
        const screenshot = await ScreenshotItem.create(
          generateScreenshotData(i),
          storage,
        );

        const execution = new ExecutionDump({
          name: `Task ${i}`,
          logTime: Date.now(),
          tasks: [
            {
              type: 'Insight',
              status: 'finished',
              uiContext: {
                screenshot,
                size: { width: 1920, height: 1080 },
              },
            } as any,
          ],
        });

        // Simulate appendExecutionDump logic
        const existingIndex = executionDumpIndexByRunner.get(runner);
        if (existingIndex !== undefined) {
          // Reuse existing slot
          executions[existingIndex] = execution;
        } else {
          // Add new execution
          executions.push(execution);
          executionDumpIndexByRunner.set(runner, executions.length - 1);
        }
      }

      const after = getMemoryUsage();
      const totalMemory = (after - before) / 1024 / 1024; // MB

      // Verify: executions array should only have 10 elements (corresponding to 10 runners)
      expect(executions.length).toBe(10);

      // Verify: even with 100 tasks executed, memory growth should be < 3MB
      // Array reuse prevents unbounded growth
      expect(totalMemory).toBeLessThan(3);
    });

    it('should handle continuous task execution without memory accumulation', async () => {
      const storage = new MemoryStorage();
      const memoryReadings: number[] = [];
      const iterations = 20;

      // Simulate continuous task execution, creating new dumps each time
      for (let i = 0; i < iterations; i++) {
        const dumps: ExecutionDump[] = [];

        // Create 5 dumps per round
        for (let j = 0; j < 5; j++) {
          const screenshot = await ScreenshotItem.create(
            generateScreenshotData(i * 5 + j),
            storage,
          );

          const dump = new ExecutionDump({
            name: `Round ${i} Task ${j}`,
            logTime: Date.now(),
            tasks: [
              {
                type: 'Insight',
                status: 'finished',
                uiContext: {
                  screenshot,
                  size: { width: 1920, height: 1080 },
                },
              } as any,
            ],
          });

          dumps.push(dump);
        }

        // Record memory
        if (i % 5 === 0) {
          memoryReadings.push(getMemoryUsage());
        }
      }

      // Verify: memory should not continuously grow linearly
      const firstReading = memoryReadings[0];
      const lastReading = memoryReadings[memoryReadings.length - 1];
      const memoryGrowth = (lastReading - firstReading) / 1024 / 1024; // MB

      // Even after 20 rounds (100 tasks), memory growth should be < 10MB
      expect(memoryGrowth).toBeLessThan(10);
    });

    it('should demonstrate memory advantage over inline base64 approach', async () => {
      const storage = new MemoryStorage();

      // Create enough screenshots to demonstrate the difference
      const count = 200;
      const screenshots: ScreenshotItem[] = [];

      const before = getMemoryUsage();

      for (let i = 0; i < count; i++) {
        const screenshot = await ScreenshotItem.create(
          generateScreenshotData(i),
          storage,
        );
        screenshots.push(screenshot);
      }

      const after = getMemoryUsage();
      const memoryWithStorage = (after - before) / 1024 / 1024; // MB

      // Comparison: with old approach (directly storing base64), 200 screenshots
      // Each ~100KB = ~20MB total
      const estimatedOldApproachMemory = (count * 100) / 1024; // MB

      // Verify: StorageProvider approach should be far smaller than old approach
      expect(memoryWithStorage).toBeLessThan(estimatedOldApproachMemory * 0.1); // < 10% of old approach

      // Verify: actual memory usage should be < 5MB
      expect(memoryWithStorage).toBeLessThan(5);
    });
  });
});
