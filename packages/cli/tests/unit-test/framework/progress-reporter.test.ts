import {
  createYamlProgressReporter,
  emitYamlProgress,
  yamlProgressLogPrefix,
} from '@/framework/progress-reporter';
import { afterEach, describe, expect, rs, test } from '@rstest/core';

describe('YAML progress reporter', () => {
  afterEach(() => {
    rs.restoreAllMocks();
  });

  test('emits progress with an internal marker', () => {
    const consoleLog = rs.spyOn(console, 'log').mockImplementation(() => {});

    emitYamlProgress('  ◌ login');

    expect(consoleLog).toHaveBeenCalledWith(
      `${yamlProgressLogPrefix}  ◌ login`,
    );
  });

  test('prints only marked worker progress without the internal marker', () => {
    const consoleLog = rs.spyOn(console, 'log').mockImplementation(() => {});
    const reporter = createYamlProgressReporter();

    reporter.onUserConsoleLog?.({
      content: `${yamlProgressLogPrefix}◌ login.yaml\n  ◌ open login page\r\n`,
    } as never);
    reporter.onUserConsoleLog?.({ content: 'Rstest internal output' } as never);

    expect(consoleLog).toHaveBeenCalledTimes(1);
    expect(consoleLog).toHaveBeenCalledWith(
      '◌ login.yaml\n  ◌ open login page',
    );
  });
});
