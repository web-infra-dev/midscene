import { PlaywrightAiFixture } from '@/playwright/ai-fixture';
import type { TestInfo } from '@playwright/test';
import { describe, expect, it } from 'vitest';

// Mock TestInfo
const createMockTestInfo = (testId = 'test-123'): TestInfo =>
  ({
    testId,
    titlePath: ['Test Suite', 'Test Case'],
    retry: 0,
    annotations: [],
  }) as TestInfo;

describe('PlaywrightAiFixture Cache Configuration', () => {
  it('should create fixture with cache: false configuration', () => {
    const fixture = PlaywrightAiFixture({
      cache: false,
    });

    expect(fixture).toBeDefined();
    expect(fixture.agentForPage).toBeDefined();
  });

  it('should create fixture with cache: true configuration', () => {
    const fixture = PlaywrightAiFixture({
      cache: true,
    });

    expect(fixture).toBeDefined();
    expect(fixture.agentForPage).toBeDefined();
  });

  it('should create fixture with cache object configuration', () => {
    const fixture = PlaywrightAiFixture({
      cache: { id: 'custom-cache-id' },
    });

    expect(fixture).toBeDefined();
    expect(fixture.agentForPage).toBeDefined();
  });

  it('should create fixture with cache strategy configuration', () => {
    const fixture = PlaywrightAiFixture({
      cache: { strategy: 'read-only', id: 'readonly-cache' },
    });

    expect(fixture).toBeDefined();
    expect(fixture.agentForPage).toBeDefined();
  });

  it('should create fixture with no cache configuration', () => {
    const fixture = PlaywrightAiFixture();

    expect(fixture).toBeDefined();
    expect(fixture.agentForPage).toBeDefined();
  });
});
