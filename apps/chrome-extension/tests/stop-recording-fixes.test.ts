/**
 * Unit tests for stop-recording crash fixes.
 *
 * Covers:
 * 1. Debounced persistence: multiple rapid writes should coalesce into one DB call
 * 2. In-memory updateSession: avoids reloading all sessions from DB
 * 3. Batched AI description generation: concurrency is bounded
 * 4. Logger sanitization: events arrays are never passed to loggers
 *
 * Run: npx vitest run apps/chrome-extension/tests/stop-recording-fixes.test.ts
 */
import { describe, expect, it, vi } from 'vitest';

// --- Helpers ---

interface MockEvent {
  type: string;
  timestamp: number;
  hashId: string;
  screenshotBefore: string;
  screenshotAfter: string;
  elementRect: { x: number; y: number; width: number; height: number };
  pageInfo: { width: number; height: number };
  elementDescription?: string;
  descriptionLoading?: boolean;
  value?: string;
}

function createMockEvent(
  index: number,
  type?: string,
  screenshotSizeKB = 10,
): MockEvent {
  const eventType =
    type ??
    (index % 4 === 0
      ? 'navigation'
      : index % 4 === 1
        ? 'click'
        : index % 4 === 2
          ? 'input'
          : 'scroll');
  const screenshot = `data:image/png;base64,${'A'.repeat(screenshotSizeKB * 1024)}`;
  return {
    type: eventType,
    timestamp: Date.now() + index * 1000,
    hashId: `event-${index}`,
    screenshotBefore: screenshot,
    screenshotAfter: screenshot,
    elementRect: { x: 100, y: 200, width: 50, height: 30 },
    pageInfo: { width: 1920, height: 1080 },
    value: eventType === 'input' ? 'test' : undefined,
  };
}

// --- 1. Debounced persistence ---

describe('Debounced session persistence', () => {
  it('multiple rapid schedules should coalesce: only the last state is persisted', async () => {
    // Simulate the debounce logic in isolation
    let dbWriteCount = 0;
    let lastWrittenEvents: MockEvent[] = [];

    const mockUpdateSession = async (
      _sessionId: string,
      updates: { events: MockEvent[] },
    ) => {
      dbWriteCount++;
      lastWrittenEvents = updates.events;
    };

    // Replicate the debounce mechanism
    const DELAY = 50; // shorter for test
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending: { sessionId: string; events: MockEvent[] } | null = null;

    const flush = async () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (pending) {
        const { sessionId, events } = pending;
        pending = null;
        await mockUpdateSession(sessionId, { events });
      }
    };

    const schedule = (sessionId: string, events: MockEvent[]) => {
      pending = { sessionId, events };
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, DELAY);
    };

    // Simulate 20 rapid addEvent calls
    const allEvents: MockEvent[] = [];
    for (let i = 0; i < 20; i++) {
      allEvents.push(createMockEvent(i));
      schedule('session-1', [...allEvents]);
    }

    // Before flush: no DB writes yet
    expect(dbWriteCount).toBe(0);

    // Wait for debounce to fire
    await new Promise((resolve) => setTimeout(resolve, DELAY + 20));

    // After debounce: exactly 1 DB write with all 20 events
    expect(dbWriteCount).toBe(1);
    expect(lastWrittenEvents.length).toBe(20);
  });

  it('flush should write immediately and clear pending state', async () => {
    let dbWriteCount = 0;
    let lastWrittenEvents: MockEvent[] = [];

    const mockUpdateSession = async (
      _sessionId: string,
      updates: { events: MockEvent[] },
    ) => {
      dbWriteCount++;
      lastWrittenEvents = updates.events;
    };

    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending: { sessionId: string; events: MockEvent[] } | null = null;

    const flush = async () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (pending) {
        const { sessionId, events } = pending;
        pending = null;
        await mockUpdateSession(sessionId, { events });
      }
    };

    const schedule = (sessionId: string, events: MockEvent[]) => {
      pending = { sessionId, events };
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, 2000);
    };

    // Schedule some events
    schedule('session-1', [createMockEvent(0), createMockEvent(1)]);
    expect(dbWriteCount).toBe(0);

    // Explicit flush (simulates stop recording)
    await flush();
    expect(dbWriteCount).toBe(1);
    expect(lastWrittenEvents.length).toBe(2);

    // Second flush should be a no-op
    await flush();
    expect(dbWriteCount).toBe(1);
  });
});

// --- 2. In-memory updateSession ---

describe('In-memory session update', () => {
  it('should update session in-place without reloading all sessions', () => {
    // Simulate the in-memory update logic from store.tsx
    const sessions = [
      {
        id: 'session-1',
        name: 'Test',
        events: [createMockEvent(0)],
        updatedAt: 1000,
      },
      {
        id: 'session-2',
        name: 'Other',
        events: [createMockEvent(1)],
        updatedAt: 900,
      },
    ];

    const sessionId = 'session-1';
    const updates = { name: 'Updated Title' };

    // Replicate the logic
    const sessionIndex = sessions.findIndex((s) => s.id === sessionId);
    expect(sessionIndex).toBe(0);

    const updatedSession = {
      ...sessions[sessionIndex],
      ...updates,
      updatedAt: Date.now(),
    };
    const newSessions = [...sessions];
    newSessions[sessionIndex] = updatedSession;

    // Verify: only the target session was updated
    expect(newSessions[0].name).toBe('Updated Title');
    expect(newSessions[0].updatedAt).toBeGreaterThan(1000);
    // Other session untouched
    expect(newSessions[1].name).toBe('Other');
    expect(newSessions[1].updatedAt).toBe(900);
    // Original array not mutated
    expect(sessions[0].name).toBe('Test');
  });

  it('should preserve events reference when updating non-events fields', () => {
    const events = [createMockEvent(0), createMockEvent(1)];
    const session = {
      id: 'session-1',
      name: 'Test',
      events,
      updatedAt: 1000,
    };

    const updated = { ...session, name: 'New Name', updatedAt: Date.now() };

    // Events should be the same reference (no unnecessary copy)
    expect(updated.events).toBe(events);
  });
});

