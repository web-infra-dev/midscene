import { closeCommand } from '@/commands/close';
import { connectCommand } from '@/commands/connect';
import { doCommand } from '@/commands/do';
import { runCommand } from '@/commands/run';
import { describe, expect, test } from 'vitest';

(global as any).__VERSION__ = '0.0.0-test';

describe('command definitions', () => {
  describe('doCommand', () => {
    test('should have correct command string', () => {
      expect(doCommand.command).toBe('do <command> [args]');
    });

    test('should have a description', () => {
      expect(doCommand.describe).toBe('Execute a single atomic operation');
    });

    test('should have builder and handler functions', () => {
      expect(typeof doCommand.builder).toBe('function');
      expect(typeof doCommand.handler).toBe('function');
    });
  });

  describe('runCommand', () => {
    test('should have correct command string', () => {
      expect(runCommand.command).toBe('run [path]');
    });

    test('should have a description', () => {
      expect(runCommand.describe).toBe('Run a YAML script');
    });

    test('should have builder and handler functions', () => {
      expect(typeof runCommand.builder).toBe('function');
      expect(typeof runCommand.handler).toBe('function');
    });
  });

  describe('connectCommand', () => {
    test('should have correct command string', () => {
      expect(connectCommand.command).toBe('connect');
    });

    test('should have a description', () => {
      expect(connectCommand.describe).toBe(
        'Start or attach to a session (browser/device)',
      );
    });

    test('should have builder and handler functions', () => {
      expect(typeof connectCommand.builder).toBe('function');
      expect(typeof connectCommand.handler).toBe('function');
    });
  });

  describe('closeCommand', () => {
    test('should have correct command string', () => {
      expect(closeCommand.command).toBe('close');
    });

    test('should have a description', () => {
      expect(closeCommand.describe).toBe('Close current session');
    });

    test('should have builder and handler functions', () => {
      expect(typeof closeCommand.builder).toBe('function');
      expect(typeof closeCommand.handler).toBe('function');
    });
  });
});

describe('do command yargs builder', () => {
  test('should define expected positional and options', async () => {
    const yargs = (await import('yargs/yargs')).default;
    const cli = yargs([
      'do', 'act', 'click the button',
      '--bridge',
      '--url', 'https://example.com',
      '--device', 'emulator-5554',
      '--display', '1',
      '--headed',
    ]);
    cli.command({ ...doCommand, handler: () => {} });
    const parsed = await cli.parse();

    expect(parsed.command).toBe('act');
    expect(parsed.args).toBe('click the button');
    expect(parsed.bridge).toBe(true);
    expect(parsed.url).toBe('https://example.com');
    expect(parsed.device).toBe('emulator-5554');
    expect(parsed.display).toBe('1');
    expect(parsed.headed).toBe(true);
  });

  test('should default bridge and headed to false', async () => {
    const yargs = (await import('yargs/yargs')).default;
    const cli = yargs(['do', 'screenshot']);
    cli.command({ ...doCommand, handler: () => {} });
    const parsed = await cli.parse();

    expect(parsed.command).toBe('screenshot');
    expect(parsed.bridge).toBe(false);
    expect(parsed.headed).toBe(false);
  });
});

describe('connect command yargs builder', () => {
  test('should parse connect options', async () => {
    const yargs = (await import('yargs/yargs')).default;
    const cli = yargs([]);
    const built = (connectCommand.builder as Function)(cli);
    const parsed = await built.parse([
      '--bridge',
      '--url', 'https://example.com',
      '--headed',
    ]);

    expect(parsed.bridge).toBe(true);
    expect(parsed.url).toBe('https://example.com');
    expect(parsed.headed).toBe(true);
  });
});

describe('close command yargs builder', () => {
  test('should parse close options', async () => {
    const yargs = (await import('yargs/yargs')).default;
    const cli = yargs([]);
    const built = (closeCommand.builder as Function)(cli);
    const parsed = await built.parse(['--bridge']);

    expect(parsed.bridge).toBe(true);
  });

  test('should default bridge to false', async () => {
    const yargs = (await import('yargs/yargs')).default;
    const cli = yargs([]);
    const built = (closeCommand.builder as Function)(cli);
    const parsed = await built.parse([]);

    expect(parsed.bridge).toBe(false);
  });
});
