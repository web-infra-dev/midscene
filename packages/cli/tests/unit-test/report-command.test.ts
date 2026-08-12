import { describe, expect, it } from 'vitest';
import { normalizeReportCommandArgs } from '../../src/report-command';

describe('normalizeReportCommandArgs', () => {
  it('maps the positional analyze report path to htmlPath', () => {
    expect(
      normalizeReportCommandArgs([
        'analyze',
        './report.html',
        '--output-dir',
        './actions',
      ]),
    ).toEqual([
      'analyze',
      '--htmlPath',
      './report.html',
      '--output-dir',
      './actions',
    ]);
  });

  it('preserves the explicit htmlPath form', () => {
    expect(
      normalizeReportCommandArgs(['analyze', '--htmlPath', './report.html']),
    ).toEqual(['analyze', '--htmlPath', './report.html']);
  });

  it('does not change other commands', () => {
    expect(
      normalizeReportCommandArgs([
        'report-tool',
        '--htmlPath',
        './report.html',
      ]),
    ).toEqual(['report-tool', '--htmlPath', './report.html']);
  });
});
