/** @rstest-environment jsdom */
import { hydrateDirectoryReport } from '@/utils/directory-report';
import { beforeEach, describe, expect, it, rs } from '@rstest/core';

const manifest = {
  schemaVersion: 1,
  kind: 'agent',
  status: 'complete',
  reportId: 'run',
  entry: 'index.html',
  groups: [
    {
      id: 'group',
      attributes: { playwright_test_title: '登录 → 首页' },
      dumps: ['data/run/1.json', 'data/run/2.json'],
    },
  ],
  runner: 'data/run/runner.json',
};
const files: Record<string, unknown> = {
  'report.json': manifest,
  'data/run/1.json': {
    executions: [{ id: 'step-1', tasks: [{ error: 'login failed' }] }],
  },
  'data/run/2.json': {
    executions: [{ id: 'step-2', tasks: [] }],
    modelBriefs: [{ modelName: 'model' }],
  },
  'data/run/runner.json': { schemaVersion: 1, cases: [] },
};

beforeEach(() => {
  document.head.innerHTML =
    '<base href="https://reports.example/moved/report/">';
  document.body.innerHTML =
    '<script type="midscene_report_artifact">"report.json"</script>';
});

const fetchFiles = () =>
  rs.fn(async (url: string | URL | Request) => {
    const path = new URL(String(url)).pathname.replace('/moved/report/', '');
    return new Response(JSON.stringify(files[path]), {
      status: files[path] ? 200 : 404,
    });
  });

describe('directory report loading', () => {
  it('loads groups, metadata and runner relative to a relocated report', async () => {
    const fetcher = fetchFiles();
    await hydrateDirectoryReport(document, fetcher);
    const dumps = [
      ...document.querySelectorAll('script[type="midscene_web_dump"]'),
    ];
    expect(dumps).toHaveLength(2);
    expect(JSON.parse(dumps[0].textContent!)).toEqual(files['data/run/1.json']);
    expect(
      decodeURIComponent(dumps[0].getAttribute('playwright_test_title')!),
    ).toBe('登录 → 首页');
    expect(
      JSON.parse(
        document.querySelector('script[type="midscene_test_run_dump"]')!
          .textContent!,
      ),
    ).toEqual(files['data/run/runner.json']);
    expect(
      fetcher.mock.calls.every(([url]) =>
        String(url).startsWith('https://reports.example/moved/report/'),
      ),
    ).toBe(true);
    await hydrateDirectoryReport(document, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('reports missing data without publishing partial groups and allows retry', async () => {
    const fetcher = fetchFiles();
    const broken = rs.fn(async (url: string | URL | Request) =>
      String(url).endsWith('/2.json')
        ? new Response('', { status: 404 })
        : fetcher(url),
    );
    await expect(hydrateDirectoryReport(document, broken)).rejects.toThrow(
      '2.json: HTTP 404',
    );
    expect(
      document.querySelectorAll('script[type="midscene_web_dump"]'),
    ).toHaveLength(0);
    await hydrateDirectoryReport(document, fetcher);
    expect(
      document.querySelectorAll('script[type="midscene_web_dump"]'),
    ).toHaveLength(2);
  });

  it('keeps inline reports offline and prevents publishing after cancellation', async () => {
    const fetcher = fetchFiles();
    const controller = new AbortController();
    controller.abort();
    await expect(
      hydrateDirectoryReport(document, fetcher, controller.signal),
    ).rejects.toThrow();
    expect(
      document.querySelectorAll('script[type="midscene_web_dump"]'),
    ).toHaveLength(0);
    document.body.innerHTML =
      '<script type="midscene_web_dump">{"executions":[]}</script>';
    await hydrateDirectoryReport(document, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
