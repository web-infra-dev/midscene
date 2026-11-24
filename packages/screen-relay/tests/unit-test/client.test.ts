import { describe, expect, it } from '@rstest/core';
import { RelayError } from 'screen-relay';
import { formatScreenRelayError, isRelayError } from '../../src';

describe('client error helpers', () => {
  it('identifies RelayError instances and duck-typed errors', () => {
    expect(isRelayError(new RelayError('busy', 'held'))).toBe(true);
    expect(isRelayError(new Error('plain'))).toBe(false);
    expect(isRelayError('string error')).toBe(false);
  });

  it('formats control_taken and busy errors with actionable guidance', () => {
    const taken = formatScreenRelayError(
      'click(left)',
      new RelayError('control_taken', 'Viewer took control'),
    );
    expect(taken.message).toContain('control_taken');
    expect(taken.message).toContain('Release control in the viewer');

    const busy = formatScreenRelayError('type', new RelayError('busy', 'Busy'));
    expect(busy.message).toContain('busy');
  });

  it('formats unauthorized and forbidden errors with token hint', () => {
    const unauth = formatScreenRelayError(
      'connect',
      new RelayError('unauthorized', 'Bad token'),
    );
    expect(unauth.message).toContain('unauthorized');
    expect(unauth.message).toContain('MIDSCENE_SCREEN_RELAY_TOKEN');

    const forbidden = formatScreenRelayError(
      'connect',
      new RelayError('forbidden', 'Origin rejected'),
    );
    expect(forbidden.message).toContain('forbidden');
  });

  it('passes through generic RelayError, Error, and non-Error values', () => {
    const timeout = formatScreenRelayError(
      'screenshot',
      new RelayError('timeout', 'Timed out'),
    );
    expect(timeout.message).toContain('timeout');
    expect(timeout.message).toContain('Timed out');

    const plain = new Error('boom');
    expect(formatScreenRelayError('click', plain)).toBe(plain);

    const wrapped = formatScreenRelayError('click', 42);
    expect(wrapped.message).toContain('42');
  });
});
