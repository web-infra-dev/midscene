import {
  CLIError,
  parseCliArgs,
  parseValue,
  removePrefix,
  runToolsCLI,
} from '@/cli/cli-runner';
import { describe, expect, it, vi } from 'vitest';

describe('parseValue', () => {
  it('parses JSON objects', () => {
    expect(parseValue('{"prompt":"the login button"}')).toEqual({
      prompt: 'the login button',
    });
  });

  it('parses nested JSON objects', () => {
    expect(parseValue('{"a":{"b":1}}')).toEqual({ a: { b: 1 } });
  });

  it('parses JSON arrays', () => {
    expect(parseValue('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('returns string for invalid JSON starting with {', () => {
    expect(parseValue('{not json}')).toBe('{not json}');
  });

  it('returns string for invalid JSON starting with [', () => {
    expect(parseValue('[broken')).toBe('[broken');
  });

  it('parses positive integers', () => {
    expect(parseValue('42')).toBe(42);
  });

  it('parses negative integers', () => {
    expect(parseValue('-5')).toBe(-5);
  });

  it('parses decimals', () => {
    expect(parseValue('3.14')).toBe(3.14);
  });

  it('parses negative decimals', () => {
    expect(parseValue('-2.5')).toBe(-2.5);
  });

  it('parses zero', () => {
    expect(parseValue('0')).toBe(0);
  });

  it('returns string for non-numeric text', () => {
    expect(parseValue('hello')).toBe('hello');
  });

  it('returns string for partial numeric text', () => {
    expect(parseValue('12abc')).toBe('12abc');
  });

  it('returns string for empty string', () => {
    expect(parseValue('')).toBe('');
  });

  it('returns string for URL', () => {
    expect(parseValue('https://example.com')).toBe('https://example.com');
  });
});

describe('parseCliArgs', () => {
  it('parses --key value pairs', () => {
    expect(parseCliArgs(['--url', 'https://example.com'])).toEqual({
      url: 'https://example.com',
    });
  });

  it('parses --key=value format', () => {
    expect(parseCliArgs(['--url=https://example.com'])).toEqual({
      url: 'https://example.com',
    });
  });

  it('parses boolean flags', () => {
    expect(parseCliArgs(['--verbose'])).toEqual({ verbose: true });
  });

  it('parses consecutive boolean flags', () => {
    expect(parseCliArgs(['--verbose', '--debug'])).toEqual({
      verbose: true,
      debug: true,
    });
  });

  it('parses JSON values', () => {
    expect(parseCliArgs(['--locate', '{"prompt":"the login button"}'])).toEqual(
      {
        locate: { prompt: 'the login button' },
      },
    );
  });

  it('parses numeric values', () => {
    expect(parseCliArgs(['--timeout', '30'])).toEqual({ timeout: 30 });
  });

  it('parses mixed arguments', () => {
    expect(
      parseCliArgs([
        '--url',
        'https://example.com',
        '--timeout',
        '30',
        '--verbose',
        '--locate',
        '{"prompt":"button"}',
      ]),
    ).toEqual({
      url: 'https://example.com',
      timeout: 30,
      verbose: true,
      locate: { prompt: 'button' },
    });
  });

  it('ignores non-dashed arguments', () => {
    expect(parseCliArgs(['positional', '--key', 'value'])).toEqual({
      key: 'value',
    });
  });

  it('returns empty object for empty args', () => {
    expect(parseCliArgs([])).toEqual({});
  });

  it('handles --key=value with JSON', () => {
    expect(parseCliArgs(['--locate={"prompt":"btn"}'])).toEqual({
      locate: { prompt: 'btn' },
    });
  });

  it('handles --key=value with number', () => {
    expect(parseCliArgs(['--timeout=30'])).toEqual({ timeout: 30 });
  });

  it('treats trailing flag as boolean', () => {
    expect(parseCliArgs(['--key', 'value', '--flag'])).toEqual({
      key: 'value',
      flag: true,
    });
  });

  it('handles direction-style string values', () => {
    expect(parseCliArgs(['--direction', 'down'])).toEqual({
      direction: 'down',
    });
  });

  it('handles --content with spaces in value', () => {
    expect(parseCliArgs(['--content', 'hello world'])).toEqual({
      content: 'hello world',
    });
  });
});

describe('removePrefix', () => {
  it('removes matching prefix', () => {
    expect(removePrefix('android_connect', 'android_')).toBe('connect');
  });

  it('returns name unchanged when prefix does not match', () => {
    expect(removePrefix('Tap', 'android_')).toBe('Tap');
  });

  it('returns name unchanged when no prefix provided', () => {
    expect(removePrefix('android_connect')).toBe('android_connect');
  });

  it('returns name unchanged when prefix is empty string', () => {
    expect(removePrefix('connect', '')).toBe('connect');
  });

  it('handles take_screenshot without platform prefix', () => {
    expect(removePrefix('take_screenshot', 'android_')).toBe('take_screenshot');
  });
});

describe('CLIError', () => {
  it('has default exitCode of 1', () => {
    const error = new CLIError('test');
    expect(error.message).toBe('test');
    expect(error.exitCode).toBe(1);
  });

  it('accepts custom exitCode', () => {
    const error = new CLIError('test', 2);
    expect(error.exitCode).toBe(2);
  });

  it('is instanceof Error', () => {
    expect(new CLIError('test')).toBeInstanceOf(Error);
  });
});

describe('runToolsCLI', () => {
  function createMockTools(
    definitions: Array<{
      name: string;
      handler: (args: Record<string, unknown>) => Promise<unknown>;
    }>,
  ) {
    return {
      initTools: vi.fn().mockResolvedValue(undefined),
      getToolDefinitions: vi.fn().mockReturnValue(
        definitions.map((d) => ({
          name: d.name,
          description: `${d.name} command`,
          schema: {},
          handler: d.handler,
        })),
      ),
    } as any;
  }

  it('prints help when no command given', async () => {
    const tools = createMockTools([]);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runToolsCLI(tools, 'test-cli', { argv: [] });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('prints help for --help flag', async () => {
    const tools = createMockTools([]);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runToolsCLI(tools, 'test-cli', { argv: ['--help'] });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  function createDetailedMockTools() {
    return {
      initTools: vi.fn().mockResolvedValue(undefined),
      getToolDefinitions: vi.fn().mockReturnValue([
        {
          name: 'connect',
          description: 'Connect to a device for automation',
          schema: {
            url: { description: 'The device URL to connect to' },
            timeout: { description: 'Connection timeout in ms' },
          },
          handler: vi.fn(),
        },
        {
          name: 'disconnect',
          description: 'Disconnect from the current device',
          schema: {},
          handler: vi.fn(),
        },
        {
          name: 'take_screenshot',
          description: 'Capture a screenshot of the current screen',
          schema: {
            format: { description: 'Image format (png or jpg)' },
          },
          handler: vi.fn(),
        },
        {
          name: 'tap',
          description: 'Tap on a specific element or coordinate on the screen',
          schema: {
            locate: { description: 'Locator JSON to find the element' },
            x: { description: 'X coordinate to tap' },
            y: { description: 'Y coordinate to tap' },
          },
          handler: vi.fn(),
        },
      ]),
    } as any;
  }

  it('--help output matches snapshot', async () => {
    const tools = createDetailedMockTools();
    const lines: string[] = [];
    const consoleSpy = vi
      .spyOn(console, 'log')
      .mockImplementation((...args: any[]) => {
        lines.push(args.map(String).join(' '));
      });

    await runToolsCLI(tools, 'test-cli', { argv: ['--help'] });

    expect(lines.join('\n')).toMatchSnapshot();
    consoleSpy.mockRestore();
  });

  it('command --help output matches snapshot', async () => {
    const tools = createDetailedMockTools();
    const lines: string[] = [];
    const consoleSpy = vi
      .spyOn(console, 'log')
      .mockImplementation((...args: any[]) => {
        lines.push(args.map(String).join(' '));
      });

    await runToolsCLI(tools, 'test-cli', {
      argv: ['connect', '--help'],
    });

    expect(lines.join('\n')).toMatchSnapshot();
    consoleSpy.mockRestore();
  });

  it('throws CLIError for unknown command', async () => {
    const tools = createMockTools([
      {
        name: 'connect',
        handler: async () => ({ content: [], isError: false }),
      },
    ]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(
      runToolsCLI(tools, 'test-cli', { argv: ['unknown'] }),
    ).rejects.toThrow(CLIError);

    vi.restoreAllMocks();
  });

  it('executes matched command with parsed args', async () => {
    const handler = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Connected' }],
      isError: false,
    });
    const tools = createMockTools([{ name: 'test_connect', handler }]);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runToolsCLI(tools, 'test-cli', {
      stripPrefix: 'test_',
      argv: ['connect', '--url', 'https://example.com'],
    });

    expect(handler).toHaveBeenCalledWith({ url: 'https://example.com' });
    expect(consoleSpy).toHaveBeenCalledWith('Connected');
    consoleSpy.mockRestore();
  });

  it('strips platform prefix from command names', async () => {
    const handler = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      isError: false,
    });
    const tools = createMockTools([{ name: 'android_disconnect', handler }]);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await runToolsCLI(tools, 'test-cli', {
      stripPrefix: 'android_',
      argv: ['disconnect'],
    });

    expect(handler).toHaveBeenCalledWith({});
    vi.restoreAllMocks();
  });

  it('throws CLIError when command handler returns error', async () => {
    const handler = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Something went wrong' }],
      isError: true,
    });
    const tools = createMockTools([{ name: 'fail_cmd', handler }]);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      runToolsCLI(tools, 'test-cli', {
        stripPrefix: '',
        argv: ['fail_cmd'],
      }),
    ).rejects.toThrow(CLIError);

    vi.restoreAllMocks();
  });

  it('matches commands case-insensitively', async () => {
    const handler = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'tapped' }],
      isError: false,
    });
    const tools = createMockTools([{ name: 'Tap', handler }]);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    // Uppercase tool name should match lowercase user input
    await runToolsCLI(tools, 'test-cli', { argv: ['tap'] });
    expect(handler).toHaveBeenCalled();

    handler.mockClear();

    // Also works with original casing
    await runToolsCLI(tools, 'test-cli', { argv: ['Tap'] });
    expect(handler).toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it('displays command names as lowercase in help', async () => {
    const tools = createMockTools([
      {
        name: 'Tap',
        handler: vi.fn().mockResolvedValue({ content: [], isError: false }),
      },
      {
        name: 'Scroll',
        handler: vi.fn().mockResolvedValue({ content: [], isError: false }),
      },
    ]);
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: any[]) => {
      lines.push(args.map(String).join(' '));
    });

    await runToolsCLI(tools, 'test-cli', { argv: ['--help'] });

    const output = lines.join('\n');
    // Command names should be lowercase
    expect(output).toContain('  tap');
    expect(output).toContain('  scroll');
    // Command names column should not have uppercase originals
    const commandLines = output.split('\n').filter((l) => l.startsWith('  '));
    for (const line of commandLines) {
      const cmdName = line.trimStart().split(/\s{2,}/)[0];
      expect(cmdName).toBe(cmdName.toLowerCase());
    }

    vi.restoreAllMocks();
  });

  it('shows command help with --help after command name', async () => {
    const handler = vi.fn();
    const tools = createMockTools([{ name: 'connect', handler }]);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runToolsCLI(tools, 'test-cli', {
      argv: ['connect', '--help'],
    });

    expect(handler).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
