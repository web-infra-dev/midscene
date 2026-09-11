import { describe, expect, test } from '@rstest/core';

import {
  DEFAULT_YADB_PATH,
  buildYadbCommand,
  sendTextInput,
  yadbDirectory,
} from '../../src/transport/text-input';

function createRunRecorder() {
  const commands: Array<{ command: string; label: string }> = [];
  return {
    commands,
    run: async (command: string, label: string) => {
      commands.push({ command, label });
    },
  };
}

describe('yadb command construction', () => {
  test('derives the dex directory from the dex path', () => {
    expect(yadbDirectory('/data/local/tmp/yadb')).toBe('/data/local/tmp');
    expect(yadbDirectory('/app/bin/yadb')).toBe('/app/bin');
    expect(yadbDirectory('yadb')).toBe('/data/local/tmp');
  });

  test('builds the app_process command with a quoted payload', () => {
    const command = buildYadbCommand(DEFAULT_YADB_PATH, '中文 测试');

    expect(command).toBe(
      "app_process -Djava.class.path=/data/local/tmp/yadb /data/local/tmp com.ysbing.yadb.Main -keyboard '中文 测试'",
    );
  });

  test('escapes quotes in the payload', () => {
    const command = buildYadbCommand(DEFAULT_YADB_PATH, "it's 好");

    expect(command).toContain("'it'\\''s 好'");
  });
});

describe('sendTextInput channel selection', () => {
  test('uses input text for printable ASCII without touching yadb', async () => {
    const recorder = createRunRecorder();

    await sendTextInput('hello world', {
      backend: 'rish',
      displayArg: '',
      timeoutMs: 1000,
      yadbAvailable: true,
      yadbPath: DEFAULT_YADB_PATH,
      run: recorder.run,
    });

    expect(recorder.commands).toHaveLength(1);
    expect(recorder.commands[0]?.command).toBe("input text 'hello world'");
  });

  test('splits newlines and commits each line with ENTER', async () => {
    const recorder = createRunRecorder();

    await sendTextInput('line1\nline2', {
      backend: 'adb-shell',
      displayArg: ' -d 0',
      timeoutMs: 1000,
      yadbAvailable: true,
      yadbPath: DEFAULT_YADB_PATH,
      run: recorder.run,
    });

    expect(recorder.commands.map((entry) => entry.command)).toEqual([
      "input -d 0 text 'line1'",
      'input -d 0 keyevent 66',
      "input -d 0 text 'line2'",
    ]);
  });

  test('routes CJK text through yadb when it is available', async () => {
    const recorder = createRunRecorder();

    await sendTextInput('中文输入测试 hello', {
      backend: 'rish',
      displayArg: '',
      timeoutMs: 1000,
      yadbAvailable: true,
      yadbPath: DEFAULT_YADB_PATH,
      run: recorder.run,
    });

    expect(recorder.commands).toHaveLength(1);
    expect(recorder.commands[0]?.label).toBe('yadb text input');
    expect(recorder.commands[0]?.command).toContain('com.ysbing.yadb.Main');
    expect(recorder.commands[0]?.command).toContain("'中文输入测试 hello'");
  });

  test('routes emoji through yadb too', async () => {
    const recorder = createRunRecorder();

    await sendTextInput('🙂', {
      backend: 'adb-shell',
      displayArg: '',
      timeoutMs: 1000,
      yadbAvailable: true,
      yadbPath: DEFAULT_YADB_PATH,
      run: recorder.run,
    });

    expect(recorder.commands[0]?.command).toContain('yadb.Main');
  });

  test('fails loudly with provisioning instructions when yadb is missing', async () => {
    const recorder = createRunRecorder();

    const error = await sendTextInput('中文', {
      backend: 'rish',
      displayArg: '',
      timeoutMs: 1000,
      yadbAvailable: false,
      yadbPath: DEFAULT_YADB_PATH,
      run: recorder.run,
    }).catch((caught: unknown) => caught);

    expect((error as { code?: string }).code).toBe('NotSupported');
    expect((error as Error).message).toContain('adb push');
    expect(recorder.commands).toHaveLength(0);
  });

  test('rejects empty text before running anything', async () => {
    const recorder = createRunRecorder();

    const error = await sendTextInput('', {
      backend: 'rish',
      displayArg: '',
      timeoutMs: 1000,
      yadbAvailable: true,
      yadbPath: DEFAULT_YADB_PATH,
      run: recorder.run,
    }).catch((caught: unknown) => caught);

    expect((error as { code?: string }).code).toBe('InvalidArgument');
    expect(recorder.commands).toHaveLength(0);
  });
});
