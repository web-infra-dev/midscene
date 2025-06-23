import { sleep } from '@midscene/core/utils';
import { expect } from '@playwright/test';
import { test } from './fixture';

test.beforeEach(async ({ page }) => {
  await page.goto('https://cn.bing.com');
});

// Create a large string of approximately 100MB
const generateLargeString = (sizeInMB: number, identifier: string) => {
  const approximateCharsPer1MB = 1024 * 1024; // 1MB in characters
  const totalChars = approximateCharsPer1MB * sizeInMB;

  // Create a basic JSON structure with a very large string
  const baseObj = {
    id: identifier,
    timestamp: new Date().toISOString(),
    data: 'X'.repeat(totalChars - 100), // subtract a small amount for the JSON structure
  };

  return JSON.stringify(baseObj);
};

test.describe('memory release', () => {
  let initialHeapMB: number;
  let initialHeapTotalMB: number;
  let initialRssMB: number;
  let peakHeapMB = 0; // Record peak memory usage throughout the test process
  let peakHeapTotalMB = 0; // Record peak heap total memory throughout the test process
  let peakRssMB = 0; // Record peak RSS memory throughout the test process
  const testMemoryHistory: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
  }[] = []; // Record memory after each test
  let testCount = 0; // Test counter

  test.beforeAll(() => {
    // Record initial memory values
    const initialMemory = process.memoryUsage();
    initialHeapMB = initialMemory.heapUsed / 1024 / 1024;
    initialHeapTotalMB = initialMemory.heapTotal / 1024 / 1024;
    initialRssMB = initialMemory.rss / 1024 / 1024;
    console.log(
      `Initial memory: heapUsed=${initialHeapMB.toFixed(2)}MB, heapTotal=${initialHeapTotalMB.toFixed(2)}MB, rss=${initialRssMB.toFixed(2)}MB`,
    );
  });

  test.afterEach(() => {
    // Record current memory after each test
    const currentMemory = process.memoryUsage();
    const currentHeapMB = currentMemory.heapUsed / 1024 / 1024;
    const currentHeapTotalMB = currentMemory.heapTotal / 1024 / 1024;
    const currentRssMB = currentMemory.rss / 1024 / 1024;
    testCount++;

    // Update global peaks
    if (currentHeapMB > peakHeapMB) {
      peakHeapMB = currentHeapMB;
    }
    if (currentHeapTotalMB > peakHeapTotalMB) {
      peakHeapTotalMB = currentHeapTotalMB;
    }
    if (currentRssMB > peakRssMB) {
      peakRssMB = currentRssMB;
    }

    // Record memory after each test
    testMemoryHistory.push({
      heapUsed: currentHeapMB,
      heapTotal: currentHeapTotalMB,
      rss: currentRssMB,
    });

    // Calculate memory changes compared to previous test
    const previousMemory =
      testCount > 1 ? testMemoryHistory[testCount - 2] : null;
    if (previousMemory) {
      const heapUsedDiff = currentHeapMB - previousMemory.heapUsed;
      const heapTotalDiff = currentHeapTotalMB - previousMemory.heapTotal;
      const rssDiff = currentRssMB - previousMemory.rss;

      console.log(
        `After test ${testCount}: heapUsed=${currentHeapMB.toFixed(2)}MB (${heapUsedDiff > 0 ? '+' : ''}${heapUsedDiff.toFixed(2)}MB), heapTotal=${currentHeapTotalMB.toFixed(2)}MB (${heapTotalDiff > 0 ? '+' : ''}${heapTotalDiff.toFixed(2)}MB), rss=${currentRssMB.toFixed(2)}MB (${rssDiff > 0 ? '+' : ''}${rssDiff.toFixed(2)}MB)`,
      );

      // Analyze memory release status
      if (rssDiff < -50) {
        console.log(`  ✅ Memory released: ${Math.abs(rssDiff).toFixed(2)}MB`);
      } else if (rssDiff > 50) {
        console.log(`  ❌ Memory increased: +${rssDiff.toFixed(2)}MB`);
      } else {
        console.log(`  ⚠️  Memory stable: ${rssDiff.toFixed(2)}MB`);
      }
    } else {
      console.log(
        `After test ${testCount}: heapUsed=${currentHeapMB.toFixed(2)}MB, heapTotal=${currentHeapTotalMB.toFixed(2)}MB, rss=${currentRssMB.toFixed(2)}MB`,
      );
    }
  });

  test.afterAll(async () => {
    // Get final memory values
    const finalMemory = process.memoryUsage();
    const finalHeapMB = finalMemory.heapUsed / 1024 / 1024;
    const finalHeapTotalMB = finalMemory.heapTotal / 1024 / 1024;
    const finalRssMB = finalMemory.rss / 1024 / 1024;

    console.log('\nMemory Summary:');
    console.log(
      `- Initial     : heapUsed=${initialHeapMB.toFixed(2)}MB, heapTotal=${initialHeapTotalMB.toFixed(2)}MB, rss=${initialRssMB.toFixed(2)}MB`,
    );
    console.log(
      `- Peak        : heapUsed=${peakHeapMB.toFixed(2)}MB, heapTotal=${peakHeapTotalMB.toFixed(2)}MB, rss=${peakRssMB.toFixed(2)}MB`,
    );
    console.log(
      `- Final       : heapUsed=${finalHeapMB.toFixed(2)}MB, heapTotal=${finalHeapTotalMB.toFixed(2)}MB, rss=${finalRssMB.toFixed(2)}MB`,
    );
    console.log('\nMemory History:');
    testMemoryHistory.forEach((memory, index) => {
      console.log(
        `  Test ${index + 1}: heapUsed=${memory.heapUsed.toFixed(2)}MB, heapTotal=${memory.heapTotal.toFixed(2)}MB, rss=${memory.rss.toFixed(2)}MB`,
      );
    });

    const averageRssMB =
      testMemoryHistory.reduce((sum, memory) => sum + memory.rss, 0) /
      testMemoryHistory.length;
    expect(averageRssMB).toBeLessThan(1500);

    await sleep(5000);
  });

  for (let i = 0; i < 20; i++) {
    test(`test memory release ${i + 1}`, async ({
      page,
      ai,
      agentForPage,
      aiAssert,
      aiQuery,
    }) => {
      const agent = await agentForPage(page);

      await agent.logScreenshot(generateLargeString(100, 'large-report'));
      await sleep(5000);
    });
  }
});
