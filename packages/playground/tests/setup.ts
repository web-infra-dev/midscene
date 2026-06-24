import * as coreAgentActual from '@midscene/core/agent' with {
  rstest: 'importActual',
};
import * as coreAiModelActual from '@midscene/core/ai-model' with {
  rstest: 'importActual',
};
import * as sharedEnvActual from '@midscene/shared/env' with {
  rstest: 'importActual',
};
import { afterEach, beforeEach, rs } from '@rstest/core';

// Mock us-keyboard-layout FIRST to avoid process.platform access at import time
rs.mock('@midscene/shared/us-keyboard-layout', () => ({
  isMac: false,
  keyMap: {},
  modifierKeys: [],
  _keyCode: 0,
}));

// Mock console methods to avoid noise in tests
rs.spyOn(console, 'warn').mockImplementation(() => {});
rs.spyOn(console, 'error').mockImplementation(() => {});

// Mock problematic dependencies early
rs.mock('@midscene/shared', () => ({
  generateId: rs.fn(() => 'mock-id'),
  sleep: rs.fn(() => Promise.resolve()),
}));

rs.mock('@midscene/shared/img/get-photon', () => ({
  default: rs.fn(),
}));

rs.mock('@midscene/shared/env', () => ({
  ...sharedEnvActual,
  overrideAIConfig: rs.fn(),
  resetAIConfig: rs.fn(),
  globalModelConfigManager: {
    ...sharedEnvActual.globalModelConfigManager,
    getModelConfig: rs.fn(() => ({
      modelName: 'mock-model',
    })),
  },
  globalConfigManager: {
    ...sharedEnvActual.globalConfigManager,
    get: rs.fn(() => ({})),
    set: rs.fn(),
    reset: rs.fn(),
  },
}));

// Mock findAllMidsceneLocatorField to detect locator fields in schema
rs.mock('@midscene/core/ai-model', () => ({
  ...coreAiModelActual,
  findAllMidsceneLocatorField: rs.fn((schema: any) => {
    // Check if schema has a shape with locateField-like keys
    if (schema && typeof schema === 'object' && 'shape' in schema) {
      const shape = schema.shape as Record<string, unknown>;
      if (shape && typeof shape === 'object') {
        return Object.keys(shape).filter(
          (key) =>
            typeof key === 'string' &&
            (key.includes('locate') || key.includes('Locate')),
        );
      }
    }
    return [];
  }),
}));

rs.mock('@midscene/core/agent', () => ({
  ...coreAgentActual,
  Agent: class MockAgent {
    device: any;

    constructor(device: any) {
      this.device = device;
    }

    async aiAssert(prompt: string) {
      console.log(`Mock AI Assert: ${prompt}`);
      return { pass: true, thought: 'Mock assertion passed' };
    }

    async aiQuery(prompt: string) {
      console.log(`Mock AI Query: ${prompt}`);
      return ['mock', 'query', 'result'];
    }

    async aiAct(prompt: unknown) {
      console.log(`Mock AI Action: ${JSON.stringify(prompt)}`);
      return 'Mock action completed';
    }
  },
}));

rs.mock('express', () => {
  const mockExpress = () => ({
    use: rs.fn(),
    get: rs.fn(),
    post: rs.fn(),
    options: rs.fn(),
    delete: rs.fn(),
    listen: rs.fn((...args: any[]) => {
      const callback = args.find((a: any) => typeof a === 'function');
      setTimeout(() => callback?.(), 0);
      return {
        close: rs.fn((callback?: () => void) => {
          setTimeout(() => callback?.(), 0);
        }),
      };
    }),
  });
  mockExpress.static = rs.fn();
  mockExpress.json = rs.fn(() => (req: any, res: any, next: any) => next());
  mockExpress.text = rs.fn(() => (req: any, res: any, next: any) => next());
  return { default: mockExpress };
});

rs.mock('cors', () => ({
  default: rs.fn(() => (req: any, res: any, next: any) => next()),
}));

rs.mock('fs', () => {
  const mockFs = {
    existsSync: rs.fn(() => true),
    readFileSync: rs.fn(() => '{}'),
    writeFileSync: rs.fn(),
    mkdirSync: rs.fn(),
    createWriteStream: rs.fn(() => ({
      write: rs.fn(),
      end: rs.fn(),
      close: rs.fn(),
    })),
  };
  return {
    default: mockFs,
    ...mockFs,
  };
});

// Also mock 'node:fs' since some imports use the new node: protocol
rs.mock('node:fs', () => {
  const mockFs = {
    existsSync: rs.fn(() => true),
    readFileSync: rs.fn(() => '{}'),
    writeFileSync: rs.fn(),
    mkdirSync: rs.fn(),
    createWriteStream: rs.fn(() => ({
      write: rs.fn(),
      end: rs.fn(),
      close: rs.fn(),
    })),
  };
  return {
    default: mockFs,
    ...mockFs,
  };
});

// Global test setup
beforeEach(() => {
  // Reset all mocks before each test
  rs.clearAllMocks();
});

// Clean up after tests
afterEach(() => {
  // Restore console methods
  rs.clearAllMocks();
});

// Mock browser globals for tests that need them
Object.defineProperty(global, 'window', {
  value: {
    location: {
      href: 'http://localhost:3000',
    },
  },
  writable: true,
});

Object.defineProperty(global, 'fetch', {
  value: rs.fn(),
  writable: true,
});
