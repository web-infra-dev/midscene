import { useNavigate } from '@modern-js/runtime/router';
import React, { useEffect, useState } from 'react';
import { Menu, Collapse } from 'antd';
import type { MenuProps, CollapseProps } from 'antd';
import styeld from './Home.module.css';
import './TestResult.css';

// const testDataList = [
//   {
//     testId: '45161835cecba6378a04-b2821fd5751102caa08c',
//     title: 'ai todo',
//     status: 'passed',
//     duration: 13245,
//     location: {
//       file: '/Users/bytedance/github/midscene/packages/web-integration/tests/e2e/ai-auto-todo.spec.ts',
//       line: 8,
//       column: 5,
//     },
//     dumpPath:
//       '/Users/bytedance/github/midscene/packages/web-integration/midscene_run/playwright-73776.web-dump.json',
//   },
//   {
//     testId: '31de72c0afc13db9dc09-50c9ddc9a1d0c466547f',
//     title: 'ai order2',
//     status: 'passed',
//     duration: 21461,
//     location: {
//       file: '/Users/bytedance/github/midscene/packages/web-integration/tests/e2e/ai-xicha.spec.ts',
//       line: 36,
//       column: 5,
//     },
//     dumpPath:
//       '/Users/bytedance/github/midscene/packages/web-integration/midscene_run/playwright-73777.web-dump.json',
//   },
//   {
//     testId: '31de72c0afc13db9dc09-00e11f768b63da0c779a',
//     title: 'ai order',
//     status: 'failed',
//     duration: 79536,
//     location: {
//       file: '/Users/bytedance/github/midscene/packages/web-integration/tests/e2e/ai-xicha.spec.ts',
//       line: 9,
//       column: 5,
//     },
//     dumpPath:
//       '/Users/bytedance/github/midscene/packages/web-integration/midscene_run/playwright-73778.web-dump.json',
//   },
// ];

type TestStatus = 'passed' | 'failed' | 'flaky' | 'skipped';

type TestData = {
  testId: string;
  title: string;
  status: string;
  duration: number;
  location: {
    file: string;
    line: number;
    column: number;
  };
  dumpPath: string;
};

type MenuItem = Required<MenuProps>['items'][number];
export type Stats = {
  total: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  ok: boolean;
};

const statusIcon = (status: TestStatus) => {
  switch (status) {
    case 'failed':
      return <span className="failed">❌</span>;
    case 'flaky':
      return <span className="flaky">⚠️</span>;
    default:
      return '';
  }
};

const TestResult = (props: {
  status: string;
  statusDataList: {
    [status: string]: TestData[];
  };
}) => {
  const navigator = useNavigate();
  const onChange = (key: string | string[]) => {
    console.log(key);
  };

  const testDataList =
    props.status === 'all'
      ? Object.keys(props.statusDataList).reduce((res, status) => {
          res.push(...props.statusDataList[status]);
          return res;
        }, [] as TestData[])
      : props.statusDataList[props.status];
  const groupTestDataWithFileName =
    testDataList?.reduce(
      (res, next) => {
        if (!res[next.location.file]) {
          res[next.location.file] = [];
        }
        res[next.location.file].push(next);
        return res;
      },
      {} as {
        [fileName: string]: TestData[];
      },
    ) || {};

  const items: CollapseProps['items'] = Object.keys(groupTestDataWithFileName).map((fileName, key) => {
    return {
      key,
      label: fileName,
      children: groupTestDataWithFileName[fileName].map((testData, key) => {
        const timeMinutes = Math.floor(testData.duration / 1000 / 60);
        const timeSeconds = (testData.duration / 1000) % 60;
        return (
          <div
            className={styeld['test-details']}
            key={key}
            onClick={() => {
              navigator(`/report?dumpId=${testData.dumpPath.split('/').pop()}`);
            }}
          >
            <div className={styeld['test-info']}>
              <span className={styeld['test-name']}>
                {statusIcon(testData.status as TestStatus)}
                {testData.title}
              </span>
              <span>
                持续时间: {timeMinutes !== 0 && `${timeMinutes}m`} {timeSeconds && `${timeSeconds}s`}
              </span>
            </div>
            <div className={styeld['test-file-path']}>
              {testData.location.file}:{testData.location.line}
            </div>
          </div>
        );
      }),
    };
  });
  return (
    <Collapse
      className={styeld['test-result']}
      activeKey={[...Array(items.length).keys()]}
      items={items}
      onChange={onChange}
    />
  );
};

export const StatsNavView: React.FC<{
  stats: Stats;
  statusDataList: {
    [stats: string]: TestData[];
  };
}> = ({ stats, statusDataList }) => {
  // eslint-disable-next-line node/prefer-global/url-search-params
  const searchParams = new URLSearchParams(window.location.search);
  const navigate = useNavigate();
  const q = searchParams.get('status')?.toString() || '';
  const items: MenuItem[] = [
    {
      label: `All (${stats.total - stats.skipped})`,
      key: 'all',
    },
    {
      label: `Passed (${stats.passed})`,
      key: 'passed',
    },
    {
      label: `Failed (${stats.failed})`,
      key: 'failed',
      icon: statusIcon('failed'),
    },
    {
      label: `Flaky (${stats.flaky})`,
      key: 'flaky',
      icon: statusIcon('flaky'),
    },
    {
      label: `Skipped (${stats.skipped})`,
      key: 'skipped',
      icon: statusIcon('skipped'),
    },
  ];

  const [status, setStatus] = useState(q || 'all');

  const onClick: MenuProps['onClick'] = (e) => {
    navigate(`?status=${e.key}`);
    setStatus(e.key);
  };

  return (
    <>
      <div className={styeld.nav}>
        <Menu onClick={onClick} selectedKeys={[status]} mode="horizontal" items={items} />
      </div>
      <TestResult status={status} statusDataList={statusDataList} />
    </>
  );
};

export function Home() {
  const [testDataList, setTestDataJson] = useState<Array<TestData>>([]);
  const [isLoading, setLoading] = useState<any>(true);
  useEffect(() => {
    fetch('/test-data-list.json')
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        setTestDataJson(data['test-list']);
        console.log('data', data); // 在此处处理 JSON 数据
      })
      .catch((error) => console.error('Error:', error))
      .finally(() => {
        setLoading(false);
      });
  }, []);

  function TestResultReport() {
    const statusDataList = testDataList?.reduce(
      (res, next) => {
        res[next.status] = [...(res[next.status] || []), next];
        return res;
      },
      {} as {
        [stats: string]: Array<TestData>;
      },
    );
    console.log('statusDataList', testDataList, statusDataList);
    const total = testDataList.length;
    const passed = statusDataList.passed?.length || 0;
    const failed = statusDataList.failed?.length || 0;
    const flaky = statusDataList.flaky?.length || 0;
    const skipped = statusDataList.skipped?.length || 0;
    const ok = Boolean(total === passed);

    return (
      <div className={styeld.container}>
        <StatsNavView stats={{ total, passed, failed, flaky, skipped, ok }} statusDataList={statusDataList} />
      </div>
    );
  }
  return <>{!isLoading && <TestResultReport />}</>;
}
