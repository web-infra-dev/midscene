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

  it('puts the failed node beside metadata and shows the original stack first in one region', () => {
    const error: TestRunReportError = {
      name: 'NodeExecutionError',
      code: 'NODE_EXECUTION_ERROR',
      message: 'work failed',
      details: { value: { node: 'demo.fail' } },
      stack: 'NodeExecutionError: work failed\n    at wrapper (runner.ts:20:3)',
      cause: {
        name: 'Error',
        message: 'work failed',
        stack: 'Error: work failed\n    at original (user-code.ts:12:3)',
      },
    };
    const html = renderToStaticMarkup(
      <ErrorDetails error={error} hideMessage />,
    );
    expect(html).toContain('<dt>Failed node</dt><dd>demo.fail</dd>');
    expect(html.indexOf('Failed node')).toBeLessThan(html.indexOf('</dl>'));
    expect(html).not.toContain('&quot;node&quot;');
    expect(html.match(/aria-label="Error stack traces"/g)).toHaveLength(1);
    expect(html).toContain('Original error stack');
    expect(html).toContain('Framework stack trace');
    expect(html.indexOf('user-code.ts:12:3')).toBeLessThan(
      html.indexOf('runner.ts:20:3'),
    );
    expect(html.match(/user-code.ts:12:3/g)).toHaveLength(1);
    expect(html.match(/runner.ts:20:3/g)).toHaveLength(1);
    expect(html).not.toContain('<h5>Cause</h5>');
  });

  it('keeps intermediate causes and additional diagnostics without duplicating stacks', () => {
    const error: TestRunReportError = {
      name: 'NodeExecutionError',
      message: 'work failed',
      stack: 'framework-stack',
      details: {
        value: { node: 'demo.fail', timeoutMs: 1000 },
        truncatedPaths: ['$.output'],
      },
      cause: {
        name: 'DeviceError',
        message: 'work failed',
        code: 'DEVICE_FAILED',
        stack: 'device-stack',
        details: { value: { device: 'phone' } },
        cause: {
          name: 'Error',
          message: 'work failed',
          stack: 'original-stack',
        },
      },
    };
    const html = renderToStaticMarkup(
      <ErrorDetails error={error} hideMessage />,
    );
    expect(html.match(/aria-label="Error stack traces"/g)).toHaveLength(1);
    expect(html.indexOf('original-stack')).toBeLessThan(
      html.indexOf('device-stack'),
    );
    expect(html.indexOf('device-stack')).toBeLessThan(
      html.indexOf('framework-stack'),
    );
    expect(html.match(/original-stack/g)).toHaveLength(1);
    expect(html.match(/device-stack/g)).toHaveLength(1);
    expect(html).toContain('DEVICE_FAILED');
    expect(html).toContain('phone');
    expect(html).toContain('timeoutMs');
    expect(html).toContain('$.output');
  });

  it('keeps a non-string node as diagnostic data', () => {
    const html = renderToStaticMarkup(
      <ErrorDetails
        error={{
          name: 'Error',
          message: 'work failed',
          details: { value: { node: { id: 'custom' } } },
        }}
      />,
    );
    expect(html).not.toContain('<dt>Failed node</dt>');
    expect(html).toContain('&quot;node&quot;');
    expect(html).toContain('custom');
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
