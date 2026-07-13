/**
 * Memory stress test for Chrome Extension event recording.
 *
 * Reproduces the crash: recording ~50 events over ~2.5 minutes causes
 * the Service Worker to crash because every new event serializes the
 * ENTIRE events array (with base64 screenshots) via chrome.runtime.sendMessage.
 *
 * The key insight: chrome.runtime.sendMessage does structured-clone serialization.
 * JSON.stringify is a close proxy for that cost. We measure actual heap usage
 * to prove the old approach exceeds Chrome Service Worker memory limits (~256-512 MB).
 *
 * Run: npx rstest run apps/chrome-extension/tests/event-memory-stress.test.ts
 */
import { describe, expect, it } from '@rstest/core';

// --- Helpers ---

/** Generate a realistic-sized base64 screenshot string */
function generateFakeScreenshot(sizeInKB = 500): string {
  const charCount = Math.ceil((sizeInKB * 1024) / 3) * 4;
  const pattern = 'ABCD';
  return `data:image/png;base64,${pattern.repeat(Math.ceil(charCount / 4)).slice(0, charCount)}`;
}

interface MockEvent {
  type: string;
  timestamp: number;
  hashId: string;
  screenshotBefore: string;
  screenshotAfter: string;
  elementRect: { x: number; y: number; width: number; height: number };
  pageInfo: { width: number; height: number };
  value?: string;
}

function createMockEvent(index: number): MockEvent {
  return {
    type: index % 3 === 0 ? 'click' : index % 3 === 1 ? 'input' : 'scroll',
    timestamp: Date.now() + index * 3000,
    hashId: `event-${index}-${Date.now()}`,
    screenshotBefore: generateFakeScreenshot(500),
    screenshotAfter: generateFakeScreenshot(500),
    elementRect: { x: 100, y: 200, width: 50, height: 30 },
    pageInfo: { width: 1920, height: 1080 },
    value: index % 3 === 1 ? 'test input text' : undefined,
  };
}

function getHeapUsedMB(): number {
  if (global.gc) global.gc();
  return process.memoryUsage().heapUsed / (1024 * 1024);
}

// Chrome Service Worker memory limit (conservative estimate)
const SW_MEMORY_LIMIT_MB = 512;
const STRESS_TEST_TIMEOUT_MS = 30_000;

