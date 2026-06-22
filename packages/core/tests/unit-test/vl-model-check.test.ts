import { Agent } from '@/agent/agent';
import type { AbstractInterface } from '@/device';
import { describe, expect, it, rs } from '@rstest/core';

// Mock dependencies
rs.mock('@midscene/core/utils', () => ({
  writeLogFile: rs.fn(() => null),
  reportHTMLContent: rs.fn(() => ''),
  stringifyDumpData: rs.fn(() => '{}'),
  groupedActionDumpFileExt: '.json',
  getVersion: () => '0.0.0-test',
  sleep: rs.fn(() => Promise.resolve()),
}));

rs.mock('@midscene/shared/logger', () => ({
  getDebug: rs.fn(() => rs.fn()),
  logMsg: rs.fn(),
}));

rs.mock('@midscene/core', async () => {
  const actual = await rs.importActual('@midscene/core');
  return {
    ...actual,
    Insight: rs.fn().mockImplementation(() => ({})),
  };
});

const mockedModelConfig = {
  MIDSCENE_MODEL_NAME: 'gpt-4o',
  MIDSCENE_MODEL_API_KEY: 'mock-api-key',
  MIDSCENE_MODEL_BASE_URL: 'mock-base-url',
};

const createMockInterface = (
  interfaceType: AbstractInterface['interfaceType'],
) =>
  ({
    interfaceType,
    destroy: rs.fn(),
    size: rs.fn().mockResolvedValue({}),
    actionSpace: rs.fn(() => []),
  }) as unknown as AbstractInterface;

describe('VL Model Check for Different Interface Types', () => {
  it('should default persistExecutionDump to false', () => {
    const mockPage = createMockInterface('puppeteer');
    const agent = new Agent(mockPage, {
      modelConfig: mockedModelConfig,
    });

    expect(agent.opts.persistExecutionDump).toBe(false);
  });

  it('should throw when persistExecutionDump is true and generateReport is false', () => {
    const mockPage = createMockInterface('puppeteer');

    expect(() => {
      new Agent(mockPage, {
        generateReport: false,
        persistExecutionDump: true,
        modelConfig: mockedModelConfig,
      });
    }).toThrow(
      'persistExecutionDump cannot be true when generateReport is false',
    );
  });

  it('should not require VL model for puppeteer interface', () => {
    const mockPage = createMockInterface('puppeteer');

    expect(() => {
      new Agent(mockPage, {
        generateReport: false,
        modelConfig: mockedModelConfig,
      });
    }).not.toThrow();
  });

  it('should not require VL model for playwright interface', () => {
    const mockPage = createMockInterface('playwright');

    expect(() => {
      new Agent(mockPage, {
        generateReport: false,
        modelConfig: mockedModelConfig,
      });
    }).not.toThrow();
  });

  it('should not require VL model for chrome-extension-proxy interface', () => {
    const mockPage = createMockInterface('chrome-extension-proxy');

    expect(() => {
      new Agent(mockPage, {
        generateReport: false,
        modelConfig: mockedModelConfig,
      });
    }).not.toThrow();
  });

  it('should not require VL model for page-over-chrome-extension-bridge interface', () => {
    const mockPage = createMockInterface('page-over-chrome-extension-bridge');

    expect(() => {
      new Agent(mockPage, {
        generateReport: false,
        modelConfig: mockedModelConfig,
      });
    }).not.toThrow();
  });

  it('should not require VL model for static interface', () => {
    const mockPage = createMockInterface('static');

    expect(() => {
      new Agent(mockPage, {
        generateReport: false,
        modelConfig: mockedModelConfig,
      });
    }).not.toThrow();
  });

  it('should defer VL model check for android interface until getting UI context', async () => {
    const mockPage = createMockInterface('android');

    const agent = new Agent(mockPage, {
      generateReport: false,
      modelConfig: mockedModelConfig,
    });

    await expect(agent.getUIContext()).rejects.toThrow(
      /MIDSCENE_MODEL_FAMILY is not set/,
    );
  });

  it('should not throw error for android interface with VL model configured', () => {
    const mockPage = createMockInterface('android');

    const modelConfigWithVL = {
      MIDSCENE_MODEL_NAME: 'gemini-2.0-flash-exp',
      MIDSCENE_MODEL_API_KEY: 'mock-api-key',
      MIDSCENE_MODEL_BASE_URL: 'mock-base-url',
      MIDSCENE_MODEL_FAMILY: 'gemini',
    };

    expect(() => {
      new Agent(mockPage, {
        generateReport: false,
        modelConfig: modelConfigWithVL,
      });
    }).not.toThrow();
  });
});
