import { afterEach, beforeEach, vi } from 'vitest';

// Mock console methods to avoid noise in tests
vi.spyOn(console, 'warn').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

// Mock problematic dependencies early
vi.mock('@midscene/shared', () => ({
  generateId: vi.fn(() => 'mock-id'),
  sleep: vi.fn(() => Promise.resolve()),
}));

vi.mock('@midscene/shared/img/get-photon', () => ({
  default: vi.fn(),
}));

vi.mock('@midscene/shared/env', () => ({
  overrideAIConfig: vi.fn(),
  resetAIConfig: vi.fn(),
  globalConfigManager: {
    get: vi.fn(() => ({})),
    set: vi.fn(),
    reset: vi.fn(),
  },
}));

vi.mock('@midscene/core/ai-model', () => ({
  findAllMidsceneLocatorField: vi.fn(() => ['locateField']),
}));

vi.mock('@midscene/core', () => ({
  Puppeteer: vi.fn(),
  Playwright: vi.fn(),
  createPage: vi.fn(),
}));

vi.mock('@midscene/core/agent', () => ({
  Agent: class MockAgent {
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

    async aiAction(prompt: string) {
      console.log(`Mock AI Action: ${prompt}`);
      return 'Mock action completed';
    }
  },
}));

vi.mock('express', () => {
  const mockExpress = () => ({
    use: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    listen: vi.fn((port: number, callback?: () => void) => {
      setTimeout(() => callback?.(), 0);
      return {
        close: vi.fn((callback?: () => void) => {
          setTimeout(() => callback?.(), 0);
        }),
      };
    }),
  });
  mockExpress.static = vi.fn();
  mockExpress.json = vi.fn(() => (req: any, res: any, next: any) => next());
  return { default: mockExpress };
});

vi.mock('cors', () => ({
  default: vi.fn(() => (req: any, res: any, next: any) => next()),
}));

vi.mock('fs', () => {
  const mockFs = {
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => '{}'),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    createWriteStream: vi.fn(() => ({
      write: vi.fn(),
      end: vi.fn(),
      close: vi.fn(),
    })),
  };
  return {
    default: mockFs,
    ...mockFs,
  };
});

// Also mock 'node:fs' since some imports use the new node: protocol
vi.mock('node:fs', () => {
  const mockFs = {
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => '{}'),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    createWriteStream: vi.fn(() => ({
      write: vi.fn(),
      end: vi.fn(),
      close: vi.fn(),
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
  vi.clearAllMocks();
});

// Clean up after tests
afterEach(() => {
  // Restore console methods
  vi.clearAllMocks();
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
  value: vi.fn(),
  writable: true,
});
