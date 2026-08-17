import { join } from 'node:path';
import { pendingContextTaskListSummary, resolveIsTTY } from '@/printer';
import { describe, expect, it } from 'vitest';

describe('resolveIsTTY', () => {
  it('returns true on a real interactive TTY', () => {
    expect(resolveIsTTY({}, true)).toBe(true);
  });

  it('returns false when stdout is not a TTY', () => {
    expect(resolveIsTTY({}, undefined)).toBe(false);
    expect(resolveIsTTY({}, false)).toBe(false);
  });

  it('falls back to non-TTY for the explicit opt-out flag', () => {
    expect(resolveIsTTY({ MIDSCENE_CLI_LOG_ON_NON_TTY: '1' }, true)).toBe(
      false,
    );
  });

  it('honors standard non-interactive signals even with an allocated TTY', () => {
    expect(resolveIsTTY({ NO_COLOR: '1' }, true)).toBe(false);
    expect(resolveIsTTY({ TERM: 'dumb' }, true)).toBe(false);
    expect(resolveIsTTY({ CI: 'true' }, true)).toBe(false);
  });

  it('does not treat TERM=xterm as non-interactive', () => {
    expect(resolveIsTTY({ TERM: 'xterm-256color' }, true)).toBe(true);
  });
});

describe('pendingContextTaskListSummary', () => {
  it('renders queued YAML tasks before their player is created', () => {
    const summary = pendingContextTaskListSummary(
      join(process.cwd(), 'queued.yaml'),
      [
        { name: 'Prepare state', flow: [] },
        { name: 'Verify state', flow: [] },
      ],
    );

    expect(summary).toContain('queued.yaml');
    expect(summary).toContain('Prepare state');
    expect(summary).toContain('Verify state');
    expect(summary.match(/◌/g)).toHaveLength(3);
  });
});
