import type { TestRunReportError } from '@midscene/core';
import { describe, expect, it } from '@rstest/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { ErrorCards } from './error-card';
import { ErrorDetails, hasErrorDetails } from './error-details';

describe('error stack details', () => {
  it('keeps a plain Error stack inside a closed details disclosure', () => {
    const error: TestRunReportError = {
      name: 'Error',
      message: 'work failed',
      stack: 'Error: work failed\n    at execute (user-config.ts:42:5)',
    };
    expect(hasErrorDetails(error)).toBe(true);
    const html = renderToStaticMarkup(
      <ErrorCards
        label="Step issues"
        issues={[
          {
            id: 'failure',
            severity: 'error',
            code: 'Error',
            message: error.message,
            error,
          },
        ]}
      />,
    );
    const detailsStart = html.indexOf('<details class="runner-error-details"');
    expect(detailsStart).toBeGreaterThan(-1);
    expect(html).not.toMatch(/<details[^>]*\bopen(?:[=\s>])/);
    expect(html.indexOf('Stack trace')).toBeGreaterThan(detailsStart);
    expect(html.indexOf('user-config.ts:42:5')).toBeGreaterThan(detailsStart);
    expect(html.indexOf('user-config.ts:42:5')).toBeLessThan(
      html.indexOf('</details>'),
    );
    expect(html).toContain('Copy issue details');
  });

  it('shows cause and related stacks even when their messages match the summary', () => {
    const error: TestRunReportError = {
      name: 'Error',
      message: 'work failed',
      cause: {
        name: 'TypeError',
        message: 'work failed',
        stack: 'TypeError: work failed\n    at original (user-code.ts:12:3)',
      },
      errors: [
        {
          name: 'Error',
          message: 'work failed',
          stack: 'Error: work failed\n    at related (cleanup.ts:5:7)',
        },
      ],
    };
    const html = renderToStaticMarkup(
      <ErrorDetails error={error} hideMessage summaryMessage="work failed" />,
    );
    expect(html).toContain('Cause');
    expect(html).toContain('user-code.ts:12:3');
    expect(html).toContain('Related errors (1)');
    expect(html).toContain('cleanup.ts:5:7');
  });

  it('renders stack text safely and leaves errors without stacks unchanged', () => {
    const error = { name: 'Error', message: 'work failed' };
    expect(hasErrorDetails(error)).toBe(false);
    expect(renderToStaticMarkup(<ErrorDetails error={error} />)).not.toContain(
      'Stack trace',
    );
    const html = renderToStaticMarkup(
      <ErrorDetails error={{ ...error, stack: '<script>alert(1)</script>' }} />,
    );
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });
});
