import type { Reporter } from '@rstest/core/api';

/** @internal Prefix used to identify Midscene progress in worker console logs. */
export const yamlProgressLogPrefix = '__MIDSCENE_YAML_PROGRESS__:';

/**
 * Send YAML progress through Rstest's intercepted console channel. The parent
 * process reporter below only forwards messages with this prefix, keeping
 * Rstest's own reporter noise suppressed.
 */
export const emitYamlProgress = (message: string): void => {
  console.log(`${yamlProgressLogPrefix}${message}`);
};

/** @internal Creates the parent-side reporter that forwards YAML progress. */
export const createYamlProgressReporter = (): Reporter => ({
  onUserConsoleLog(log) {
    if (!log.content.startsWith(yamlProgressLogPrefix)) return;

    const message = log.content.slice(yamlProgressLogPrefix.length);
    console.log(message.replace(/\r?\n$/, ''));
  },
});