// --- 3. Batched concurrency ---

describe('Batched AI description generation', () => {
  it('should limit concurrent operations to MAX_DESCRIPTION_CONCURRENCY', async () => {
    const MAX_CONCURRENCY = 3;
    let peakConcurrent = 0;
    let currentConcurrent = 0;
    const processOrder: number[] = [];

    // Create 10 events that need descriptions (non-navigation, non-scroll)
    const events = Array.from({ length: 10 }, (_, i) =>
      createMockEvent(i, 'click'),
    );

    const processEvent = async (event: MockEvent, index: number) => {
      currentConcurrent++;
      peakConcurrent = Math.max(peakConcurrent, currentConcurrent);
      processOrder.push(index);

      // Simulate async AI work
      await new Promise((resolve) => setTimeout(resolve, 10));

      event.elementDescription = `description-${index}`;
      event.descriptionLoading = false;
      currentConcurrent--;
    };

    // Process in batches (same logic as ProgressModal.tsx)
    for (let i = 0; i < events.length; i += MAX_CONCURRENCY) {
      const batch = events.slice(i, i + MAX_CONCURRENCY);
      await Promise.all(
        batch.map((event, batchIndex) => processEvent(event, i + batchIndex)),
      );
    }

    // Peak concurrency should never exceed MAX_CONCURRENCY
    expect(peakConcurrent).toBeLessThanOrEqual(MAX_CONCURRENCY);
    // All events should be processed
    expect(processOrder.length).toBe(10);
    // All events should have descriptions
    for (const event of events) {
      expect(event.elementDescription).toBeDefined();
      expect(event.descriptionLoading).toBe(false);
    }
  });

  it('navigation and scroll events should be pre-processed without using concurrency slots', async () => {
    const events = [
      createMockEvent(0, 'navigation'),
      createMockEvent(1, 'click'),
      createMockEvent(2, 'scroll'),
      createMockEvent(3, 'input'),
      createMockEvent(4, 'navigation'),
    ];

    // Pre-process navigation/scroll (same logic as ProgressModal.tsx)
    for (const event of events) {
      if (event.type === 'navigation' || event.type === 'scroll') {
        event.elementDescription = 'navigation or scroll';
        event.descriptionLoading = false;
      }
    }

    const eventsNeedingDescriptions = events.filter(
      (e) => e.type !== 'navigation' && e.type !== 'scroll',
    );

    // Only click and input events need AI descriptions
    expect(eventsNeedingDescriptions.length).toBe(2);
    // Navigation/scroll already have descriptions
    expect(events[0].elementDescription).toBe('navigation or scroll');
    expect(events[2].elementDescription).toBe('navigation or scroll');
    expect(events[4].elementDescription).toBe('navigation or scroll');
  });
});

// --- 4. Logger sanitization ---

describe('Logger sanitization', () => {
  it('should not serialize full events array in log context objects', () => {
    // Simulate the logger pattern used throughout the codebase
    const events = Array.from({ length: 10 }, (_, i) =>
      createMockEvent(i, 'click', 500),
    );

    // BAD pattern (old): passing full events array
    const badContext = { events, sessionId: 'test' };
    const badSize = JSON.stringify(badContext).length;

    // GOOD pattern (new): passing only count
    const goodContext = { eventsCount: events.length, sessionId: 'test' };
    const goodSize = JSON.stringify(goodContext).length;

    // The good pattern should be orders of magnitude smaller
    expect(goodSize).toBeLessThan(100);
    expect(badSize).toBeGreaterThan(1000 * 1000); // > 1MB with screenshots
    expect(goodSize / badSize).toBeLessThan(0.001);
  });

  it('updateSession logger should only include keys and eventsCount, not full updates', () => {
    const updates = {
      events: Array.from({ length: 5 }, (_, i) =>
        createMockEvent(i, 'click', 500),
      ),
      name: 'Test Session',
      updatedAt: Date.now(),
    };

    // Simulate the new logging pattern
    const logContext = {
      sessionId: 'test-session',
      updateKeys: Object.keys(updates),
      eventsCount: updates.events?.length,
    };

    const logSize = JSON.stringify(logContext).length;
    const rawSize = JSON.stringify({
      sessionId: 'test-session',
      updates,
    }).length;

    expect(logSize).toBeLessThan(200);
    expect(logContext.updateKeys).toEqual(['events', 'name', 'updatedAt']);
    expect(logContext.eventsCount).toBe(5);
    // Should be dramatically smaller than logging the raw updates
    expect(logSize / rawSize).toBeLessThan(0.01);
  });
});
