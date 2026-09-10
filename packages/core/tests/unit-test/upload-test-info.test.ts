import { uploadTestInfoToServer } from '@/utils';
import { afterEach, describe, expect, it, rs } from '@rstest/core';

// Reproduce running outside a Git repository, with no configured email.
rs.mock('node:child_process', () => ({
  execFile: Object.assign(rs.fn(), {
    [Symbol.for('nodejs.util.promisify.custom')]: rs.fn(async () => {
      throw new Error('git config is unavailable');
    }),
  }),
}));

const REPORT = {
  serverUrl: 'https://reports.example.test/upload',
  testUrl: '',
  reportFileName: 'test.html',
  reportHtml: '<html>complete report</html>',
};

describe('uploadTestInfoToServer', () => {
  afterEach(() => {
    rs.restoreAllMocks();
  });

  it('uploads report content without repository, email, or test URL', async () => {
    const fetchMock = rs
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    await uploadTestInfoToServer(REPORT);
    const request = fetchMock.mock.calls[0][1];
    expect(JSON.parse(String(request?.body))).toEqual({
      repo_url: '',
      user_email: '',
      test_url: '',
      report_file_name: 'test.html',
      report_html: REPORT.reportHtml,
    });
    expect(request?.signal).toBeInstanceOf(AbortSignal);
  });

  it('does not send a request without a server URL', async () => {
    const fetchMock = rs.spyOn(globalThis, 'fetch');
    await uploadTestInfoToServer({ ...REPORT, serverUrl: undefined });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects non-success HTTP responses', async () => {
    rs.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 503 }),
    );
    await expect(uploadTestInfoToServer(REPORT)).rejects.toThrow('HTTP 503');
  });
});
