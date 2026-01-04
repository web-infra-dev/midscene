import { Agent } from '@/agent';
import {
  MIDSCENE_MODEL_API_KEY,
  MIDSCENE_MODEL_BASE_URL,
  MIDSCENE_MODEL_FAMILY,
  MIDSCENE_MODEL_NAME,
  MIDSCENE_REPLANNING_CYCLE_LIMIT,
  globalConfigManager,
} from '@midscene/shared/env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const defaultModelConfig = {
  [MIDSCENE_MODEL_NAME]: 'qwen2.5-vl-max',
  [MIDSCENE_MODEL_API_KEY]: 'test-key',
  [MIDSCENE_MODEL_BASE_URL]: 'https://api.sample.com/v1',
  [MIDSCENE_MODEL_FAMILY]: 'qwen2.5-vl' as const,
};

const createMockInterface = () =>
  ({
    interfaceType: 'puppeteer',
    actionSpace: () => [],
  }) as any;

describe('Agent replanning cycle limit', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    // Clear any previous overrides to ensure clean test state
    // Note: We need to access the private override property and reset it
    (globalConfigManager as any).override = undefined;
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    // Clear overrides after each test
    (globalConfigManager as any).override = undefined;
  });

  it('should use default replanning cycle limit when not configured', () => {
    const mockInterface = createMockInterface();
    const agent = new Agent(mockInterface, {
      modelConfig: defaultModelConfig,
    });

    // Access private method for testing
    const limit = (agent as any).resolveReplanningCycleLimit(
      (agent as any).modelConfigManager.getModelConfig('planning'),
    );

    // Default limit for non-vlm-ui-tars models is 20
    expect(limit).toBe(20);
  });

  it('should use replanning cycle limit from opts', () => {
    const mockInterface = createMockInterface();
    const agent = new Agent(mockInterface, {
      modelConfig: defaultModelConfig,
      replanningCycleLimit: 50,
    });

    const limit = (agent as any).resolveReplanningCycleLimit(
      (agent as any).modelConfigManager.getModelConfig('planning'),
    );

    expect(limit).toBe(50);
  });

  it('should read replanning cycle limit from environment variable at construction time', () => {
    vi.stubEnv(MIDSCENE_REPLANNING_CYCLE_LIMIT, '30');

    const mockInterface = createMockInterface();
    const agent = new Agent(mockInterface, {
      modelConfig: defaultModelConfig,
    });

    const limit = (agent as any).resolveReplanningCycleLimit(
      (agent as any).modelConfigManager.getModelConfig('planning'),
    );

    expect(limit).toBe(30);
  });

  it('should read replanning cycle limit dynamically from overrideAIConfig for playground scenario', () => {
    // Simulate playground scenario: Agent is created first without env config
    const mockInterface = createMockInterface();
    const agent = new Agent(mockInterface, {
      modelConfig: defaultModelConfig,
    });

    // Initially should use default
    let limit = (agent as any).resolveReplanningCycleLimit(
      (agent as any).modelConfigManager.getModelConfig('planning'),
    );
    expect(limit).toBe(20);

    // Simulate user setting env config in playground UI
    globalConfigManager.overrideAIConfig({
      [MIDSCENE_REPLANNING_CYCLE_LIMIT]: '35',
    });

    // Should now read the new value dynamically
    limit = (agent as any).resolveReplanningCycleLimit(
      (agent as any).modelConfigManager.getModelConfig('planning'),
    );
    expect(limit).toBe(35);
  });

  it('should prioritize opts over environment variable', () => {
    vi.stubEnv(MIDSCENE_REPLANNING_CYCLE_LIMIT, '30');

    const mockInterface = createMockInterface();
    const agent = new Agent(mockInterface, {
      modelConfig: defaultModelConfig,
      replanningCycleLimit: 50,
    });

    const limit = (agent as any).resolveReplanningCycleLimit(
      (agent as any).modelConfigManager.getModelConfig('planning'),
    );

    // opts takes precedence
    expect(limit).toBe(50);
  });

  it('should prioritize opts over overrideAIConfig', () => {
    const mockInterface = createMockInterface();
    const agent = new Agent(mockInterface, {
      modelConfig: defaultModelConfig,
      replanningCycleLimit: 50,
    });

    // Set via overrideAIConfig
    globalConfigManager.overrideAIConfig({
      [MIDSCENE_REPLANNING_CYCLE_LIMIT]: '35',
    });

    const limit = (agent as any).resolveReplanningCycleLimit(
      (agent as any).modelConfigManager.getModelConfig('planning'),
    );

    // opts still takes precedence
    expect(limit).toBe(50);
  });

  it('should use higher default limit for vlm-ui-tars model', () => {
    const mockInterface = createMockInterface();
    const agent = new Agent(mockInterface, {
      modelConfig: {
        ...defaultModelConfig,
        [MIDSCENE_MODEL_FAMILY]: 'vlm-ui-tars',
      },
    });

    const limit = (agent as any).resolveReplanningCycleLimit(
      (agent as any).modelConfigManager.getModelConfig('planning'),
    );

    // Default limit for vlm-ui-tars is 40
    expect(limit).toBe(40);
  });

  it('should handle invalid environment variable value', () => {
    vi.stubEnv(MIDSCENE_REPLANNING_CYCLE_LIMIT, 'invalid');

    const mockInterface = createMockInterface();
    const agent = new Agent(mockInterface, {
      modelConfig: defaultModelConfig,
    });

    const limit = (agent as any).resolveReplanningCycleLimit(
      (agent as any).modelConfigManager.getModelConfig('planning'),
    );

    // Should fall back to default when env value is invalid
    expect(limit).toBe(20);
  });

  it('should handle empty environment variable value', () => {
    vi.stubEnv(MIDSCENE_REPLANNING_CYCLE_LIMIT, '');

    const mockInterface = createMockInterface();
    const agent = new Agent(mockInterface, {
      modelConfig: defaultModelConfig,
    });

    const limit = (agent as any).resolveReplanningCycleLimit(
      (agent as any).modelConfigManager.getModelConfig('planning'),
    );

    // Empty string should be ignored and fall back to default
    expect(limit).toBe(20);
  });
});
