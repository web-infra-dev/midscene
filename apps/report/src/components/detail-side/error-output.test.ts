import { describe, expect, it } from '@rstest/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ErrorCard, getTaskErrorDisplay } from './error-output';

describe('getTaskErrorDisplay', () => {
  it('separates the user-facing message from technical stack details', () => {
    expect(
      getTaskErrorDisplay({
        errorMessage: 'Assertion failed: button should be visible',
        error: {
          name: 'Error',
          message: 'lower-level assertion error',
        },
        errorStack:
          'Error: Assertion failed: button should be visible\n    at ScriptPlayer.playFlowItem',
      }),
    ).toEqual({
      message: 'Assertion failed: button should be visible',
      stack:
        'Error: Assertion failed: button should be visible\n    at ScriptPlayer.playFlowItem',
    });
  });

  it('falls back to the serialized error message and stack', () => {
    expect(
      getTaskErrorDisplay({
        error: {
          name: 'Error',
          message: 'runner failed',
          stack: 'Error: runner failed\n    at runTask',
        },
      }),
    ).toEqual({
      message: 'runner failed',
      stack: 'Error: runner failed\n    at runTask',
    });
  });

  it('does not repeat a stack already contained in the message', () => {
    const stack = 'Error: runner failed\n    at runTask';
    expect(
      getTaskErrorDisplay({ errorMessage: stack, errorStack: stack }),
    ).toEqual({ message: stack, stack: undefined });
  });

  it('returns null when the task has no error data', () => {
    expect(getTaskErrorDisplay(undefined)).toBeNull();
    expect(getTaskErrorDisplay({})).toBeNull();
  });

  it('renders technical details collapsed by default', () => {
    const html = renderToStaticMarkup(
      createElement(ErrorCard, {
        error: {
          message: 'runner failed',
          stack: 'Error: runner failed\n    at runTask',
        },
      }),
    );

    expect(html).toContain('runner failed');
    expect(html).toContain('technical details');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('hidden=""');
    expect(html).toContain('at runTask');
  });
});