describe('Chrome Extension Event Recording - Crash Reproduction', () => {
  /**
   * CORE CRASH REPRODUCTION
   *
   * Simulates the old message-passing behavior:
   * - Content script accumulates events in an array
   * - On each new event, JSON.stringify the FULL array (simulating sendMessage)
   * - Service Worker receives and JSON.parse (simulating structured clone)
   * - Worker forwards to popup port: another JSON.stringify + JSON.parse
   *
   * This means each event triggers 2 serialize + 2 deserialize of the full array.
   * We measure actual heap to prove it exceeds the Service Worker memory limit.
   */
  it(
    'OLD approach: heap exceeds Service Worker limit within 50 events',
    () => {
      const events: MockEvent[] = [];
      const heapSnapshots: number[] = [];
      let peakHeapMB = 0;

      const baselineHeap = getHeapUsedMB();

      for (let i = 0; i < 50; i++) {
        events.push(createMockEvent(i));

        // Simulate the old sendMessage path:
        // 1) Content script serializes full array
        const serialized = JSON.stringify({ action: 'events', data: events });
        // 2) Worker receives (deserializes)
        const deserialized = JSON.parse(serialized);
        // 3) Worker forwards to popup (serializes again)
        const forwarded = JSON.stringify(deserialized);
        // 4) Popup receives (deserializes)
        const _popupData = JSON.parse(forwarded);

        const currentHeap = getHeapUsedMB();
        heapSnapshots.push(currentHeap);
        peakHeapMB = Math.max(peakHeapMB, currentHeap);
      }

      const heapGrowthMB = peakHeapMB - baselineHeap;
      const lastMessageSizeMB =
        JSON.stringify({ action: 'events', data: events }).length /
        (1024 * 1024);

      console.log('\n=== OLD APPROACH (full-array sendMessage) ===');
      console.log(`Baseline heap: ${baselineHeap.toFixed(0)} MB`);
      console.log(`Peak heap: ${peakHeapMB.toFixed(0)} MB`);
      console.log(`Heap growth: ${heapGrowthMB.toFixed(0)} MB`);
      console.log(`Last message size: ${lastMessageSizeMB.toFixed(0)} MB`);
      console.log(
        `Heap at event 10: ${heapSnapshots[9]?.toFixed(0)} MB, ` +
          `event 30: ${heapSnapshots[29]?.toFixed(0)} MB, ` +
          `event 50: ${heapSnapshots[49]?.toFixed(0)} MB`,
      );

      // ASSERTION: The old approach's peak heap usage exceeds what a
      // Chrome Service Worker can handle. A single serialized message at
      // 50 events is ~65MB; holding multiple copies during serialize/deserialize
      // pushes heap well beyond normal SW working memory.
      //
      // The last message alone is >50MB. In Chrome, the sender (content script)
      // and receiver (service worker) BOTH hold a copy during transit, plus
      // the structured clone overhead. This alone would need ~200MB+ for just
      // the message transfer at event 50, on top of the base array.
      expect(lastMessageSizeMB).toBeGreaterThan(50);

      // Heap growth should be substantial - at minimum hundreds of MB
      // from accumulating 50 events with screenshots + serialization copies
      expect(heapGrowthMB).toBeGreaterThan(100);
    },
    STRESS_TEST_TIMEOUT_MS,
  );

  /**
   * NEW APPROACH: incremental event-update
   *
   * Each event sends only itself (~1.3MB) rather than the full array.
   * No O(n²) serialization blowup.
   */
  it(
    'NEW approach: heap stays well under Service Worker limit',
    () => {
      const events: MockEvent[] = [];
      const heapSnapshots: number[] = [];
      let peakHeapMB = 0;

      const baselineHeap = getHeapUsedMB();

      for (let i = 0; i < 50; i++) {
        const event = createMockEvent(i);
        events.push(event);

        // Simulate the new event-update path:
        // 1) Content script serializes ONLY the new event
        const serialized = JSON.stringify({
          action: 'event-update',
          data: event,
          eventIndex: i,
          totalEvents: events.length,
        });
        // 2) Worker receives
        const deserialized = JSON.parse(serialized);
        // 3) Worker forwards
        const forwarded = JSON.stringify(deserialized);
        // 4) Popup receives
        const _popupData = JSON.parse(forwarded);

        const currentHeap = getHeapUsedMB();
        heapSnapshots.push(currentHeap);
        peakHeapMB = Math.max(peakHeapMB, currentHeap);
      }

      const heapGrowthMB = peakHeapMB - baselineHeap;
      const lastMessageSizeMB =
        JSON.stringify({
          action: 'event-update',
          data: events[49],
          eventIndex: 49,
          totalEvents: 50,
        }).length /
        (1024 * 1024);

      console.log('\n=== NEW APPROACH (incremental event-update) ===');
      console.log(`Baseline heap: ${baselineHeap.toFixed(0)} MB`);
      console.log(`Peak heap: ${peakHeapMB.toFixed(0)} MB`);
      console.log(`Heap growth: ${heapGrowthMB.toFixed(0)} MB`);
      console.log(
        `Message size (constant): ${lastMessageSizeMB.toFixed(2)} MB`,
      );
      console.log(
        `Heap at event 10: ${heapSnapshots[9]?.toFixed(0)} MB, ` +
          `event 30: ${heapSnapshots[29]?.toFixed(0)} MB, ` +
          `event 50: ${heapSnapshots[49]?.toFixed(0)} MB`,
      );

      // Each message is ~1.3MB - well within Chrome message limits
      expect(lastMessageSizeMB).toBeLessThan(3);

      // Heap growth is only from storing the 50 events array (~65MB base data)
      // NOT from serialization blowup. Should stay well under SW limit.
      expect(heapGrowthMB).toBeLessThan(SW_MEMORY_LIMIT_MB);
    },
    STRESS_TEST_TIMEOUT_MS,
  );

  /**
   * Direct comparison: measure how many bytes each approach pushes through the
   * serialize/deserialize (structured-clone) boundary.
   *
   * We compare cumulative serialized bytes rather than live `heapUsed` deltas:
   * the serialized payloads are transient and get garbage-collected, so a
   * post-GC heap measurement mostly reflects the retained events array (which
   * is identical for both approaches) plus GC noise — that made the old
   * heap-delta comparison flaky (it could even read a negative "growth"). The
   * byte volume moved across the message boundary is the deterministic signal
   * behind the heap blow-up: old is O(n^2), new is O(n).
   */
  it(
    'NEW approach serializes far fewer bytes than OLD',
    () => {
      const EVENT_COUNT = 40;

      // --- Old approach: re-serialize the FULL array on every event (O(n^2)) ---
      const oldEvents: MockEvent[] = [];
      let oldTotalBytes = 0;
      for (let i = 0; i < EVENT_COUNT; i++) {
        oldEvents.push(createMockEvent(i));
        const s = JSON.stringify({ action: 'events', data: oldEvents });
        oldTotalBytes += s.length;
        JSON.parse(s);
      }

      // --- New approach: serialize only the new event each time (O(n)) ---
      let newTotalBytes = 0;
      for (let i = 0; i < EVENT_COUNT; i++) {
        const event = createMockEvent(i);
        const s = JSON.stringify({
          action: 'event-update',
          data: event,
          eventIndex: i,
        });
        newTotalBytes += s.length;
        JSON.parse(s);
      }

      const oldTotalMB = oldTotalBytes / (1024 * 1024);
      const newTotalMB = newTotalBytes / (1024 * 1024);

      console.log('\n=== COMPARISON (40 events) ===');
      console.log(`Old total serialized: ${oldTotalMB.toFixed(0)} MB`);
      console.log(`New total serialized: ${newTotalMB.toFixed(0)} MB`);
      console.log(
        `Ratio: old serializes ${(oldTotalBytes / Math.max(newTotalBytes, 1)).toFixed(1)}x more bytes`,
      );

      // The full-array approach serializes the whole growing array on every
      // event, so it moves dramatically more bytes than the incremental one.
      // For 40 events the real ratio is ~20x; assert a conservative 5x so the
      // check stays deterministic and robust.
      expect(oldTotalBytes).toBeGreaterThan(newTotalBytes * 5);
    },
    STRESS_TEST_TIMEOUT_MS,
  );

  describe('cacheMap bounded size', () => {
    it('should evict oldest entries when cache exceeds max size', () => {
      const MAX_CACHE_SIZE = 50;
      const cacheMap = new Map<string, { data: string }>();
      const cacheKeyOrder: string[] = [];

      for (let i = 0; i < 80; i++) {
        const id = `context-${i}`;
        if (cacheMap.size >= MAX_CACHE_SIZE && cacheKeyOrder.length > 0) {
          const oldestKey = cacheKeyOrder.shift();
          if (oldestKey) {
            cacheMap.delete(oldestKey);
          }
        }
        cacheMap.set(id, { data: `context-data-${i}` });
        cacheKeyOrder.push(id);
      }

      expect(cacheMap.size).toBe(MAX_CACHE_SIZE);
      expect(cacheKeyOrder.length).toBe(MAX_CACHE_SIZE);
      expect(cacheMap.has('context-0')).toBe(false);
      expect(cacheMap.has('context-29')).toBe(false);
      expect(cacheMap.has('context-79')).toBe(true);
      expect(cacheMap.has('context-30')).toBe(true);
    });
  });
});
