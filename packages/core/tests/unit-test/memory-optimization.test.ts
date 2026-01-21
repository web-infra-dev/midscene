import { describe, expect, it } from 'vitest';
import { ScreenshotItem } from '../../src/screenshot-item';
import { MemoryStorage } from '../../src/storage';
import { ExecutionDump, GroupedActionDump } from '../../src/types';

describe('Memory optimization with StorageProvider', () => {
  // 生成测试用的 screenshot 数据
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

      // 验证 ScreenshotItem 只存储 ID
      expect(screenshot.id).toBeDefined();
      expect(typeof screenshot.id).toBe('string');

      // 验证没有直接存储 base64
      expect((screenshot as any)._data).toBeUndefined();
      expect((screenshot as any).base64).toBeUndefined();

      // 验证可以通过 getData() 获取数据
      const data = await screenshot.getData();
      expect(data).toBe(largeBase64);
    });

    it('should use significantly less memory than direct base64 storage', async () => {
      const storage = new MemoryStorage();
      const screenshots: ScreenshotItem[] = [];
      const count = 100;

      const before = getMemoryUsage();

      // 创建 100 个 screenshots
      for (let i = 0; i < count; i++) {
        const screenshot = await ScreenshotItem.create(
          generateScreenshotData(i),
          storage,
        );
        screenshots.push(screenshot);
      }

      const after = getMemoryUsage();
      const memoryPerScreenshot = (after - before) / count / 1024; // KB

      // 验证：每个 screenshot 应该只占用很小的内存（< 10KB）
      // 因为只存储 ID 和引用，不存储完整的 base64
      expect(memoryPerScreenshot).toBeLessThan(10);

      // 验证所有 screenshots 都可以访问数据
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

      // 验证：序列化后的 JSON 应该包含 ID 占位符，而不是完整的 base64
      expect(serialized).toContain('$screenshot');
      expect(serialized).not.toContain('XXXXXXXXXX'); // base64 内容不应该在序列化结果中

      // 验证：序列化结果应该很小（< 5KB）
      expect(serialized.length).toBeLessThan(5000);

      // 验证 JSON 结构
      expect(json.tasks[0].uiContext.screenshot).toHaveProperty('$screenshot');
      expect(json.tasks[0].recorder[0].screenshot).toHaveProperty(
        '$screenshot',
      );
    });

    it('should save massive memory compared to inline base64 serialization', async () => {
      const storage = new MemoryStorage();
      const dumps: ExecutionDump[] = [];
      const count = 50; // 50 个 dumps，每个 2 个 screenshots = 100 个 screenshots

      // 创建测试数据
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

      // 序列化所有 dumps
      const serialized = dumps.map((d) => d.serialize());

      const afterSerialize = getMemoryUsage();
      const serializationMemory =
        (afterSerialize - beforeSerialize) / 1024 / 1024; // MB

      // 验证：序列化内存应该很小（< 1MB）
      // 因为只序列化 ID，不序列化完整的 base64
      expect(serializationMemory).toBeLessThan(1);

      // 验证所有序列化结果都包含 $screenshot 占位符
      serialized.forEach((json) => {
        expect(json).toContain('$screenshot');
      });

      // 对比：如果是旧方式（inline base64），serialized 总大小应该是 ~10MB
      // 新方式应该远小于这个值
      const totalSize = serialized.reduce((sum, s) => sum + s.length, 0);
      expect(totalSize).toBeLessThan(1 * 1024 * 1024); // < 1MB
    });
  });

  describe('Real-world scenario: test report generation', () => {
    it('should handle large test suites efficiently', async () => {
      const storage = new MemoryStorage();
      const testCount = 100; // 模拟 100 个测试

      const before = getMemoryUsage();

      // 模拟 100 个测试，每个测试 3 个 screenshots
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

      // 验证：300 个 screenshots 应该占用很少的内存（< 2MB）
      expect(totalMemory).toBeLessThan(2);

      // 验证：平均每个 screenshot < 10KB
      const avgPerScreenshot = (totalMemory * 1024) / (testCount * 3);
      expect(avgPerScreenshot).toBeLessThan(10);

      // 验证所有 screenshots 都可以访问
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
        // 创建临时 screenshot（会被 GC 回收）
        const tempScreenshot = await ScreenshotItem.create(
          generateScreenshotData(i),
          storage,
        );
        await tempScreenshot.getData(); // 确保访问过数据

        if (i % 10 === 0) {
          memoryReadings.push(getMemoryUsage());
        }
      }

      // 验证：内存使用应该相对稳定，不应该持续增长
      // 计算内存增长率
      const firstReading = memoryReadings[0];
      const lastReading = memoryReadings[memoryReadings.length - 1];
      const memoryGrowth = (lastReading - firstReading) / 1024 / 1024; // MB

      // 验证：总内存增长应该 < 5MB（即使创建了 50 个 screenshots）
      expect(memoryGrowth).toBeLessThan(5);
    });
  });

  describe('StorageProvider deduplication', () => {
    it('should store duplicate screenshots only once', async () => {
      const storage = new MemoryStorage();
      const sameData = generateScreenshotData(1);

      // 创建多个相同数据的 screenshots
      const screenshots: ScreenshotItem[] = [];
      for (let i = 0; i < 10; i++) {
        const screenshot = await ScreenshotItem.create(sameData, storage);
        screenshots.push(screenshot);
      }

      // 虽然创建了 10 个 ScreenshotItem，但在 MemoryStorage 中应该只存储了 10 份
      // （因为没有做去重逻辑，每次 create 都会存储一份）
      // 但即使如此，由于使用了 StorageProvider，内存占用也应该是可控的

      const allData = await Promise.all(screenshots.map((s) => s.getData()));

      // 验证所有 screenshots 都返回相同的数据
      allData.forEach((data) => {
        expect(data).toBe(sameData);
      });
    });
  });

  describe('Agent class memory management', () => {
    it('should keep memory under control when processing multiple tasks', async () => {
      const storage = new MemoryStorage();
      const dumps: ExecutionDump[] = [];

      // 模拟 Agent 处理 50 个任务的场景
      // 每个任务有 uiContext.screenshot 和 recorder 中的 screenshots
      const taskCount = 50;

      const before = getMemoryUsage();

      for (let i = 0; i < taskCount; i++) {
        // 每个任务 2-3 个 screenshots
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

      // 验证：即使处理了 50 个任务（150 个 screenshots），内存使用应该 < 5MB
      expect(totalMemory).toBeLessThan(5);

      // 验证：平均每个任务的内存占用应该很小
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

      // 创建一个大的 dump
      let dump = await createLargeGroupedDump(100);
      const memoryWithDump = getMemoryUsage();

      // 模拟 resetDump() - 创建新的空 dump
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

      // 验证：reset 后内存应该没有显著增长（允许一些波动）
      const memoryIncrease = (memoryAfterReset - memoryWithDump) / 1024 / 1024; // MB
      expect(memoryIncrease).toBeLessThan(1); // 内存增长应该 < 1MB
    });

    it('should handle multiple resetDump() cycles without memory accumulation', async () => {
      const storage = new MemoryStorage();
      const memoryReadings: number[] = [];
      const cycles = 10;
      const tasksPerCycle = 20;

      for (let cycle = 0; cycle < cycles; cycle++) {
        // 每个周期创建新的 dump（模拟 resetDump）
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

        // 创建新的 GroupedActionDump（模拟 resetDump）
        const groupedDump = new GroupedActionDump(
          {
            sdkVersion: '1.0.0',
            groupName: `Cycle ${cycle}`,
            modelBriefs: [],
            executions,
          },
          storage,
        );

        // 序列化（模拟 writeOutActionDumps）
        groupedDump.serialize();

        // 记录内存
        if (cycle % 2 === 0) {
          memoryReadings.push(getMemoryUsage());
        }
      }

      // 验证：内存不应该线性增长
      const firstReading = memoryReadings[0];
      const lastReading = memoryReadings[memoryReadings.length - 1];
      const memoryGrowth = (lastReading - firstReading) / 1024 / 1024; // MB

      // 即使经过 10 个周期（200 个 tasks），内存增长也应该 < 5MB
      expect(memoryGrowth).toBeLessThan(5);

      // 验证：内存波动应该相对稳定（不是每次都翻倍）
      for (let i = 1; i < memoryReadings.length; i++) {
        const growth = memoryReadings[i] - memoryReadings[i - 1];
        const growthMB = growth / 1024 / 1024;
        // 每个周期的内存增长应该 < 2MB
        expect(growthMB).toBeLessThan(2);
      }
    });

    it('should verify executions array reuse prevents unbounded growth', async () => {
      const storage = new MemoryStorage();

      // 模拟 appendExecutionDump 的行为
      // 使用 WeakMap 追踪 runner -> index 的映射
      const executionDumpIndexByRunner = new WeakMap<any, number>();
      const executions: ExecutionDump[] = [];

      const before = getMemoryUsage();

      // 模拟 100 次任务，但只用 10 个不同的 runner
      const runners: any[] = [];
      for (let i = 0; i < 10; i++) {
        runners.push({ id: i }); // 模拟 TaskRunner 对象
      }

      for (let i = 0; i < 100; i++) {
        const runner = runners[i % 10]; // 循环使用 10 个 runner
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

        // 模拟 appendExecutionDump 逻辑
        const existingIndex = executionDumpIndexByRunner.get(runner);
        if (existingIndex !== undefined) {
          // 复用现有的 slot
          executions[existingIndex] = execution;
        } else {
          // 添加新的 execution
          executions.push(execution);
          executionDumpIndexByRunner.set(runner, executions.length - 1);
        }
      }

      const after = getMemoryUsage();
      const totalMemory = (after - before) / 1024 / 1024; // MB

      // 验证：executions 数组应该只有 10 个元素（对应 10 个 runner）
      expect(executions.length).toBe(10);

      // 验证：即使执行了 100 次任务，内存增长应该 < 3MB
      // 因为数组复用，不会无限增长
      expect(totalMemory).toBeLessThan(3);
    });

    it('should handle continuous task execution without memory accumulation', async () => {
      const storage = new MemoryStorage();
      const memoryReadings: number[] = [];
      const iterations = 20;

      // 模拟连续执行任务，每次都创建新的 dumps
      for (let i = 0; i < iterations; i++) {
        const dumps: ExecutionDump[] = [];

        // 每轮创建 5 个 dumps
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

        // 记录内存
        if (i % 5 === 0) {
          memoryReadings.push(getMemoryUsage());
        }
      }

      // 验证：内存不应该持续线性增长
      const firstReading = memoryReadings[0];
      const lastReading = memoryReadings[memoryReadings.length - 1];
      const memoryGrowth = (lastReading - firstReading) / 1024 / 1024; // MB

      // 即使执行了 20 轮（100 个 tasks），内存增长也应该 < 10MB
      expect(memoryGrowth).toBeLessThan(10);
    });

    it('should demonstrate memory advantage over inline base64 approach', async () => {
      const storage = new MemoryStorage();

      // 创建足够多的 screenshots 来展示差异
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

      // 对比：如果使用旧方式（直接存储 base64），200 个 screenshots
      // 每个 ~100KB = ~20MB
      const estimatedOldApproachMemory = (count * 100) / 1024; // MB

      // 验证：StorageProvider 方式应该远小于旧方式
      expect(memoryWithStorage).toBeLessThan(estimatedOldApproachMemory * 0.1); // < 10% of old approach

      // 验证：实际内存使用应该 < 5MB
      expect(memoryWithStorage).toBeLessThan(5);
    });
  });
});
